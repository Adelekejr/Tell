/**
 * LOCAL DEVELOPMENT ONLY. A tiny stand-in for `vercel dev`: it applies the
 * rewrites from vercel.json and calls the same handlers Vercel runs.
 * Start it with `pnpm --filter @tell/api dev` (uses TELL_DEV_STORE=memory).
 */
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

type Handler = (req: Request) => Response | Promise<Response>;
type Module = Partial<Record<'GET' | 'POST' | 'HEAD' | 'OPTIONS', Handler>>;

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const config = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8')) as {
  rewrites?: { source: string; destination: string }[];
};
const port = Number(process.env.PORT ?? 3001);

const modules: Record<string, () => Promise<Module>> = {
  '/api/health': () => import('../health.js') as Promise<Module>,
  '/api/run': () => import('../run.js'),
  '/api/run-state': () => import('../run-state.js'),
  '/api/run-finish': () => import('../run-finish.js'),
  '/api/run-reply': () => import('../run-reply.js'),
  '/api/trap': () => import('../trap.js'),
  '/api/canary': () => import('../canary.js'),
};

function rewrite(url: URL): URL {
  for (const r of config.rewrites ?? []) {
    const names: string[] = [];
    const re = new RegExp(`^${r.source.replace(/:(\w+)/g, (_m, n: string) => (names.push(n), '([^/]+)'))}$`);
    const m = re.exec(url.pathname);
    if (!m) continue;
    let dest = r.destination;
    names.forEach((n, i) => (dest = dest.replace(`:${n}`, encodeURIComponent(m[i + 1] ?? ''))));
    const next = new URL(dest, url);
    url.searchParams.forEach((v, k) => next.searchParams.has(k) || next.searchParams.set(k, v));
    return next;
  }
  return url;
}

createServer(async (req, res) => {
  try {
    const original = new URL(req.url ?? '/', `http://${req.headers.host ?? `localhost:${port}`}`);
    if (original.pathname === '/robots.txt') {
      res.writeHead(200, { 'content-type': 'text/plain' }).end(readFileSync(join(root, 'api-public', 'robots.txt')));
      return;
    }
    const target = rewrite(original);
    const load = modules[target.pathname];
    const mod = load ? await load() : null;
    const handler = mod?.[(req.method ?? 'GET') as keyof Module];
    if (!handler) {
      res.writeHead(mod ? 405 : 404, { 'content-type': 'application/json' }).end('{"error":"not-found"}');
      return;
    }
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
    if (!headers.has('x-forwarded-for')) headers.set('x-forwarded-for', req.socket.remoteAddress ?? '127.0.0.1');
    const request = new Request(target, {
      method: req.method,
      headers,
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks),
    });
    const response = await handler(request);
    const out: Record<string, string> = {};
    response.headers.forEach((v, k) => (out[k] = v));
    res.writeHead(response.status, out).end(Buffer.from(await response.arrayBuffer()));
  } catch (err) {
    console.error(err);
    res.writeHead(500, { 'content-type': 'application/json' }).end('{"error":"server"}');
  }
}).listen(port, () => console.log(`[tell-api] dev server on http://localhost:${port} (DEV ONLY)`));
