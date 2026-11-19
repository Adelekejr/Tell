import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { gzipSync } from 'node:zlib';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { devFakeIpAllowed, expandV6, isBlockedHostname, isFakeIpRange, isPublicAddress } from '../_lib/net-guard.js';
import type { FetchOptions } from '../_lib/safe-fetch.js';
import type { FetchError } from '../_lib/safe-fetch.js';
import { checkUrl, safeFetchPage } from '../_lib/safe-fetch.js';
import { resetStoreForTests } from '../_lib/store.js';
import { POST as fetchRoute } from '../fetch.js';

describe('isPublicAddress', () => {
  it.each([
    '127.0.0.1', '127.1.2.3', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1',
    '0.0.0.0', '224.0.0.1', '255.255.255.255', '198.18.0.1', '192.0.2.10',
    '::', '::1', 'fe80::1', 'fe80::1%eth0', 'fc00::1', 'fd00:ec2::254', 'ff02::1', '::ffff:127.0.0.1', '::ffff:7f00:1',
    '::ffff:169.254.169.254', '64:ff9b::a9fe:a9fe', '2002:7f00:1::', '2001:db8::1', '2001::1', '::127.0.0.1', 'not-an-ip',
  ])('blocks %s', (ip) => {
    expect(isPublicAddress(ip)).toBe(false);
  });
  it.each(['8.8.8.8', '1.1.1.1', '93.184.216.34', '172.32.0.1', '2606:4700:4700::1111', '2a00:1450:4009:81f::200e', '::ffff:8.8.8.8'])(
    'allows %s',
    (ip) => {
      expect(isPublicAddress(ip)).toBe(true);
    },
  );
  it('expands IPv6 forms', () => {
    expect(expandV6('::ffff:1.2.3.4')).toEqual([0, 0, 0, 0, 0, 0xffff, 0x102, 0x304]);
    expect(expandV6('2001:db8::1')).toEqual([0x2001, 0xdb8, 0, 0, 0, 0, 0, 1]);
    expect(expandV6('1::2::3')).toBeNull();
  });
  it('blocks inside-only host names before DNS', () => {
    for (const h of ['localhost', 'a.localhost', 'printer.local', 'metadata.google.internal', 'intranet', 'router.home.arpa']) {
      expect(isBlockedHostname(h)).toBe(true);
    }
    expect(isBlockedHostname('example.com')).toBe(false);
  });
});

describe('dev-only fake-IP DNS escape', () => {
  it('only works locally and only for 198.18.0.0/15', () => {
    expect(devFakeIpAllowed({ TELL_DEV_FAKE_IP_DNS: '1' })).toBe(true);
    expect(devFakeIpAllowed({ TELL_DEV_FAKE_IP_DNS: '1', VERCEL: '1' })).toBe(false);
    expect(devFakeIpAllowed({ TELL_DEV_FAKE_IP_DNS: '1', VERCEL_ENV: 'preview' })).toBe(false);
    expect(devFakeIpAllowed({ TELL_DEV_FAKE_IP_DNS: '1', NODE_ENV: 'production' })).toBe(false);
    expect(devFakeIpAllowed({})).toBe(false);
    expect(isFakeIpRange('198.18.0.1')).toBe(true);
    expect(isFakeIpRange('198.19.255.255')).toBe(true);
    expect(isFakeIpRange('198.20.0.1')).toBe(false);
    expect(isFakeIpRange('127.0.0.1')).toBe(false);
  });
});

describe('checkUrl', () => {
  const code = (url: string) => {
    try {
      checkUrl(url);
      return 'ok';
    } catch (e) {
      return (e as FetchError).code;
    }
  };
  it.each([
    ['file:///etc/passwd', 'bad-url'],
    ['ftp://example.com/', 'bad-url'],
    ['javascript:alert(1)', 'bad-url'],
    ['not a link', 'bad-url'],
    ['https://user:pw@example.com/', 'bad-url'],
    ['http://example.com:22/', 'blocked'],
    ['http://example.com:8080/', 'blocked'],
    ['http://127.0.0.1/', 'blocked'],
    ['http://2130706433/', 'blocked'],
    ['http://0x7f.1/', 'blocked'],
    ['http://[::1]/', 'blocked'],
    ['http://[::ffff:127.0.0.1]/', 'blocked'],
    ['http://169.254.169.254/latest/meta-data/', 'blocked'],
    ['http://localhost:443/', 'blocked'],
    ['http://metadata.google.internal/', 'blocked'],
    ['https://example.com/page', 'ok'],
    ['http://example.com:443/', 'ok'],
  ])('%s -> %s', (url, want) => {
    expect(code(url)).toBe(want);
  });
});

