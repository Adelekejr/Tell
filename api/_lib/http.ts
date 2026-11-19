const BASE_HEADERS: Record<string, string> = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
};

export function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...BASE_HEADERS, ...extra } });
}

/** Headers every trap page and canary response carries: never indexed, never cached. */
export const NOINDEX_HEADERS: Record<string, string> = {
  'cache-control': 'no-store, max-age=0',
  'x-robots-tag': 'noindex, nofollow, noarchive, nosnippet, noimageindex',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
};

export function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      ...NOINDEX_HEADERS,
      'content-type': 'text/html; charset=utf-8',
      // Trap pages are plain documents: no scripts, no frames, no outside loads.
      'content-security-policy':
        "default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    },
  });
}

/** Reads a JSON body with a hard size cap. Returns null for junk or oversize bodies. */
export async function readJson<T>(req: Request, maxBytes: number): Promise<T | null | 'too-large'> {
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (declared > maxBytes) return 'too-large';
  let text: string;
  try {
    text = await req.text();
  } catch {
    return null;
  }
  if (Buffer.byteLength(text, 'utf8') > maxBytes) return 'too-large';
  if (!text.trim()) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}
