import { isRunId } from './ids.js';
import type { TrapId } from './shared.js';
import { TRAPS, isTrapId } from './shared.js';

/**
 * Reads the run id (and trap id) from a request. Vercel rewrites put them in
 * the query string; the original path is checked as a fallback, so both
 * /t/{run}/{trap} and /api/trap?run=..&trap=.. work.
 */
export function runAndTrap(req: Request): { runId: string; trapId: TrapId } | null {
  const url = new URL(req.url);
  let runId = url.searchParams.get('run');
  let trapId = url.searchParams.get('trap');
  if (!runId || !trapId) {
    const m = /^\/[tc]\/([^/]+)\/([^/?#]+)/.exec(url.pathname);
    if (m) [runId, trapId] = [m[1] ?? null, m[2] ?? null];
  }
  const trap = trapFromSlug(trapId);
  if (!isRunId(runId) || !trap) return null;
  return { runId, trapId: trap };
}

export function runIdOf(req: Request): string | null {
  const url = new URL(req.url);
  let id = url.searchParams.get('id');
  if (!id) id = /^\/api\/run\/([^/]+)/.exec(url.pathname)?.[1] ?? null;
  return isRunId(id) ? id : null;
}

/** "3" -> "ghost-letters". The trap id itself is accepted too. */
export function trapFromSlug(slug: string | null): TrapId | null {
  if (isTrapId(slug)) return slug;
  if (!slug || !/^[1-7]$/.test(slug)) return null;
  return TRAPS[Number(slug) - 1]?.id ?? null;
}
