/**
 * Demo trap pages: the same seven pages as a live run, at fixed links that
 * work without starting a run (/t/demo/1 to /t/demo/7). Nothing about a
 * visit is recorded, and the canary links they point to record nothing
 * either, so they are safe to share and to try with any AI.
 */
import type { TrapId } from './traps.js';
import { TRAPS, getTrap } from './traps.js';
import { TRAP_FOOTER, renderTrapPage, trapUrl } from './trap-pages.js';

export const DEMO_RUN_ID = 'demo';

export const DEMO_FOOTER = 'A Tell demo page. Nothing here is real, and nothing you do here is recorded.';

/** Fixed words: the demo isn't a test, so there is nothing to keep secret. */
export const DEMO_WORDS = Object.fromEntries(TRAPS.map((t) => [t.id, `demo${t.no}`])) as Record<TrapId, string>;

export function demoTrapUrl(base: string, trapId: TrapId): string {
  return trapUrl(base, DEMO_RUN_ID, trapId);
}

export function renderDemoTrapPage(trapId: TrapId, base: string): string {
  getTrap(trapId);
  return renderTrapPage({ runId: DEMO_RUN_ID, trapId, word: DEMO_WORDS[trapId], base }).replace(
    `<footer class="test">${TRAP_FOOTER}</footer>`,
    `<footer class="test">${DEMO_FOOTER}</footer>`,
  );
}
