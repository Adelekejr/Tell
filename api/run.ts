import { checkAppCheck } from './_lib/appcheck.js';
import { preflight, withCors } from './_lib/cors.js';
import { json } from './_lib/http.js';
import { allow, clientIp, ipKey } from './_lib/limits.js';
import { createRun, trapsBase, viewOf } from './_lib/runs.js';
import { getStore } from './_lib/store.js';

/**
 * POST /api/run
 * Creates a run: a random 128-bit id, seven private trap links and seven
 * secret words (stored server-side only). Returns the run view, including the
 * copyable task text. Runs expire after 24 hours.
 */
export async function POST(req: Request): Promise<Response> {
  const store = await getStore();
  if (!store) return withCors(req, json({ error: 'not-configured', message: 'The run store is not set up yet.' }, 503));
  const app = await checkAppCheck(req);
  if (!app.ok) return withCors(req, json({ error: 'app-check', message: 'This request could not be verified.' }, 401));
  const now = Date.now();
  if (!(await allow(store, 'runCreate', ipKey(clientIp(req), now), now))) {
    return withCors(req, json({ error: 'rate-limited', message: 'Too many runs this hour. Try again later.' }, 429, { 'retry-after': '3600' }));
  }
  const { run } = await createRun(store, now);
  return withCors(req, json(viewOf(run, [], trapsBase(req), now), 201));
}

export function OPTIONS(req: Request): Response {
  return preflight(req);
}
