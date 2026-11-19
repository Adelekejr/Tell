import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEMO_FOOTER, DEMO_WORDS, TRAP_IDS, renderDemoTrapPage } from '../_lib/shared.js';
import { resetStoreForTests } from '../_lib/store.js';
import { GET as canary } from '../canary.js';
import { GET as trapRoute } from '../trap.js';

const BASE = 'http://tell.test';
const CHROME = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
const req = (path: string) => new Request(`${BASE}${path}`, { headers: { 'user-agent': CHROME, 'x-forwarded-for': '10.9.9.9' } });

describe('demo trap pages (/t/demo/N)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resetStoreForTests();
  });

  it('serve all seven pages without a run or even a store', async () => {
    vi.stubEnv('TELL_DEV_STORE', '');
    vi.stubEnv('FIREBASE_SERVICE_ACCOUNT', '');
    resetStoreForTests();
    for (let no = 1; no <= 7; no += 1) {
      const res = await trapRoute(req(`/t/demo/${no}`));
      expect(res.status).toBe(200);
      expect(res.headers.get('x-robots-tag')).toContain('noindex');
      const body = await res.text();
      expect(body).toContain(DEMO_FOOTER);
      expect(body).not.toContain('Tell safety test page');
    }
    // Plain-text traps show their demo canary; the others hide it encoded.
    expect(await (await trapRoute(req('/t/demo/1'))).text()).toContain(`/c/demo/1?w=${DEMO_WORDS['invisible-ink']}`);
  });

  it('match the shared demo render, which the check page uses offline', async () => {
    const res = await trapRoute(req('/t/demo/2'));
    expect(await res.text()).toBe(renderDemoTrapPage('whisper', BASE));
  });

  it('accept the rewrite form and refuse unknown traps', async () => {
    expect((await trapRoute(req('/api/trap?run=demo&trap=4'))).status).toBe(200);
    expect((await trapRoute(req('/t/demo/8'))).status).toBe(404);
  });

  it('demo canaries answer like any canary and never touch a store', async () => {
    vi.stubEnv('TELL_DEV_STORE', '');
    vi.stubEnv('FIREBASE_SERVICE_ACCOUNT', '');
    resetStoreForTests();
    const res = await canary(req(`/c/demo/2?w=${DEMO_WORDS.whisper}`));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('Thanks, noted.\n');
    expect((await canary(req('/c/demo/6'))).headers.get('content-type')).toBe('image/gif');
  });

  it('uses a fixed, non-secret word per trap', () => {
    expect(TRAP_IDS.map((id) => DEMO_WORDS[id])).toEqual(['demo1', 'demo2', 'demo3', 'demo4', 'demo5', 'demo6', 'demo7']);
  });
});
