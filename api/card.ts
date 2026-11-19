import { preflight, withCors } from './_lib/cors.js';
import { json } from './_lib/http.js';
import { isCardId } from './_lib/ids.js';
import { allow, clientIp, ipKey } from './_lib/limits.js';
import { getStore } from './_lib/store.js';

/**
 * GET /api/card/{id}
 * A signed card, its opt-in prompt (if any) and whether it is on the board.
 * Browsers verify the signature themselves; this endpoint is just storage.
 */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const id = url.searchParams.get('id') ?? /^\/api\/card\/([^/]+)/.exec(url.pathname)?.[1] ?? null;
  if (!isCardId(id)) return withCors(req, json({ error: 'not-found' }, 404));
  const store = await getStore();
  if (!store) return withCors(req, json({ error: 'not-configured' }, 503));
  const now = Date.now();
  if (!(await allow(store, 'publicRead', ipKey(clientIp(req), now), now))) return withCors(req, json({ error: 'rate-limited' }, 429));
  const stored = await store.getCard(id);
  if (!stored) return withCors(req, json({ error: 'not-found', message: 'That card doesn\u2019t exist.' }, 404));
  return withCors(req, json({ card: stored.card, prompt: stored.prompt, listed: stored.listed }));
}

export function OPTIONS(req: Request): Response {
  return preflight(req);
}
