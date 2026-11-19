import { lookup as dnsLookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import type { IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import type { LookupFunction } from 'node:net';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';
import { isBlockedHostname, isPublicAddress } from './net-guard.js';

/**
 * Fetches one public web page for the check, with the safety limits from the
 * plan (stops SSRF: tricking our server into reaching private machines):
 * - http and https only, ports 80 and 443 only, no user:pass in the link
 * - every DNS answer must be a public address, and the connection is pinned
 *   to the address that was checked, so DNS can't switch it afterwards
 * - the same checks on every redirect, at most 3
 * - 5 s for everything, 1 MB cap (also after decompression), HTML or text only
 * - no cookies or credentials are ever sent
 * - up to 3 linked stylesheets inlined, through the same checks, so hidden-CSS
 *   rules still work
 */

export type FetchErrorCode =
  | 'bad-url'
  | 'blocked'
  | 'timeout'
  | 'too-large'
  | 'not-html'
  | 'too-many-redirects'
  | 'http-error'
  | 'unreachable';

export class FetchError extends Error {
  constructor(
    readonly code: FetchErrorCode,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'FetchError';
  }
}

export interface Resolved {
  address: string;
  family: number;
}

export interface FetchOptions {
  timeoutMs: number;
  maxBytes: number;
  maxRedirects: number;
  maxStylesheets: number;
  maxStylesheetBytes: number;
  ports: readonly string[];
  /** Override only in tests. */
  isAllowedAddress: (ip: string) => boolean;
  /** Override only in tests. */
  resolve: (host: string) => Promise<Resolved[]>;
}

export const DEFAULT_FETCH: FetchOptions = {
  timeoutMs: 5000,
  maxBytes: 1024 * 1024,
  maxRedirects: 3,
  maxStylesheets: 3,
  maxStylesheetBytes: 256 * 1024,
  ports: ['', '80', '443'],
  isAllowedAddress: isPublicAddress,
  resolve: (host) => dnsLookup(host, { all: true, verbatim: true }),
};

export const USER_AGENT = 'TellCheck/1.0 (+https://github.com/Adelekejr/Tell; looks for hidden AI instructions)';
const PAGE_TYPES = /^(text\/html|application\/xhtml\+xml|text\/plain)\b/i;
const CSS_TYPES = /^(text\/css|text\/plain)\b/i;

export interface FetchedPage {
  url: string;
  contentType: string;
  /** The page as text. For HTML, linked stylesheets are inlined. */
  body: string;
  isHtml: boolean;
  bytes: number;
  redirects: number;
  stylesheets: number;
}

/** Rejects anything that isn't a plain public http(s) link. Returns the parsed URL. */
export function checkUrl(raw: string, opts: Pick<FetchOptions, 'ports' | 'isAllowedAddress'> = DEFAULT_FETCH): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new FetchError('bad-url', 'That doesn\u2019t look like a web link.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new FetchError('bad-url', 'Only links that start with http:// or https:// can be checked.');
  }
  if (url.username || url.password) throw new FetchError('bad-url', 'Links with a user name or password can\u2019t be checked.');
  if (!opts.ports.includes(url.port)) throw new FetchError('blocked', 'Only ordinary web ports (80 and 443) can be checked.');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host)) {
    if (!opts.isAllowedAddress(host)) throw new FetchError('blocked', 'That address is on a private network, so Tell won\u2019t open it.');
  } else if (isBlockedHostname(host)) {
    throw new FetchError('blocked', 'That address is on a private network, so Tell won\u2019t open it.');
  }
  return url;
}

/** Looks the host up and insists every answer is public (a mixed answer is refused). */
async function resolvePublic(url: URL, opts: FetchOptions): Promise<Resolved> {
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const family = isIP(host);
  if (family) return { address: host, family };
  let answers: Resolved[];
  try {
    answers = await opts.resolve(host);
  } catch {
    throw new FetchError('unreachable', 'That website couldn\u2019t be found. Check the link for typos.');
  }
  if (!answers.length) throw new FetchError('unreachable', 'That website couldn\u2019t be found. Check the link for typos.');
  if (answers.some((a) => !opts.isAllowedAddress(a.address))) {
    throw new FetchError('blocked', 'That address leads to a private network, so Tell won\u2019t open it.');
  }
  return answers[0] as Resolved;
}

