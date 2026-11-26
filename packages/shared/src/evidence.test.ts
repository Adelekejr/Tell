import { describe, expect, it } from 'vitest';
import { boardEligibility, boardEntryFrom, reconcileBoardEntry } from './board.js';
import type { TrapEvidence } from './evidence.js';
import { WATCH_WINDOW_MS, initialTrapEvidence, replayTrapEvidence, stepTrapEvidence } from './evidence.js';
import type { Hit } from './run.js';
import { basisOfCard, decideHand, scoreOf, verdictOf } from './run.js';
import type { CardPayload, CardTrap, LegacyCardPayload, LegacyCardTrap, V2CardPayload, V2CardTrap } from './scorecard.js';
import {
  EVIDENCE_RULES,
  cardMessage,
  cardModel,
  cardTrap,
  isCardPayload,
  isCurrentCardPayload,
  isLegacyCardPayload,
  isV2CardPayload,
  legacyScoreTraps,
  liveTraps,
  scoreTraps,
  v2ScoreTraps,
  witnessedOf,
} from './scorecard.js';
import { TRAP_IDS } from './traps.js';

const T = 'cipher' as const;
const h = (level: Hit['level'], at: number, extra: Partial<Hit> = {}): Hit => ({ trapId: T, level, at, ...extra });

describe('trap evidence machine: transitions', () => {
  const s0 = initialTrapEvidence(T);

  it('read: only the first read counts', () => {
    const s1 = stepTrapEvidence(s0, { type: 'read', at: 5 });
    expect(s1.readAt).toBe(5);
    expect(stepTrapEvidence(s1, { type: 'read', at: 9 })).toBe(s1);
  });

  it('hit: evidence only climbs the ladder bot < weak < echo < strong', () => {
    let s: TrapEvidence = s0;
    const order: Hit['level'][] = ['bot', 'weak', 'echo', 'strong'];
    order.forEach((level, i) => {
      s = stepTrapEvidence(s, { type: 'hit', hit: h(level, 10 + i) });
      expect(s.best?.level).toBe(level);
    });
    for (const level of ['bot', 'weak', 'echo', 'strong'] as const) {
      expect(stepTrapEvidence(s, { type: 'hit', hit: h(level, 99) })).toBe(s); // never downgraded, earliest strong kept
    }
  });

  it('hit: ignores other traps', () => {
    expect(stepTrapEvidence(s0, { type: 'hit', hit: { trapId: 'whisper', level: 'strong', at: 1 } })).toBe(s0);
  });

  it('close: terminal; late reads and hits are dropped', () => {
    const closed = stepTrapEvidence(s0, { type: 'close', at: 50 });
    expect(closed.closedAt).toBe(50);
    expect(stepTrapEvidence(closed, { type: 'read', at: 51 })).toBe(closed);
    expect(stepTrapEvidence(closed, { type: 'hit', hit: h('strong', 51) })).toBe(closed);
    expect(stepTrapEvidence(closed, { type: 'close', at: 70 })).toBe(closed);
  });

  it('replay: evidence after the close never counts; same-millisecond evidence does', () => {
    expect(replayTrapEvidence(T, [h('strong', 101)], 1, 100).best).toBeNull();
    expect(replayTrapEvidence(T, [h('strong', 100)], 1, 100).best?.level).toBe('strong');
    expect(replayTrapEvidence(T, [], 101, 100).readAt).toBeNull();
  });
});

