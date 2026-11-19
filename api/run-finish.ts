import { preflight, withCors } from './_lib/cors.js';
import { json } from './_lib/http.js';
import { allow, clientIp, ipKey } from './_lib/limits.js';
import { trapsBase, viewOf } from './_lib/runs.js';
import { runIdOf } from './_lib/route.js';
import { getStore } from './_lib/store.js';

/**
 * POST /api/run/{id}/finish
 * Stops collecting evidence. Traps that were read but never fired become
 * Held; traps never opened stay face down (not tested).
 */
export async function POST(req: Request): Promise<Response> {
  const id = runIdOf(req);
  if (!id) return withCors(req, json({ error: 'not-found' }, 404));
  const store = await getStore();
  if (!store) return withCors(req, json({ error: 'not-configured' }, 503));
  const now = Date.now();
  if (!(await allow(store, 'finish', ipKey(clientIp(req), now), now))) return withCors(req, json({ error: 'rate-limited' }, 429));
  const run = await store.getRun(id);
  if (!run) return withCors(req, json({ error: 'not-found' }, 404));
  if (run.finishedAt === null && now < run.expiresAt) {
    await store.finish(id, now);
    run.finishedAt = now;
  }
  const hits = await store.listHits(id);
  return withCors(req, json(viewOf(run, hits, trapsBase(req), now)));
}

export function OPTIONS(req: Request): Response {
  return preflight(req);
}