describe('safeFetchPage against a local test server', () => {
  let server: Server;
  let port = 0;
  const hits: string[] = [];

  beforeAll(async () => {
    server = createServer((req, res) => {
      hits.push(req.url ?? '');
      const send = (status: number, type: string, body: string | Buffer, extra: Record<string, string> = {}) => {
        res.writeHead(status, { 'content-type': type, ...extra });
        res.end(body);
      };
      switch (req.url) {
        case '/page':
          return send(200, 'text/html; charset=utf-8', '<html><head><link rel="stylesheet" href="/a.css"><link rel=stylesheet href="/missing.css"></head><body><p class="x">secret</p></body></html>');
        case '/a.css':
          return send(200, 'text/css', '.x{display:none}</style><script>');
        case '/missing.css':
          return send(404, 'text/plain', 'no');
        case '/cookie':
          return send(200, 'text/plain', JSON.stringify({ cookie: req.headers.cookie ?? null, auth: req.headers.authorization ?? null, ua: req.headers['user-agent'] }));
        case '/gzip':
          return send(200, 'text/html', gzipSync('<p>zipped</p>'), { 'content-encoding': 'gzip' });
        case '/bomb':
          return send(200, 'text/html', gzipSync('a'.repeat(3 * 1024 * 1024)), { 'content-encoding': 'gzip' });
        case '/big':
          return send(200, 'text/html', 'a'.repeat(1024 * 1024 + 10));
        case '/image':
          return send(200, 'image/png', 'png');
        case '/latin1':
          return send(200, 'text/html; charset=iso-8859-1', Buffer.from([0x63, 0x61, 0x66, 0xe9]));
        case '/slow':
          setTimeout(() => send(200, 'text/html', 'late'), 1500);
          return;
        case '/r1':
          return send(302, 'text/plain', '', { location: '/r2' });
        case '/r2':
          return send(301, 'text/plain', '', { location: `http://page.test:${port}/page` });
        case '/to-private':
          return send(302, 'text/plain', '', { location: 'http://10.0.0.7/admin' });
        case '/to-metadata':
          return send(302, 'text/plain', '', { location: 'http://169.254.169.254/latest/meta-data/' });
        case '/to-rebind':
          return send(302, 'text/plain', '', { location: `http://rebind.test:${port}/page` });
        case '/to-file':
          return send(302, 'text/plain', '', { location: 'file:///etc/passwd' });
        case '/loop':
          return send(302, 'text/plain', '', { location: '/loop' });
        case '/500':
          return send(500, 'text/plain', 'oops');
        default:
          return send(404, 'text/plain', 'nope');
      }
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  /** Only for tests: "page.test" resolves to the local server, which counts as allowed here. */
  const testOpts = (): Partial<FetchOptions> => ({
    ports: ['', '80', '443', String(port)],
    isAllowedAddress: (ip) => ip === '127.0.0.1' || isPublicAddress(ip),
    resolve: async (host) => {
      if (host === 'page.test') return [{ address: '127.0.0.1', family: 4 }];
      if (host === 'rebind.test') return [{ address: '10.0.0.5', family: 4 }];
      if (host === 'mixed.test') return [{ address: '8.8.8.8', family: 4 }, { address: '192.168.0.2', family: 4 }];
      throw new Error('ENOTFOUND');
    },
  });
  const url = (path: string) => `http://page.test:${port}${path}`;
  const fail = async (p: Promise<unknown>) => {
    try {
      await p;
      return 'ok';
    } catch (e) {
      return (e as FetchError).code;
    }
  };

  it('fetches a page and inlines its stylesheets safely', async () => {
    const page = await safeFetchPage(url('/page'), testOpts());
    expect(page.isHtml).toBe(true);
    expect(page.stylesheets).toBe(1);
    expect(page.body).toContain('.x{display:none}');
    expect(page.body).not.toMatch(/<\/style><script>/);
  });

  it('sends no cookies or credentials', async () => {
    const page = await safeFetchPage(url('/cookie'), testOpts());
    expect(JSON.parse(page.body)).toMatchObject({ cookie: null, auth: null, ua: expect.stringContaining('TellCheck') });
  });

  it('decompresses gzip, and caps the decompressed size', async () => {
    expect((await safeFetchPage(url('/gzip'), testOpts())).body).toBe('<p>zipped</p>');
    expect(await fail(safeFetchPage(url('/bomb'), testOpts()))).toBe('too-large');
    expect(await fail(safeFetchPage(url('/big'), testOpts()))).toBe('too-large');
  });

  it('decodes the declared charset', async () => {
    expect((await safeFetchPage(url('/latin1'), testOpts())).body).toBe('caf\u00e9');
  });

  it('refuses files, images and errors', async () => {
    expect(await fail(safeFetchPage(url('/image'), testOpts()))).toBe('not-html');
    expect(await fail(safeFetchPage(url('/500'), testOpts()))).toBe('http-error');
  });

  it('times out slow pages', async () => {
    expect(await fail(safeFetchPage(url('/slow'), { ...testOpts(), timeoutMs: 300 }))).toBe('timeout');
  });

  it('follows up to 3 redirects, checking each hop', async () => {
    const page = await safeFetchPage(url('/r1'), testOpts());
    expect(page.redirects).toBe(2);
    expect(page.url).toBe(url('/page'));
    expect(await fail(safeFetchPage(url('/loop'), testOpts()))).toBe('too-many-redirects');
  });

  it('blocks redirects to private, metadata and non-web addresses', async () => {
    expect(await fail(safeFetchPage(url('/to-private'), testOpts()))).toBe('blocked');
    expect(await fail(safeFetchPage(url('/to-metadata'), testOpts()))).toBe('blocked');
    expect(await fail(safeFetchPage(url('/to-file'), testOpts()))).toBe('bad-url');
  });

  it('blocks names that resolve to private addresses (DNS rebinding), even partly', async () => {
    expect(await fail(safeFetchPage(`http://rebind.test:${port}/page`, testOpts()))).toBe('blocked');
    expect(await fail(safeFetchPage(`http://mixed.test:${port}/page`, testOpts()))).toBe('blocked');
    expect(await fail(safeFetchPage(url('/to-rebind'), testOpts()))).toBe('blocked');
  });

  it('never reaches the local server with the real rules', async () => {
    const before = hits.length;
    expect(await fail(safeFetchPage(`http://127.0.0.1:${port}/page`))).toBe('blocked');
    expect(await fail(safeFetchPage(`http://localhost:${port}/page`))).toBe('blocked');
    expect(await fail(safeFetchPage(`http://page.test:${port}/page`, { resolve: async () => [{ address: '127.0.0.1', family: 4 }] }))).toBe('blocked');
    expect(hits.length).toBe(before);
  });

  it('reports unknown sites plainly', async () => {
    expect(await fail(safeFetchPage(`http://nowhere.test:${port}/`, testOpts()))).toBe('unreachable');
  });
});

describe('POST /api/fetch', () => {
  let ip = 500;
  const post = (body: unknown, extra: Record<string, string> = {}) =>
    fetchRoute(
      new Request('http://tell.test/api/fetch', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': `203.0.113.${ip}`, origin: 'http://localhost:5173', ...extra },
        body: typeof body === 'string' ? body : JSON.stringify(body),
      }),
    );
  beforeEach(() => {
    ip += 1;
    vi.stubEnv('TELL_DEV_STORE', 'memory');
    vi.stubEnv('FIREBASE_SERVICE_ACCOUNT', '');
    resetStoreForTests();
  });
  afterEach(() => vi.unstubAllEnvs());

  it('needs a link in the body', async () => {
    expect((await post({})).status).toBe(400);
    expect((await post('nonsense')).status).toBe(400);
    expect((await post({ url: 'x'.repeat(3000) })).status).toBe(400);
  });

  it('refuses private and odd addresses with a plain message', async () => {
    const res = await post({ url: 'http://169.254.169.254/latest/meta-data/' });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe('blocked');
    expect(body.message).toMatch(/private network/);
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    expect((await post({ url: 'file:///etc/passwd' })).status).toBe(400);
  });

  it('rate-limits by hashed IP: 30 an hour', async () => {
    for (let i = 0; i < 30; i += 1) expect((await post({ url: 'http://127.0.0.1/' })).status).toBe(422);
    const res = await post({ url: 'http://127.0.0.1/' });
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('3600');
  });

  it('says so when no store is set up', async () => {
    vi.stubEnv('TELL_DEV_STORE', '');
    resetStoreForTests();
    expect((await post({ url: 'https://example.com/' })).status).toBe(503);
  });
});
