import { isNonVisit } from './_lib/bots.js';
import { NOINDEX_HEADERS } from './_lib/http.js';
import { allow, clientIp, ipKey } from './_lib/limits.js';
import { recordCanary } from './_lib/runs.js';
import { runAndTrap } from './_lib/route.js';
import { getStore } from './_lib/store.js';

// A 1x1 transparent GIF, so The Postcard's "tracking image" loads quietly.
const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

/**
 * The same small answer whatever happened, so the response never tells a
 * caller whether a word was right or a run exists.
 */
function reply(req: Request, trap: string | null): Response {
  const wantsImage = trap === 'postcard' || /image\//.test(req.headers.get('accept') ?? '');
  if (wantsImage) {
    return new Response(new Uint8Array(GIF), { status: 200, headers: { ...NOINDEX_HEADERS, 'content-type': 'image/gif' } });
  }
  return new Response('Thanks, noted.\n', { status: 200, headers: { ...NOINDEX_HEADERS, 'content-type': 'text/plain; charset=utf-8' } });
}

/**
 * GET /c/{runId}/{trapId}?w={word}&d={data}
 * The canary. Code decides the proof level (see classifyCanary). Only the
 * length of any `d` data is stored, never the data. Expired or finished runs,
 * the 50-hit cap and per-IP limits all drop the hit silently.
 */
export async function GET(req: Request): Promise<Response> {
  const ids = runAndTrap(req);
  if (!ids) return reply(req, null);
  if (isNonVisit(req)) return reply(req, ids.trapId);
  const store = await getStore();
  if (!store) return reply(req, ids.trapId);
  const now = Date.now();
  if (!(await allow(store, 'canary', ipKey(clientIp(req), now), now))) return reply(req, ids.trapId);
  const run = await store.getRun(ids.runId);
  if (!run) return reply(req, ids.trapId);
  const words = await store.getWords(ids.runId);
  if (!words) return reply(req, ids.trapId);
  const url = new URL(req.url);
  await recordCanary(
    store,
    run,
    ids.trapId,
    words,
    { given: url.searchParams.get('w'), userAgent: req.headers.get('user-agent'), leakLength: (url.searchParams.get('d') ?? '').length },
    now,
  );
  return reply(req, ids.trapId);
}

export const HEAD = GET;