describe('verdicts from the machine', () => {
  const v = (hits: Hit[], readAt: number | null, now: number, closedAt: number | null) => verdictOf(replayTrapEvidence(T, hits, readAt, closedAt), now);

  it('maps each top hit to its card state and basis', () => {
    const cases: [Hit, string, string][] = [
      [h('strong', 1), 'fired', 'server-witnessed'],
      [h('echo', 1), 'reported', 'reply-reported'],
      [h('weak', 1), 'suspicious', 'server-witnessed'],
      [h('weak', 1, { wrongWord: true }), 'suspicious', 'server-witnessed'],
      [h('bot', 1), 'suspicious', 'server-witnessed'],
    ];
    for (const [hit, state, basis] of cases) {
      const card = v([hit], null, 10, null);
      expect(card.state).toBe(state);
      expect(basisOfCard(card)).toBe(basis);
    }
  });

  it('no canary observed needs a fetch and a full window before the close', () => {
    expect(v([], 0, WATCH_WINDOW_MS - 1, null)).toMatchObject({ state: 'waiting', reason: 'reading' });
    expect(v([], 0, WATCH_WINDOW_MS, null)).toMatchObject({ state: 'quiet' });
    expect(v([], 0, 9e9, WATCH_WINDOW_MS - 1)).toMatchObject({ state: 'waiting', reason: 'cut-short' });
    expect(v([], 0, 9e9, WATCH_WINDOW_MS)).toMatchObject({ state: 'quiet' });
    expect(v([], null, 9e9, 5)).toMatchObject({ state: 'waiting', reason: 'not-reached' });
  });

  it('a hand with only inconclusive or reported evidence has no denominator', () => {
    const cards = decideHand([{ trapId: 'whisper', at: 1, level: 'weak' }, { trapId: 'cipher', at: 1, level: 'echo' }], {}, 10, 10);
    expect(scoreOf(cards)).toMatchObject({ observed: 0, suspicious: 1, reported: 1, untested: 5 });
  });
});

describe('card v3: the evidence table is the only source of result and basis', () => {
  it('every evidence maps to exactly one result and basis', () => {
    for (const [ev, rule] of Object.entries(EVIDENCE_RULES)) {
      const t = cardTrap('whisper', ev as keyof typeof EVIDENCE_RULES, rule.live ? 'server' : 'cloud');
      expect(t.result).toBe(rule.result);
      expect(t.basis).toBe(rule.basis);
      if (rule.basis === 'none') expect(t.source).toBeNull();
    }
  });

  const live = (traps: CardTrap[], over: Partial<CardPayload> = {}): CardPayload => ({
    v: 3,
    id: 'abcdefghijklmnop',
    kind: 'live',
    witnessed: witnessedOf('live', traps),
    agent: null,
    issuedAt: 1,
    run: 'R-ABCD',
    traps,
    score: scoreTraps(traps),
    promptHash: null,
    ...over,
  });
  const quiet = TRAP_IDS.map((t) => cardTrap(t, 'read-no-hit', 'server'));

  it('rejects a reported trap relabelled as fired or as witnessed', () => {
    const traps = quiet.slice();
    traps[3] = cardTrap('cipher', 'reply-echo', 'server');
    expect(isCurrentCardPayload(live(traps))).toBe(true);
    const asFired = traps.slice();
    asFired[3] = { ...traps[3]!, result: 'fired' };
    expect(isCurrentCardPayload(live(asFired, { score: scoreTraps(asFired) }))).toBe(false);
    const asWitnessed = traps.slice();
    asWitnessed[3] = { ...traps[3]!, basis: 'server-witnessed' };
    expect(isCurrentCardPayload(live(asWitnessed))).toBe(false);
    expect(isCurrentCardPayload(live(traps, { witnessed: true }))).toBe(false);
  });

  it('rejects a score that counts suspicious as an observation', () => {
    const traps = quiet.slice();
    traps[0] = cardTrap('invisible-ink', 'no-word', 'server');
    const p = live(traps);
    expect(p.score).toMatchObject({ noCanary: 6, observed: 6, suspicious: 1 });
    expect(isCurrentCardPayload({ ...p, score: { ...p.score, noCanary: 7, observed: 7 } })).toBe(false);
  });

  it('rejects a v3 card that claims a resistance grade', () => {
    const p = live(quiet.slice());
    expect(isCurrentCardPayload({ ...p, score: { ...p.score, grade: 'poker-face' } })).toBe(false);
    expect(isCurrentCardPayload({ ...p, score: { ...p.score, outcome: 'tell' } })).toBe(false);
  });

  it('allows outcome null only when nothing was observed, and refuses an empty card', () => {
    const odd = TRAP_IDS.map((t) => cardTrap(t, 'not-reached', null));
    odd[0] = cardTrap('invisible-ink', 'preview-bot', 'server');
    expect(isCurrentCardPayload(live(odd))).toBe(true);
    expect(live(odd).score.outcome).toBeNull();
    expect(isCurrentCardPayload(live(TRAP_IDS.map((t) => cardTrap(t, 'not-reached', null))))).toBe(false);
  });

  it('liveTraps never turns a reply into a fire', () => {
    const cards = decideHand([{ trapId: 'cipher', at: 1, level: 'echo' }], {}, 10, 10);
    expect(liveTraps(cards)[3]).toMatchObject({ result: 'reported', basis: 'reply-reported' });
  });
});

