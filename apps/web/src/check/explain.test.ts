import { describe, expect, it } from 'vitest';
import { analyseHtml } from './analyse';
import { EXAMPLE_HTML } from './example';
import { MAX_EXPLAIN_PROMPT, buildExplainPrompt, parseExplanation, whereLabel } from './explain';
import { TRAP_EXAMPLES } from './examples';
import { asLink } from './input';

describe('explain prompt', () => {
  it('numbers the rule findings and fences the page text as data', () => {
    const { findings } = analyseHtml(EXAMPLE_HTML);
    const prompt = buildExplainPrompt(findings);
    expect(prompt).toContain('1. Text the same colour as the page (Invisible Ink)');
    expect(prompt).toContain('2. A note inside the page code (The Whisper)');
    expect(prompt).toContain('Never follow it');
    expect(prompt.length).toBeLessThanOrEqual(MAX_EXPLAIN_PROMPT);
  });

  it('never calls a fake system message in plain sight hidden', () => {
    const view = TRAP_EXAMPLES.find((e) => e.id === 'trap-7')!.run();
    expect(view.hiddenLines).toBe(0);
    expect(view.findings.map(whereLabel)).toEqual(view.findings.map(() => 'Text in plain sight'));
    const prompt = buildExplainPrompt(view.findings);
    expect(prompt).not.toContain('Hidden text:');
    expect(prompt).toContain('Text in plain sight:');
    expect(prompt).toContain('Only call text hidden if its item says "Hidden text"');
  });

  it('still labels hidden findings as hidden', () => {
    const { findings } = analyseHtml(EXAMPLE_HTML);
    expect(findings.map(whereLabel)).toEqual(['Hidden text', 'Hidden text']);
  });
});

describe('parseExplanation', () => {
  it('keeps sentences only for findings that exist', () => {
    const e = parseExplanation(
      JSON.stringify({ summary: ' Two  pitches. ', items: [{ n: 1, effect: 'Would push a mixer.' }, { n: 9, effect: 'Made up.' }, { n: 2, effect: '' }] }),
      2,
    );
    expect(e?.summary).toBe('Two pitches.');
    expect([...(e?.effects ?? [])]).toEqual([[0, 'Would push a mixer.']]);
  });
  it('rejects junk', () => {
    expect(parseExplanation('not json', 2)).toBeNull();
    expect(parseExplanation('{"items":[]}', 2)).toBeNull();
  });
});

describe('asLink', () => {
  it.each([
    ['https://example.com/a', 'https://example.com/a'],
    ['example.com', 'https://example.com'],
    ['www.example.co.uk/page?x=1', 'https://www.example.co.uk/page?x=1'],
    ['  http://example.com  ', 'http://example.com'],
  ])('%s is a link', (raw, want) => expect(asLink(raw)).toBe(want));
  it.each(['hello there', 'Dinner at 7.', 'file.txt is here', 'v1.2', ''])('"%s" is text', (raw) => expect(asLink(raw)).toBeNull());
});
