import { identifyClient, isNonVisit } from './_lib/bots.js';
import { html } from './_lib/http.js';
import { allow, clientIp, ipKey, runKey } from './_lib/limits.js';
import { isExpired, isOpen, trapsBase } from './_lib/runs.js';
import { demoTrap, runAndTrap } from './_lib/route.js';
import { getStore } from './_lib/store.js';
import { CONTROL_SLUG, goneHtml, renderControlPage, renderDemoTrapPage, renderTrapPage } from './_lib/trap-pages.js';

/**
 * GET /t/{runId}/{trapId}
 * Serves one trap page. A visit by a non-bot client marks the trap as read
 * (so it can later show No canary). Bots, crawlers, HEAD checks and prefetches get the
 * page but are never recorded. Always noindex and no-store.
 *
 * GET /t/demo/{trapId} serves the demo copy of a trap page: no run, no store,
 * nothing recorded, so the link works for anyone at any time.
 *
 * GET /t/demo/control serves the clean control page: an ordinary page with no
 * hidden instruction and no canary, for false-positive checks.
 */
export async function GET(req: Request): Promise<Response> {
  if (isControl(req)) return html(renderControlPage());
  const demo = demoTrap(req);
  if (demo) return html(renderDemoTrapPage(demo, trapsBase(req)));
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
    const underLimits =
      (await allow(store, 'trapReadIp', ipKey(clientIp(req), now), now)) && (await allow(store, 'trapRead', runKey(ids.runId), now));
    if (underLimits) {
      await store.markRead(ids.runId, ids.trapId, now);
    }
  }
  return html(renderTrapPage({ ...ids, word: words[ids.trapId], base: trapsBase(req) }));
}

function isControl(req: Request): boolean {
  const url = new URL(req.url);
  const run = url.searchParams.get('run') ?? /^\/t\/([^/]+)\//.exec(url.pathname)?.[1];
  const trap = url.searchParams.get('trap') ?? /^\/t\/[^/]+\/([^/?#]+)/.exec(url.pathname)?.[1];
  return run === 'demo' && trap === CONTROL_SLUG;
}

export const HEAD = GET;