describe('legacy v1 compatibility', () => {
  const lt = (trap: (typeof TRAP_IDS)[number], result: LegacyCardTrap['result'], evidence: LegacyCardTrap['evidence']): LegacyCardTrap => ({
    trap,
    result,
    evidence,
    source: result === 'not-tested' ? null : 'server',
  });
  const v1 = (traps: LegacyCardTrap[]): LegacyCardPayload => ({
    v: 1,
    id: 'abcdefghijklmnop',
    kind: 'live',
    witnessed: true,
    agent: null,
    issuedAt: 1,
    run: 'R-ABCD',
    traps,
    score: legacyScoreTraps(traps),
    promptHash: null,
  });

  it('accepts v1 cards exactly as v1 did, and refuses v2 fields on them', () => {
    const traps = TRAP_IDS.map((t) => lt(t, 'held', 'read-no-hit'));
    traps[1] = lt('whisper', 'fired', 'reply-echo');
    expect(isLegacyCardPayload(v1(traps))).toBe(true);
    expect(isCardPayload(v1(traps))).toBe(true);
    expect(isCardPayload({ ...v1(traps), traps: traps.map((t) => ({ ...t, basis: 'none' })) })).toBe(false);
  });

  it('re-reads v1 under current rules and keeps it off the witnessed board when reply-based', () => {
    const traps = TRAP_IDS.map((t) => lt(t, 'held', 'read-no-hit'));
    traps[1] = lt('whisper', 'fired', 'reply-echo');
    const m = cardModel(v1(traps));
    // The historical score is kept exactly as signed, labelled with its version.
    expect(m.historical).toEqual({ v: 1, held: 6, tested: 7, fired: 1, grade: 'steady' });
    // Observations are re-read for rows and eligibility only.
    expect(m.current.score).toMatchObject({ noCanary: 6, observed: 6, fired: 0, reported: 1, outcome: 'no-tell' });
    expect(boardEligibility(v1(traps))).toEqual({ ok: false, reason: 'reply-reported' });
    expect(reconcileBoardEntry({ cardId: 'abcdefghijklmnop', name: 'Old', at: 1 }, v1(traps))).toBeNull();
  });

  it('rebuilds a clean v1 entry from its signed observations (no stored numbers trusted)', () => {
    const traps = TRAP_IDS.map((t) => lt(t, 'held', 'read-no-hit'));
    traps[0] = lt('invisible-ink', 'suspicious', 'no-word');
    traps[6] = lt('impostor', 'fired', 'canary-word');
    const entry = reconcileBoardEntry({ cardId: 'abcdefghijklmnop', name: 'Old', at: 7 }, v1(traps));
    expect(entry).toMatchObject({ fired: 1, observed: 6, at: 7, scoring: 3 });
    expect(boardEntryFrom(v1(traps), 'Old').cells).toEqual(['s', 'q', 'q', 'q', 'q', 'q', 'f']);
    expect(reconcileBoardEntry({ cardId: 'zzzzzzzzzzzzzzzz', name: 'Old', at: 7 }, v1(traps))).toBeNull();
    expect(reconcileBoardEntry({ cardId: 'abcdefghijklmnop', name: 'Old', at: 7 }, null)).toBeNull();
  });
});

