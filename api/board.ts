import { checkAppCheck } from './_lib/appcheck.js';
import { preflight, withCors } from './_lib/cors.js';
import { json, readJson } from './_lib/http.js';
import { isCardId } from './_lib/ids.js';
import { allow, clientIp, ipKey } from './_lib/limits.js';
import { loadKeyRing, verifySigned } from './_lib/signing.js';
import type { BoardEntry, BoardRange, SignedCard } from './_lib/shared.js';
import { BOARD_PAGE, BOARD_REFUSAL, BOARD_SCORING, boardEligibility, boardEntryFrom, checkAgentName, rankBoard, reconcileBoardEntry } from './_lib/shared.js';
import type { Store } from './_lib/store.js';
import { getStore } from './_lib/store.js';

/** How many recent entries are ranked. The board is small; this keeps reads cheap. */
const SCAN = 500;

/**
 * The CDN may serve the same board to everyone for 30 s, and a stale copy for
 * 60 s more while it refreshes. The board is public, and the same for every
 * caller; Vary: Origin (from withCors) keeps each origin's CORS headers apart.
 */
export const BOARD_CACHE = 'public, s-maxage=30, stale-while-revalidate=60';

/** How long a card that passed signature checks is reused without reading it again. */
export const CARD_MEMO_MS = 60_000;
const memo = new Map<string, { card: SignedCard; payload: SignedCard['payload']; at: number }>();
const MEMO_MAX = 2000;

/**
 * A signed card that verified in the last minute, from this instance's
 * memory. Cards are write-once, so this only saves reads; anything that
 * fails is never remembered and is re-checked on the next read.
 */
async function verifiedCard(store: Store, cardId: string, ring: ReturnType<typeof loadKeyRing>, now: number) {
  const hit = memo.get(cardId);
  if (hit && now - hit.at < CARD_MEMO_MS) return { card: hit.card, trusted: hit.payload };
  memo.delete(cardId);
  const card = (await store.getCard(cardId))?.card ?? null;
  const trusted = card && verifySigned(card, ring) ? card.payload : null;
  if (card && trusted) {
    if (memo.size >= MEMO_MAX) memo.delete(memo.keys().next().value as string);
    memo.set(cardId, { card, payload: trusted, at: now });
  }
  return { card, trusted };
}

/** Tests only. */
export function resetBoardMemoForTests(): void {
  memo.clear();
}

/**
 * Every read rebuilds every entry from its signed card (a card that verified
 * in the last minute is reused from memory): the signature is
 * checked against Tell's keys and eligibility is recomputed from the signed
 * data under today's rules. Stored numbers are never trusted. An entry whose
 * card is missing, tampered with or no longer eligible is hidden (written
 * back once); an entry stored under older scoring is rewritten.
 */
export async function currentBoard(store: Store, scan: number, now = Date.now()): Promise<BoardEntry[]> {
  const stored = await store.listBoard(scan);
  const ring = loadKeyRing();
  const out: BoardEntry[] = [];
  await Promise.all(
    stored.map(async (entry) => {
      const { card, trusted } = await verifiedCard(store, entry.cardId, ring, now);
      const next = reconcileBoardEntry(entry, trusted);
      if (next) {
        out.push(next);
        if (entry.scoring !== BOARD_SCORING) await store.rescoreBoardEntry(next).catch(() => undefined);
        return;
      }
      const why = trusted ? boardEligibility(trusted) : null;
      const reason = !card ? 'card-missing' : !trusted ? 'bad-signature' : why && !why.ok ? why.reason : 'card-mismatch';
      memo.delete(entry.cardId);
      await store.hideBoardEntry(entry.cardId, reason).catch(() => undefined);
    }),
  );
  return out;
}

/**
 * GET /api/board?range=week|all&tell=1
 * The public board. Firestore rules block every browser read, so the page
 * reads it here. Entries hold an agent name (not verified), what Tell
 * observed (fired N of M fetched) and a date: nothing else. Ranked by evidence
 * (traps observed), then newest; never by how few traps fired.
 */
export async function GET(req: Request): Promise<Response> {
  const store = await getStore();
  if (!store) return withCors(req, json({ error: 'not-configured', message: 'The board isn\u2019t set up yet.' }, 503));
  const now = Date.now();
  if (!(await allow(store, 'publicRead', ipKey(clientIp(req), now), now))) return withCors(req, json({ error: 'rate-limited' }, 429));
  const url = new URL(req.url);
  const range: BoardRange = url.searchParams.get('range') === 'all' ? 'all' : 'week';
  const tellOnly = url.searchParams.get('tell') === '1';
  const entries = rankBoard(await currentBoard(store, SCAN, now), { range, tellOnly, now, limit: BOARD_PAGE });
  return withCors(req, json({ entries, range, tellOnly, now }, 200, { 'cache-control': BOARD_CACHE }));
}

/**
 * POST /api/board  { cardId, name }
 * Opt-in. Only live cards whose every result is server-witnessed, with at
 * least BOARD_MIN_OBSERVED traps fetched and fully watched, and whose
 * signature checks out can join,
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
