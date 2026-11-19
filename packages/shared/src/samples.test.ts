import { createHash, createPublicKey, verify } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { DEMO_FOOTER, DEMO_RUN_ID, DEMO_WORDS, demoTrapUrl, renderDemoTrapPage } from './demo.js';
import { DEMO_KEY, DEMO_KID, SAMPLE_CARD, SAMPLE_CARD_PROMPT, SAMPLE_STRONG_PROMPT, SAMPLE_WEAK_PROMPT, isSampleCard } from './samples.js';
import { KID_RE, PINNED_KEYS, cardMessage, isSignedCard } from './scorecard.js';
import { TRAP_IDS } from './traps.js';

const demoPublicKey = () =>
  createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: DEMO_KEY.publicKey }, format: 'jwk' });

describe('the sample scorecard', () => {
  it('is a well-formed card signed by the demo key', () => {
    expect(isSignedCard(SAMPLE_CARD)).toBe(true);
    expect(SAMPLE_CARD.kid).toBe(DEMO_KID);
    expect(isSampleCard(SAMPLE_CARD)).toBe(true);
    const ok = verify(null, Buffer.from(cardMessage(SAMPLE_CARD.payload)), demoPublicKey(), Buffer.from(SAMPLE_CARD.sig, 'base64url'));
    expect(ok).toBe(true);
  });

  it('fails the check once anything on it changes', () => {
    const edited = { ...SAMPLE_CARD.payload, agent: 'Real agent' };
    expect(verify(null, Buffer.from(cardMessage(edited)), demoPublicKey(), Buffer.from(SAMPLE_CARD.sig, 'base64url'))).toBe(false);
  });

  it('is clearly a sample and carries the weak sample prompt', () => {
    expect(SAMPLE_CARD.payload.agent).toBe('Sample agent');
    expect(SAMPLE_CARD.payload.run).toBeNull();
    expect(SAMPLE_CARD.payload.promptHash).toBe(`sha256:${createHash('sha256').update(SAMPLE_CARD_PROMPT).digest('hex')}`);
    expect(SAMPLE_CARD_PROMPT).toBe(SAMPLE_WEAK_PROMPT);
  });

  it('the demo key id can never be a real signing key id', () => {
    expect(KID_RE.test(DEMO_KID)).toBe(false);
    expect(PINNED_KEYS.some((k) => k.kid === DEMO_KID)).toBe(false);
    expect(isSampleCard({ kid: 'k1' })).toBe(false);
  });

  it('the sample prompts differ and stay under the drill limit', () => {
    expect(SAMPLE_WEAK_PROMPT).not.toBe(SAMPLE_STRONG_PROMPT);
    expect(SAMPLE_STRONG_PROMPT.length).toBeLessThan(2500);
  });
});

describe('demo trap pages', () => {
  it('render every trap with its own fixed word and the demo footer', () => {
    for (const id of TRAP_IDS) {
      const html = renderDemoTrapPage(id, 'https://tell.test');
      expect(html).toContain(DEMO_FOOTER);
      expect(html).not.toContain('Tell safety test page');
      expect(DEMO_WORDS[id]).toMatch(/^demo[1-7]$/);
    }
    expect(demoTrapUrl('https://tell.test', 'cipher')).toBe(`https://tell.test/t/${DEMO_RUN_ID}/4`);
  });
});
