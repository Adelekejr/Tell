import { identifyClient, isNonVisit } from './_lib/bots.js';
import { html } from './_lib/http.js';
import { allow, clientIp, ipKey } from './_lib/limits.js';
import { isExpired, isOpen, trapsBase } from './_lib/runs.js';
import { runAndTrap } from './_lib/route.js';
import { getStore } from './_lib/store.js';
import { goneHtml, renderTrapPage } from './_lib/trap-pages.js';

/**
 * GET /t/{runId}/{trapId}
 * Serves one trap page. A visit by a non-bot client marks the trap as read
 * (so it can become Held). Bots, crawlers, HEAD checks and prefetches get the
 * page but are never recorded. Always noindex and no-store.
 */
export async function GET(req: Request): Promise<Response> {
  const ids = runAndTrap(req);
  if (!ids) return html(goneHtml(), 404);
  const store = await getStore();
  if (!store) return html(goneHtml(), 503);
  const run = await store.getRun(ids.runId);
  const now = Date.now();
  if (!run || isExpired(run, now)) return html(goneHtml(), run ? 410 : 404);
  const words = await store.getWords(ids.runId);
  if (!words) return html(goneHtml(), 404);

  const { bot } = identifyClient(req.headers.get('user-agent'));
  if (!bot && !isNonVisit(req) && isOpen(run, now) && run.reads[ids.trapId] === undefined) {
    if (await allow(store, 'trapRead', ipKey(clientIp(req), now), now)) {
      await store.markRead(ids.runId, ids.trapId, now);
    }
  }
  return html(renderTrapPage({ ...ids, word: words[ids.trapId], base: trapsBase(req) }));
}

export const HEAD = GET;
