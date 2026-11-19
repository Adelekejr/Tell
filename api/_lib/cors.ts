const DEFAULT_ORIGINS = ['https://tell-b7c40.web.app', 'https://tell-b7c40.firebaseapp.com'];

function allowedOrigins(): string[] {
  const extra = (process.env.TELL_WEB_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return [...DEFAULT_ORIGINS, ...extra];
}

function isLocalDev(origin: string): boolean {
  return !process.env.VERCEL && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

/** CORS for the web app, which lives on Firebase Hosting (a different origin). */
export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin');
  if (!origin || !(allowedOrigins().includes(origin) || isLocalDev(origin))) return { vary: 'Origin' };
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type, x-firebase-appcheck',
    'access-control-max-age': '600',
    vary: 'Origin',
  };
}

export function preflight(req: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}

export function withCors(req: Request, res: Response): Response {
  for (const [k, v] of Object.entries(corsHeaders(req))) res.headers.set(k, v);
  return res;
}
