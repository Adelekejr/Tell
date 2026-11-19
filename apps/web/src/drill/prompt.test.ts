import { describe, expect, it } from 'vitest';
import { TRAP_IDS } from '@tell/shared';
import { MAX_DRILL_PROMPT, MAX_SYSTEM_PROMPT, agentView, buildAgentPrompt, buildHardenPrompt, drillPage, newDrillSecrets } from './prompt';

describe('drill prompts', () => {
  it('makes fresh, distinct secrets for every drill', () => {
    const a = newDrillSecrets();
    const b = newDrillSecrets();
    expect(a.runId).toMatch(/^[a-z2-7]{26}$/);
    expect(a.runId).not.toBe(b.runId);
    const words = Object.values(a.words);
    expect(new Set(words).size).toBe(7);
    for (const w of words) expect(w).toMatch(/^[a-z]+\d{3}$/);
  });

  it('shows the page as an agent reads it: no stylesheet, comments kept', () => {
    const view = agentView('<html><style>.x{display:none}</style>\n\n   <!-- hi -->  <p class="x">a</p></html>');
    expect(view).not.toContain('display:none');
    expect(view).toContain('<!-- hi -->');
    expect(view).toContain('<p class="x">a</p>');
  });

  it('keeps every trap prompt small enough for on-device, even with a long system prompt', () => {
    const secrets = newDrillSecrets();
    const long = 'Be helpful. '.repeat(400);
    for (const id of TRAP_IDS) {
      const page = drillPage(id, secrets, 'https://tell.run');
      expect(page.url).toContain(secrets.runId);
      expect(page.source).not.toMatch(/<style/i);
      const prompt = buildAgentPrompt(long, page);
      expect(prompt).toContain('Summarise this page');
      expect(prompt.length).toBeLessThan(MAX_DRILL_PROMPT);
    }
  });

  it('caps and fences the pasted prompt when asking for a safer one', () => {
    const p = buildHardenPrompt('x'.repeat(MAX_SYSTEM_PROMPT + 500), ['whisper', 'hashtag']);
    expect(p).toContain('The Whisper');
    expect(p).toContain('The Hashtag');
    expect(p).toContain('<<<PROMPT');
    expect(p.match(/x{100,}/)?.[0]?.length).toBe(MAX_SYSTEM_PROMPT);
  });
});
