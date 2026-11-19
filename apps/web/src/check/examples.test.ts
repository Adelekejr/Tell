import { describe, expect, it } from 'vitest';
import { CHECK_EXAMPLES, TRAP_EXAMPLES, exampleMeta, findExample } from './examples';

describe('check examples (rules only, no AI)', () => {
  it.each(CHECK_EXAMPLES.filter((e) => e.bad).map((e) => [e.id, e] as const))('%s is caught by the rules', (_id, e) => {
    const v = e.run();
    expect(v.source).toBe('example');
    expect(v.findings.length).toBeGreaterThan(0);
    if (e.trap) expect(v.findings.map((f) => f.trap)).toContain(e.trap);
  });

  it('hidden tricks count as hidden lines; the visible order is a thing to know', () => {
    expect(findExample('white-text')!.run().hiddenLines).toBe(1);
    expect(findExample('html-comment')!.run().hiddenLines).toBe(1);
    expect(findExample('invisible-letters')!.run().hiddenLines).toBe(1);
    const order = findExample('ai-order')!.run();
    expect(order.hiddenLines).toBe(0);
    expect(order.findings.map((f) => f.rule)).toEqual(['ai-order']);
  });

  it('the clean example finds nothing', () => {
    const v = findExample('clean')!.run();
    expect(v.findings).toEqual([]);
    expect(v.hiddenLines).toBe(0);
  });

  it('all seven demo trap pages are caught, each by its own trap', () => {
    expect(TRAP_EXAMPLES).toHaveLength(7);
    for (const e of TRAP_EXAMPLES) {
      const v = e.run();
      expect(v.url).toContain(`/t/demo/${e.id.slice(5)}`);
      expect(v.findings.map((f) => f.trap)).toContain(e.trap);
    }
  });

  it('labels every example as one', () => {
    for (const e of [...CHECK_EXAMPLES, ...TRAP_EXAMPLES]) expect(exampleMeta(e)).toMatch(/^Example: /);
    expect(findExample('nope')).toBeNull();
    expect(findExample(null)).toBeNull();
  });
});
