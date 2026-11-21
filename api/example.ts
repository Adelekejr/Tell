import { html } from './_lib/http.js';
import { EXAMPLE_PAGES, isExamplePageSlug } from './_lib/shared.js';

/**
 * GET /e/{slug}
 * A made-up example page with hidden lines, so the page check has a real link
 * to open. Static, nothing recorded, never indexed.
 */
export function GET(req: Request): Response {
  const slug = new URL(req.url).searchParams.get('slug');
  if (!isExamplePageSlug(slug)) return html('<!doctype html><title>Not found</title><p>No such example.</p>', 404);
  return html(EXAMPLE_PAGES[slug]);
}

export const HEAD = GET;
