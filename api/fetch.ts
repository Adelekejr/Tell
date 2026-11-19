import { checkAppCheck } from './_lib/appcheck.js';
import { preflight, withCors } from './_lib/cors.js';
import { json, readJson } from './_lib/http.js';
import { allow, clientIp, ipKey } from './_lib/limits.js';
import type { FetchErrorCode } from './_lib/safe-fetch.js';
import { devFakeIpAllowed, isFakeIpRange, isPublicAddress } from './_lib/net-guard.js';
import { FetchError, safeFetchPage } from './_lib/safe-fetch.js';
import { getStore } from './_lib/store.js';

const STATUS: Record<FetchErrorCode, number> = {
  'bad-url': 400,
  blocked: 422,
  timeout: 504,
  'too-large': 413,
  'not-html': 415,
  'too-many-redirects': 508,
  'http-error': 502,
  unreachable: 502,
};

/**
 * POST /api/fetch  { "url": "https://..." }
 * Fetches one public page for the check page with strict safety limits (see
 * _lib/safe-fetch.ts). The link travels in the body so it stays out of access
 * logs, and nothing about it is stored: only a salted, daily-rotating IP hash
 * is counted for the rate limit.
 */
export async function POST(req: Request): Promise<Response> {
  const store = await getStore();
  if (!store) return withCors(req, json({ error: 'not-configured', message: 'Link checks aren\u2019t switched on yet.' }, 503));
  const app = await checkAppCheck(req);
  if (!app.ok) return withCors(req, json({ error: 'app-check', message: 'This request could not be verified.' }, 401));
  const body = await readJson<{ url?: unknown }>(req, 4096);
  if (body === 'too-large' || body === null || typeof body.url !== 'string' || !body.url.trim() || body.url.length > 2048) {
    return withCors(req, json({ error: 'bad-url', message: 'Send one web link, starting with https://' }, 400));
  }
  const now = Date.now();
  if (!(await allow(store, 'fetch', ipKey(clientIp(req), now), now))) {
    return withCors(
      req,
      json({ error: 'rate-limited', message: 'That\u2019s a lot of checks for one hour. Paste the page\u2019s text instead, or try later.' }, 429, {
        'retry-after': '3600',
      }),
    );
  }
  try {
    const page = await safeFetchPage(
      body.url,
      devFakeIpAllowed() ? { isAllowedAddress: (ip) => isPublicAddress(ip) || isFakeIpRange(ip) } : {},
    );
    return withCors(
      req,
      json({
        url: page.url,
        contentType: page.contentType,
        kind: page.isHtml ? 'html' : 'text',
        body: page.body,
        bytes: page.bytes,
        redirects: page.redirects,
        stylesheets: page.stylesheets,
      }),
    );
  } catch (err) {
    if (err instanceof FetchError) {
      return withCors(req, json({ error: err.code, message: err.message, ...(err.status ? { status: err.status } : {}) }, STATUS[err.code]));
    }
    return withCors(req, json({ error: 'unreachable', message: 'That page couldn\u2019t be loaded. Try again in a moment.' }, 502));
  }
}

export function OPTIONS(req: Request): Response {
  return preflight(req);
}
