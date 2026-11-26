import { checkAppCheck } from './_lib/appcheck.js';
import { preflight, withCors } from './_lib/cors.js';
import { json, readJson } from './_lib/http.js';
import { isCardId } from './_lib/ids.js';
import { allow, clientIp, ipKey } from './_lib/limits.js';
import { loadKeyRing, verifySigned } from './_lib/signing.js';
import type { BoardEntry, BoardRange } from './_lib/shared.js';
import { BOARD_PAGE, BOARD_REFUSAL, BOARD_SCORING, boardEligibility, boardEntryFrom, checkAgentName, rankBoard, reconcileBoardEntry } from './_lib/shared.js';
import type { Store } from './_lib/store.js';
import { getStore } from './_lib/store.js';

/** How many recent entries are ranked. The board is small; this keeps reads cheap. */
const SCAN = 500;

/**
 * Entries written before scoring v2 are re-checked against their signed card:
 * re-scored under the current rules, or taken off the board when they rest
 * on a pasted reply (or no longer have a valid test). The fix is written
 * back, so each old entry is migrated once.
 */
export async function currentBoard(store: Store, scan: number): Promise<BoardEntry[]> {
  const stored = await store.listBoard(scan);
  const ring = loadKeyRing();
  const out: BoardEntry[] = [];
  await Promise.all(
    stored.map(async (entry) => {
      if (entry.scoring === BOARD_SCORING) {
        out.push(entry as BoardEntry);
        return;
      }
      const card = (await store.getCard(entry.cardId))?.card ?? null;
      const trusted = card && verifySigned(card, ring) ? card.payload : null;
      const next = reconcileBoardEntry(entry, trusted);
      if (next) {
        out.push(next);
        await store.rescoreBoardEntry(next).catch(() => undefined);
      } else {
        const why = trusted ? boardEligibility(trusted) : null;
        await store.hideBoardEntry(entry.cardId, why && !why.ok ? why.reason : 'card-missing').catch(() => undefined);
      }
    }),
  );
  return out;
}

/**
 * GET /api/board?range=week|all&poker=1
 * The public board. Firestore rules block every browser read, so the page
 * reads it here. Entries hold an agent name, a score and a date: nothing else.
 */
export async function GET(req: Request): Promise<Response> {
  const store = await getStore();
  if (!store) return withCors(req, json({ error: 'not-configured', message: 'The board isn\u2019t set up yet.' }, 503));
  const now = Date.now();
  if (!(await allow(store, 'publicRead', ipKey(clientIp(req), now), now))) return withCors(req, json({ error: 'rate-limited' }, 429));
  const url = new URL(req.url);
  const range: BoardRange = url.searchParams.get('range') === 'all' ? 'all' : 'week';
  const pokerFaceOnly = url.searchParams.get('poker') === '1';
  const entries = rankBoard(await currentBoard(store, SCAN), { range, pokerFaceOnly, now, limit: BOARD_PAGE });
  return withCors(req, json({ entries, range, pokerFaceOnly, now }));
}

/**
 * POST /api/board  { cardId, name }
 * Opt-in. Only live cards whose every result is server-witnessed, that have
 * at least one validly tested trap, and whose signature checks out can join,
 * once each. Drill cards and reply-reported cards never can.
 */
export async function POST(req: Request): Promise<Response> {
  const store = await getStore();
  if (!store) return withCors(req, json({ error: 'not-configured', message: 'The board isn\u2019t set up yet.' }, 503));
  const app = await checkAppCheck(req);
  if (!app.ok) return withCors(req, json({ error: 'app-check', message: 'This request could not be verified.' }, 401));
  const now = Date.now();
  if (!(await allow(store, 'boardAdd', ipKey(clientIp(req), now), now))) {
    return withCors(req, json({ error: 'rate-limited', message: 'Too many board entries this hour. Try again later.' }, 429));
  }
  const body = await readJson<{ cardId?: unknown; name?: unknown }>(req, 2048);
  if (body === 'too-large' || !body) return withCors(req, json({ error: 'bad-request', message: 'Send a card id and a name.' }, 400));
  if (!isCardId(body.cardId)) return withCors(req, json({ error: 'bad-request', message: 'That card id isn\u2019t valid.' }, 400));
  const name = checkAgentName(body.name);
  if (!name.ok) return withCors(req, json({ error: 'bad-name', message: name.reason }, 400));
  const stored = await store.getCard(body.cardId);
  if (!stored) return withCors(req, json({ error: 'not-found', message: 'That card doesn\u2019t exist.' }, 404));
  const card = stored.card;
  if (!verifySigned(card, loadKeyRing())) return withCors(req, json({ error: 'bad-signature', message: 'That card\u2019s signature doesn\u2019t check out.' }, 409));
  const eligible = boardEligibility(card.payload);
  if (!eligible.ok) {
    const code = eligible.reason === 'not-enough-evidence' ? 'not-enough-evidence' : 'not-witnessed';
    return withCors(req, json({ error: code, reason: eligible.reason, message: BOARD_REFUSAL[eligible.reason] }, 403));
  }
  const entry = boardEntryFrom(card.payload, name.name);
  const result = await store.addToBoard(entry);
  return withCors(req, json({ entry, added: result === 'added' }, result === 'added' ? 201 : 200));
}

export function OPTIONS(req: Request): Response {
  return preflight(req);
}