function decoderFor(res: IncomingMessage): NodeJS.ReadableStream {
  const enc = String(res.headers['content-encoding'] ?? '').toLowerCase().trim();
  if (enc === 'gzip' || enc === 'x-gzip') return res.pipe(createGunzip());
  if (enc === 'deflate') return res.pipe(createInflate());
  if (enc === 'br') return res.pipe(createBrotliDecompress());
  return res;
}

function charsetOf(contentType: string, head: Buffer): string {
  const fromHeader = /charset\s*=\s*"?([\w.:-]+)/i.exec(contentType)?.[1];
  const fromMeta = /<meta[^>]+charset\s*=\s*["']?([\w.:-]+)/i.exec(head.toString('latin1'))?.[1];
  const label = (fromHeader ?? fromMeta ?? 'utf-8').toLowerCase();
  try {
    new TextDecoder(label);
    return label;
  } catch {
    return 'utf-8';
  }
}

interface Hop {
  status: number;
  location: string | null;
  contentType: string;
  body: Buffer | null;
}

/** One request to one checked address. No cookies, no auth, no keep-alive. */
function requestOnce(url: URL, target: Resolved, accept: RegExp, maxBytes: number, deadline: number, signal: AbortSignal): Promise<Hop> {
  return new Promise((resolve, reject) => {
    // Pin the socket to the address we already checked.
    const pinned: LookupFunction = (_host, options, cb) => {
      if (options.all) cb(null, [target]);
      else cb(null, target.address, target.family);
    };
    const remaining = deadline - Date.now();
    if (remaining <= 0) return reject(new FetchError('timeout', 'The page took too long to load.'));
    const send = url.protocol === 'https:' ? httpsRequest : httpRequest;
    const req = send(url, {
      method: 'GET',
      lookup: pinned,
      agent: false,
      signal,
      headers: {
        'user-agent': USER_AGENT,
        accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,text/css;q=0.8',
        'accept-encoding': 'gzip, deflate, br',
        'accept-language': 'en',
        connection: 'close',
      },
    });
    const timer = setTimeout(() => req.destroy(new FetchError('timeout', 'The page took too long to load.')), remaining);
    let finished = false;
    const settled = () => finished;
    const fail = (err: unknown) => {
      finished = true;
      clearTimeout(timer);
      if (err instanceof FetchError) return reject(err);
      if (signal.aborted || (err as { name?: string }).name === 'AbortError') {
        return reject(new FetchError('timeout', 'The page took too long to load.'));
      }
      reject(new FetchError('unreachable', 'That website didn\u2019t answer. Check the link, or try again later.'));
    };
    req.on('error', (err) => {
      if (!settled()) fail(err);
    });
    req.on('response', (res) => {
      const status = res.statusCode ?? 0;
      const contentType = String(res.headers['content-type'] ?? '');
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume();
        clearTimeout(timer);
        return resolve({ status, location: String(res.headers.location), contentType, body: null });
      }
      if (status < 200 || status >= 300) {
        res.resume();
        clearTimeout(timer);
        return reject(new FetchError('http-error', `The website answered with an error (${status}).`, status));
      }
      if (!accept.test(contentType || 'text/html')) {
        res.resume();
        clearTimeout(timer);
        return reject(new FetchError('not-html', 'That link isn\u2019t a web page (it could be a file or an image).'));
      }
      const declared = Number(res.headers['content-length'] ?? '0');
      if (declared > maxBytes && !res.headers['content-encoding']) {
        res.destroy();
        clearTimeout(timer);
        return reject(new FetchError('too-large', 'That page is too big to check (over 1 MB).'));
      }
      const chunks: Buffer[] = [];
      let size = 0;
      let done = false;
      const stream = decoderFor(res);
      stream.on('data', (chunk: Buffer) => {
        if (done) return;
        size += chunk.length;
        if (size > maxBytes) {
          done = true;
          clearTimeout(timer);
          reject(new FetchError('too-large', 'That page is too big to check (over 1 MB).'));
          res.destroy();
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      const failOnce = (err: unknown) => {
        if (done) return;
        done = true;
        fail(err);
      };
      stream.on('error', failOnce);
      res.on('error', failOnce);
      stream.on('end', () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve({ status, location: null, contentType, body: Buffer.concat(chunks) });
      });
    });
    req.end();
  });
}

/** Follows redirects by hand so every hop is checked again. */
async function getChecked(raw: string, opts: FetchOptions, accept: RegExp, maxBytes: number, deadline: number, signal: AbortSignal) {
  let url = checkUrl(raw, opts);
  for (let redirects = 0; ; redirects += 1) {
    const target = await resolvePublic(url, opts);
    const hop = await requestOnce(url, target, accept, maxBytes, deadline, signal);
    if (!hop.location) return { url, hop: hop as Hop & { body: Buffer }, redirects };
    if (redirects >= opts.maxRedirects) throw new FetchError('too-many-redirects', 'That link redirects too many times.');
    let next: URL;
    try {
      next = new URL(hop.location, url);
    } catch {
      throw new FetchError('unreachable', 'That website sent a broken redirect.');
    }
    url = checkUrl(next.href, opts);
  }
}

const LINK_RE = /<link\b[^>]*>/gi;

function stylesheetHrefs(html: string, base: URL, max: number): URL[] {
  const out: URL[] = [];
  for (const m of html.matchAll(LINK_RE)) {
    const tag = m[0];
    if (!/\brel\s*=\s*["']?[^"'>]*\bstylesheet\b/i.test(tag)) continue;
    if (/\bmedia\s*=\s*["']?print\b/i.test(tag)) continue;
    const href = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag);
    const value = href?.[1] ?? href?.[2] ?? href?.[3];
    if (!value) continue;
    try {
      const u = new URL(value, base);
      if (u.protocol === 'http:' || u.protocol === 'https:') out.push(u);
    } catch {
      // ignore broken links
    }
    if (out.length >= max) break;
  }
  return out;
}

/** Keeps a stylesheet from closing our <style> element early. */
function safeCss(css: string): string {
  return css.replace(/<\/style/gi, '<\\/style');
}

export async function safeFetchPage(raw: string, overrides: Partial<FetchOptions> = {}): Promise<FetchedPage> {
  const opts: FetchOptions = { ...DEFAULT_FETCH, ...overrides };
  const deadline = Date.now() + opts.timeoutMs;
  const ctrl = new AbortController();
  const stop = setTimeout(() => ctrl.abort(), opts.timeoutMs + 50);
  try {
    const { url, hop, redirects } = await getChecked(raw, opts, PAGE_TYPES, opts.maxBytes, deadline, ctrl.signal);
    const contentType = hop.contentType || 'text/html';
    let body = new TextDecoder(charsetOf(contentType, hop.body.subarray(0, 1024))).decode(hop.body);
    const isHtml = !/^text\/plain/i.test(contentType);
    let stylesheets = 0;
    if (isHtml && opts.maxStylesheets > 0) {
      const sheets = await Promise.all(
        stylesheetHrefs(body, url, opts.maxStylesheets).map(async (href) => {
          try {
            const r = await getChecked(href.href, opts, CSS_TYPES, opts.maxStylesheetBytes, deadline, ctrl.signal);
            return `<style data-tell-from="${href.href.replace(/"/g, '%22')}">${safeCss(r.hop.body.toString('utf8'))}</style>`;
          } catch {
            return null;
          }
        }),
      );
      const css = sheets.filter((s): s is string => s !== null);
      stylesheets = css.length;
      if (css.length) {
        const at = body.search(/<\/head\s*>/i);
        body = at >= 0 ? body.slice(0, at) + css.join('\n') + body.slice(at) : css.join('\n') + body;
      }
    }
    return { url: url.href, contentType, body, isHtml, bytes: hop.body.length, redirects, stylesheets };
  } finally {
    clearTimeout(stop);
  }
}
