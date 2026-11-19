import { checkAppCheck } from './_lib/appcheck.js';
import { CardError, drillPayload, livePayload, readExtras } from './_lib/cards.js';
import { preflight, withCors } from './_lib/cors.js';
import { json, readJson } from './_lib/http.js';
import { isRunId } from './_lib/ids.js';
import { allow, clientIp, ipKey } from './_lib/limits.js';
import { loadKeyRing, signPayload } from './_lib/signing.js';
import { getStore } from './_lib/store.js';
import type { StoredCard } from './_lib/store.js';

const MAX_BODY = 24 * 1024;

const STATUS: Record<CardError['code'], number> = {
  'bad-request': 400,
  'bad-name': 400,
  'bad-prompt': 400,
  'still-open': 409,
  'nothing-tested': 409,
};

/**
 * POST /api/sign
 *   { kind: "live", runId, agent?, prompt? }
 *   { kind: "drill", traps: [7 results], agent?, prompt? }
 * Builds a card and signs it with Ed25519. Live cards are built from the
 * server's own records (one card per run); drill cards are what the browser
 * reported and are always marked witnessed: false. The prompt is kept only
 * when sent, which the page does only when "Include my prompt on my card" is on.
 */
export async function POST(req: Request): Promise<Response> {
  const store = await getStore();
  if (!store) return withCors(req, json({ error: 'not-configured', message: 'The card store is not set up yet.' }, 503));
  const ring = loadKeyRing();
  if (!ring.active) {
    return withCors(req, json({ error: 'not-configured', message: 'Signing isn\u2019t switched on yet. The server still needs its signing key.' }, 503));
  }
  const app = await checkAppCheck(req);
  if (!app.ok) return withCors(req, json({ error: 'app-check', message: 'This request could not be verified.' }, 401));
  const now = Date.now();
  if (!(await allow(store, 'sign', ipKey(clientIp(req), now), now))) {
    return withCors(req, json({ error: 'rate-limited', message: 'That\u2019s a lot of cards for one hour. Try again later.' }, 429, { 'retry-after': '3600' }));
  }
  const body = await readJson<Record<string, unknown>>(req, MAX_BODY);
  if (body === 'too-large') return withCors(req, json({ error: 'too-large', message: 'That card is too big.' }, 413));
  if (!body || typeof body !== 'object') return withCors(req, json({ error: 'bad-request', message: 'Send a card request.' }, 400));

  try {
    const extras = readExtras(body);
    const key = ring.active;
    if (body.kind === 'live') {
      if (!isRunId(body.runId)) return withCors(req, json({ error: 'bad-request', message: 'That run id isn\u2019t valid.' }, 400));
      const runId = body.runId;
      const run = await store.getRun(runId);
      if (!run) return withCors(req, json({ error: 'not-found', message: 'That run doesn\u2019t exist or has been cleared away.' }, 404));
      const hits = await store.listHits(runId);
      const payload = livePayload(run, hits, extras, now);
      const result = await store.createLiveCard(runId, (): StoredCard => ({ card: signPayload(payload, key), prompt: extras.prompt, runId, listed: false }));
      if (!result) return withCors(req, json({ error: 'not-found', message: 'That run doesn\u2019t exist or has been cleared away.' }, 404));
      return withCors(req, json({ card: result.stored.card, created: result.created }, result.created ? 201 : 200));
    }
    if (body.kind === 'drill') {
      const payload = drillPayload(body.traps, extras, now);
      const stored: StoredCard = { card: signPayload(payload, key), prompt: extras.prompt, runId: null, listed: false };
      await store.createCard(stored);
      return withCors(req, json({ card: stored.card, created: true }, 201));
    }
    return withCors(req, json({ error: 'bad-request', message: 'Say which kind of card: live or drill.' }, 400));
  } catch (err) {
    if (err instanceof CardError) return withCors(req, json({ error: err.code, message: err.message }, STATUS[err.code]));
    throw err;
  }
}

export function OPTIONS(req: Request): Response {
  return preflight(req);
}
