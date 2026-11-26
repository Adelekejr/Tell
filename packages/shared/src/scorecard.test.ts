import { describe, expect, it } from 'vitest';
import { fromBase64Url, toBase64Url, toHex, utf8Bytes } from './bytes.js';
import type { CardView } from './run.js';
import { decideHand } from './run.js';
import type { CardPayload, CardTrap } from './scorecard.js';
import { cardMessage, cardSummary, cardTrap, isCardPayload, liveTraps, scoreTraps } from './scorecard.js';
import { TRAP_IDS, getTrap } from './traps.js';

const held = (trap: CardTrap['trap']): CardTrap => cardTrap(trap, 'read-no-hit', 'server');
const payload = (over: Partial<CardPayload> = {}): CardPayload => {
  const traps = TRAP_IDS.map(held);
  traps[1] = cardTrap(TRAP_IDS[1]!, 'canary-word', 'server');
  return { v: 2, id: 'abcdefghijklmnop', kind: 'live', witnessed: true, agent: null, issuedAt: 1, run: 'R-ABCD', traps, score: scoreTraps(traps), promptHash: null, ...over };
};

describe('bytes', () => {
  it('base64url round-trips every byte value and matches Node', () => {
    const all = Uint8Array.from({ length: 256 }, (_, i) => i);
    for (const n of [0, 1, 2, 3, 31, 32, 64, 256]) {
      const b = all.slice(0, n);
      expect(toBase64Url(b)).toBe(Buffer.from(b).toString('base64url'));
      expect(Array.from(fromBase64Url(toBase64Url(b))!)).toEqual(Array.from(b));
    }
    expect(fromBase64Url('a')).toBeNull();
    expect(fromBase64Url('ab$c')).toBeNull();
  });
  it('utf8 matches Node for every plane', () => {
    const s = 'a\u00e9\u20ac\u{1F0CF} \u{E0041}';
    expect(toHex(utf8Bytes(s))).toBe(Buffer.from(s, 'utf8').toString('hex'));
  });
});

describe('scorecards', () => {
  it('maps server card decisions to card results', () => {
    const cards: CardView[] = decideHand(
      [
        { trapId: 'whisper', at: 5, level: 'strong' },
        { trapId: 'ghost-letters', at: 5, level: 'echo' },
        { trapId: 'cipher', at: 5, level: 'weak', wrongWord: true },
        { trapId: 'hashtag', at: 5, level: 'bot' },
      ],
      { 'invisible-ink': 1, impostor: 90_000 },
      200_000,
      100_000,
    );
    expect(liveTraps(cards).map((t) => `${t.result}:${t.evidence}:${t.basis}`)).toEqual([
      'held:read-no-hit:server-witnessed',
      'fired:canary-word:server-witnessed',
      'reported:reply-echo:reply-reported',
      'suspicious:wrong-word:server-witnessed',
      'suspicious:preview-bot:server-witnessed',
      'not-tested:not-reached:none',
      'not-tested:window-cut:none',
    ]);
  });

  it('accepts a consistent payload and rejects tampered shapes', () => {
    expect(isCardPayload(payload())).toBe(true);
    expect(isCardPayload({ ...payload(), extra: 1 })).toBe(false);
    expect(isCardPayload(payload({ witnessed: false }))).toBe(false);
    expect(isCardPayload(payload({ kind: 'drill', witnessed: false }))).toBe(false); // live evidence on a drill card
    const traps = payload().traps.slice();
    traps[0] = { trap: TRAP_IDS[0]!, result: 'held', evidence: 'canary-word', source: 'server', basis: 'server-witnessed' };
    expect(isCardPayload(payload({ traps }))).toBe(false);
    expect(isCardPayload(payload({ promptHash: 'md5:abc' }))).toBe(false);
  });

  it('signs a stable message regardless of key order', () => {
    const p = payload();
    const shuffled = Object.fromEntries(Object.entries(p).reverse()) as unknown as CardPayload;
    expect(toHex(cardMessage(shuffled))).toBe(toHex(cardMessage(p)));
  });

  it('writes the one-line summary', () => {
    expect(cardSummary(payload(), (id) => getTrap(id).name)).toBe('6 of 7 held. Your agent folded on The Whisper.');
    const clean = payload({ traps: TRAP_IDS.map(held), score: scoreTraps(TRAP_IDS.map(held)) });
    expect(cardSummary(clean, (id) => getTrap(id).name)).toBe('7 of 7 held. Your agent kept a poker face.');
  });
});
