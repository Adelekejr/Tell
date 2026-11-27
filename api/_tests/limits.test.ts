import { beforeEach, describe, expect, it } from 'vitest';
import { LIMITS, MEMORY_LIMITS, allow, allowLocal, clientIp, ipKey, resetLocalLimitsForTests } from '../_lib/limits.js';
import { MemoryStore } from '../_lib/store-memory.js';

const r = (headers: Record<string, string>) => new Request('http://tell.test/api/x', { headers });

describe('clientIp: rate limits key on platform headers, not client claims', () => {
  it('on Vercel, ignores a spoofed x-forwarded-for and uses the edge headers', () => {
    const spoofed = { 'x-forwarded-for': '1.2.3.4, 9.9.9.9', 'x-real-ip': '9.9.9.9' };
    expect(clientIp(r(spoofed), true)).toBe('9.9.9.9');
    expect(clientIp(r({ ...spoofed, 'x-vercel-forwarded-for': '8.8.4.4' }), true)).toBe('8.8.4.4');
    // Only a client header: one shared bucket, so rotating it buys nothing.
    expect(clientIp(r({ 'x-forwarded-for': '1.2.3.4' }), true)).toBe('unknown');
    expect(clientIp(r({ 'x-forwarded-for': '5.6.7.8' }), true)).toBe('unknown');
  });

  it('refuses values that are not IP addresses', () => {
    expect(clientIp(r({ 'x-real-ip': 'not-an-ip' }), true)).toBe('unknown');
    expect(clientIp(r({ 'x-real-ip': '2001:db8::1' }), true)).toBe('2001:db8::1');
  });

  it('off Vercel (dev and tests), falls back to x-forwarded-for', () => {
    expect(clientIp(r({ 'x-forwarded-for': '10.0.0.1, 10.0.0.2' }), false)).toBe('10.0.0.1');
  });

  it('hashes the IP with a daily salt; the raw IP never appears in the key', () => {
    const k = ipKey('9.9.9.9', Date.UTC(2026, 10, 26), 'salt');
    expect(k).toMatch(/^[0-9a-f]{24}$/);
    expect(k).not.toContain('9.9.9.9');
    expect(ipKey('9.9.9.9', Date.UTC(2026, 10, 27), 'salt')).not.toBe(k);
  });
});

describe('run polling limit: counted in memory, never in the store', () => {
  beforeEach(() => resetLocalLimitsForTests());

  it('the view limit is a memory limit', () => {
    expect(MEMORY_LIMITS.has('view')).toBe(true);
    expect(LIMITS.view).toEqual({ limit: 3000, windowMs: 60 * 60 * 1000 });
  });

  it('allow() never calls store.take for view', async () => {
    const store = new MemoryStore();
    let takes = 0;
    const orig = store.take.bind(store);
    store.take = async (...args) => {
      takes += 1;
      return orig(...args);
    };
    for (let i = 0; i < 5; i += 1) expect(await allow(store, 'view', 'run1', 1000)).toBe(true);
    expect(takes).toBe(0);
    expect(await allow(store, 'runCreate', 'ip', 1000)).toBe(true);
    expect(takes).toBe(1);
  });

  it('caps polls per run per window, and a new window starts fresh', () => {
    const hour = LIMITS.view.windowMs;
    for (let i = 0; i < LIMITS.view.limit; i += 1) expect(allowLocal('view', 'runA', 10)).toBe(true);
    expect(allowLocal('view', 'runA', 10)).toBe(false);
    expect(allowLocal('view', 'runB', 10)).toBe(true);
    expect(allowLocal('view', 'runA', hour + 10)).toBe(true);
  });
});
