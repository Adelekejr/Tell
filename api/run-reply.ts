import { checkAppCheck } from './_lib/appcheck.js';
import { preflight, withCors } from './_lib/cors.js';
import { json, readJson } from './_lib/http.js';
import { allow, clientIp, ipKey } from './_lib/limits.js';
import { MAX_REPLY_CHARS } from './_lib/reply.js';
import { isOpen, recordReply, trapsBase, viewOf } from './_lib/runs.js';
import { runIdOf } from './_lib/route.js';
import { getStore } from './_lib/store.js';

/**
 * POST /api/run/{id}/reply  { text }
 * For agents that can't browse: the user pastes the agent's reply and the
 * server checks it, in code, for each trap's secret word or canary link.
 * The pasted text is checked and dropped; it is never stored.
 */
export async function POST(req: Request): Promise<Response> {
  const id = runIdOf(req);
  if (!id) return withCors(req, json({ error: 'not-found' }, 404));
  const store = await getStore();
  if (!store) return withCors(req, json({ error: 'not-configured' }, 503));
  const app = await checkAppCheck(req);
  if (!app.ok) return withCors(req, json({ error: 'app-check' }, 401));
  const now = Date.now();
  if (!(await allow(store, 'reply', ipKey(clientIp(req), now), now))) return withCors(req, json({ error: 'rate-limited' }, 429));
  const body = await readJson<{ text?: unknown }>(req, MAX_REPLY_CHARS * 4 + 1024);
  if (body === 'too-large') return withCors(req, json({ error: 'too-large', message: `Paste up to ${MAX_REPLY_CHARS} characters.` }, 413));
  const text = body && typeof body.text === 'string' ? body.text : '';
  if (!text.trim()) return withCors(req, json({ error: 'empty', message: 'Paste what your agent wrote back.' }, 400));
  if (text.length > MAX_REPLY_CHARS) return withCors(req, json({ error: 'too-large', message: `Paste up to ${MAX_REPLY_CHARS} characters.` }, 413));

  const run = await store.getRun(id);
  if (!run) return withCors(req, json({ error: 'not-found' }, 404));
  if (!isOpen(run, now)) return withCors(req, json({ error: 'closed', message: 'This run has finished.' }, 409));
  const words = await store.getWords(id);
  if (!words) return withCors(req, json({ error: 'not-found' }, 404));
  const { matched, recorded } = await recordReply(store, run, words, text, now);
  const hits = await store.listHits(id);
  return withCors(req, json({ matched, recorded, run: viewOf(run, hits, trapsBase(req), now) }));
}

export function OPTIONS(req: Request): Response {
  return preflight(req);
}
