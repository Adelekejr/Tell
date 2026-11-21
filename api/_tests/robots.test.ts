import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const ROBOTS = readFileSync(new URL('../../api-public/robots.txt', import.meta.url), 'utf8');

/** A small RFC 9309 reader: pick the most specific group, then the longest matching rule. */
function allowed(ua: string, path: string): boolean {
  const groups: { agents: string[]; rules: { allow: boolean; path: string }[] }[] = [];
  let open = false;
  for (const raw of ROBOTS.split('\n')) {
    const line = raw.replace(/#.*/, '').trim();
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1]!.toLowerCase();
    const value = m[2]!.trim();
    if (key === 'user-agent') {
      if (!open) groups.push({ agents: [], rules: [] });
      groups.at(-1)!.agents.push(value.toLowerCase());
      open = true;
    } else if (key === 'allow' || key === 'disallow') {
      open = false;
      groups.at(-1)?.rules.push({ allow: key === 'allow', path: value });
    }
  }
  const token = ua.split('/')[0]!.toLowerCase();
  const group = groups.find((g) => g.agents.includes(token)) ?? groups.find((g) => g.agents.includes('*'));
  if (!group) return true;
  const hits = group.rules.filter((r) => r.path && path.startsWith(r.path));
  if (!hits.length) return true;
  hits.sort((a, b) => b.path.length - a.path.length || Number(b.allow) - Number(a.allow));
  return hits[0]!.allow;
}

describe('robots.txt', () => {
  const agents = ['ChatGPT-User/1.0', 'Claude-User/1.0', 'Perplexity-User/1.0', 'MistralAI-User/1.0', 'Google-Agent', 'SomeBrowserAgent/2.0'];
  const crawlers = ['GPTBot/1.2', 'ClaudeBot/1.0', 'Googlebot/2.1', 'Bingbot/2.0', 'CCBot/2.0', 'PerplexityBot/1.0'];

  it('lets agents acting for a person open trap and canary pages', () => {
    for (const ua of agents) {
      expect(allowed(ua, '/t/abc/1'), ua).toBe(true);
      expect(allowed(ua, '/c/abc/1?w=x'), ua).toBe(true);
      expect(allowed(ua, '/t/demo/1'), ua).toBe(true);
    }
  });

  it('keeps the API and everything else closed to agents', () => {
    for (const ua of agents) {
      expect(allowed(ua, '/api/run'), ua).toBe(false);
      expect(allowed(ua, '/keys.json'), ua).toBe(false);
    }
  });

  it('keeps search and training crawlers out entirely', () => {
    for (const ua of crawlers) {
      expect(allowed(ua, '/t/abc/1'), ua).toBe(false);
      expect(allowed(ua, '/c/abc/1'), ua).toBe(false);
      expect(allowed(ua, '/api/health'), ua).toBe(false);
    }
  });
});
