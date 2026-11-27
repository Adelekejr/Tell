import { preflight, withCors } from './_lib/cors.js';
import { json } from './_lib/http.js';
import { allowLocal } from './_lib/limits.js';
import { trapsBase, viewOf } from './_lib/runs.js';
import { runIdOf } from './_lib/route.js';
import { getStore } from './_lib/store.js';

/**
 * GET /api/run/{id}
 * The live state of a run, polled by the run page. The unguessable id is the
 * key. The response never contains secret words: cards and the timeline are
 * decided on the server from its own records. The poll limit is counted in
 * memory, so a poll is Firestore reads only, never a write.
 */
export async function GET(req: Request): Promise<Response> {
  const id = runIdOf(req);
  if (!id) return withCors(req, json({ error: 'not-found' }, 404));
  const store = await getStore();
  if (!store) return withCors(req, json({ error: 'not-configured' }, 503));
  const now = Date.now();
  if (!allowLocal('view', id, now)) return withCors(req, json({ error: 'rate-limited' }, 429));
  const run = await store.getRun(id);
  if (!run) return withCors(req, json({ error: 'not-found' }, 404));
  const hits = await store.listHits(id);
  return withCors(req, json(viewOf(run, hits, trapsBase(req), now)));
}

export function OPTIONS(req: Request): Response {
  return preflight(req);
}
