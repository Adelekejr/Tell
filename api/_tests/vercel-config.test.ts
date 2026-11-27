import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

type Rule = { source: string; headers: { key: string; value: string }[] };
const config = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8')) as { headers: Rule[] };

/** Vercel sources are path-to-regexp patterns; the ones here are plain regex groups. */
const matches = (source: string, path: string) => new RegExp(`^${source}$`).test(path);
const headersFor = (path: string) =>
  Object.fromEntries(config.headers.filter((r) => matches(r.source, path)).flatMap((r) => r.headers.map((h) => [h.key.toLowerCase(), h.value])));

describe('vercel.json cache headers', () => {
  it('every API route stays no-store except the public board', () => {
    for (const path of ['/api/run', '/api/run-state', '/api/sign', '/api/card', '/api/fetch', '/api/health', '/api/boardx', '/api/board/extra']) {
      expect(headersFor(path)['cache-control'], path).toBe('no-store');
    }
    expect(headersFor('/api/board')['cache-control']).toBeUndefined();
    expect(headersFor('/api/board').vary).toBe('Origin');
  });

  it('trap and canary pages are never cached', () => {
    expect(headersFor('/t/demo/7')['cache-control']).toBe('no-store, max-age=0');
    expect(headersFor('/c/demo/7')['cache-control']).toBe('no-store, max-age=0');
  });
});