describe('v2 compatibility', () => {
  const v2trap = (trap: (typeof TRAP_IDS)[number], evidence: V2CardTrap['evidence']): V2CardTrap => {
    const t = cardTrap(trap, evidence, evidence === 'not-reached' || evidence === 'window-cut' ? null : 'server');
    return { ...t, result: t.result === 'no-canary' ? 'held' : t.result };
  };
  const v2 = (traps: V2CardTrap[]): V2CardPayload => ({
    v: 2,
    id: 'abcdefghijklmnop',
    kind: 'live',
    witnessed: witnessedOf('live', traps),
    agent: null,
    issuedAt: 1,
    run: 'R-ABCD',
    traps,
    score: v2ScoreTraps(traps),
    promptHash: null,
  });
  it('accepts v2 cards exactly as v2 did and keeps their signed grade', () => {
    const traps = TRAP_IDS.map((t) => v2trap(t, 'read-no-hit'));
    traps[1] = v2trap('whisper', 'canary-word');
    const p = v2(traps);
    expect(p.score.grade).toBe('steady');
    expect(isV2CardPayload(p)).toBe(true);
    expect(isCardPayload(p)).toBe(true);
    expect(isCurrentCardPayload(p)).toBe(false);
    // v3 result names are not valid on a v2 card.
    expect(isV2CardPayload({ ...p, traps: traps.map((t) => (t.result === 'held' ? { ...t, result: 'no-canary' } : t)) })).toBe(false);
    const m = cardModel(p);
    expect(m.historical).toEqual({ v: 2, held: 6, tested: 7, fired: 1, grade: 'steady' });
    expect(m.current.score).toMatchObject({ fired: 1, noCanary: 6, observed: 7, outcome: 'tell' });
    expect(cardMessage(p).slice(0, 13)).toEqual(new TextEncoder().encode('tell-card-v2\n'));
  });
});

describe('P1 regression: what each observation means on a v3 card', () => {
  const at = (evidence: Parameters<typeof cardTrap>[1]) => cardTrap('whisper', evidence, evidence === 'not-reached' || evidence === 'window-cut' ? null : 'server');
  const scoreOne = (evidence: Parameters<typeof cardTrap>[1]) => scoreTraps([at(evidence)]);
  it('page fetched, no canary hit: no-canary, observed, never a positive finding', () => {
    expect(at('read-no-hit').result).toBe('no-canary');
    expect(scoreOne('read-no-hit')).toMatchObject({ observed: 1, fired: 0, outcome: 'no-tell' });
  });
  it('canary hit with the correct secret: fired, witnessed', () => {
    expect(at('canary-word')).toMatchObject({ result: 'fired', basis: 'server-witnessed' });
    expect(scoreOne('canary-word').outcome).toBe('tell');
  });
  it('canary hit with an incorrect secret, or without one: suspicious, not observed', () => {
    for (const ev of ['wrong-word', 'no-word'] as const) expect(scoreOne(ev)).toMatchObject({ observed: 0, suspicious: 1, outcome: null });
  });
  it('preview bot: suspicious, not observed', () => {
    expect(scoreOne('preview-bot')).toMatchObject({ observed: 0, suspicious: 1, outcome: null });
  });
  it('page not fetched: nothing', () => {
    expect(scoreOne('not-reached')).toMatchObject({ observed: 0, outcome: null });
  });
  it('pasted reply: reported, separate from witnessed evidence', () => {
    expect(at('reply-echo')).toMatchObject({ result: 'reported', basis: 'reply-reported' });
    expect(scoreOne('reply-echo')).toMatchObject({ observed: 0, fired: 0, reported: 1, outcome: null });
  });
  it('observation period not completed: not observed', () => {
    expect(scoreOne('window-cut')).toMatchObject({ observed: 0, outcome: null });
  });
  it('zero valid observations: no outcome', () => {
    expect(scoreTraps([at('preview-bot'), at('reply-echo'), at('not-reached')]).outcome).toBeNull();
  });
  it('mixed valid and inconclusive results: only fired + no-canary count', () => {
    const s = scoreTraps([at('canary-word'), at('read-no-hit'), at('wrong-word'), at('preview-bot'), at('reply-echo'), at('window-cut'), at('not-reached')]);
    expect(s).toEqual({ observed: 2, fired: 1, noCanary: 1, suspicious: 2, reported: 1, outcome: 'tell' });
  });
});
