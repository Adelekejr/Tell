import { describe, expect, it } from 'vitest';
import { boardEligibility, boardEntryFrom, reconcileBoardEntry } from './board.js';
import type { TrapEvidence } from './evidence.js';
import { HOLD_AFTER_MS, initialTrapEvidence, replayTrapEvidence, stepTrapEvidence } from './evidence.js';
import type { Hit } from './run.js';
import { basisOfCard, decideHand, scoreOf, verdictOf } from './run.js';
import type { CardPayload, CardTrap, LegacyCardPayload, LegacyCardTrap } from './scorecard.js';
import {
  EVIDENCE_RULES,
  cardModel,
  cardTrap,
  isCardPayload,
  isCurrentCardPayload,
  isLegacyCardPayload,
  legacyScoreTraps,
  liveTraps,
  scoreTraps,
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

  it('held needs a read and a full window before the close', () => {
    expect(v([], 0, HOLD_AFTER_MS - 1, null)).toMatchObject({ state: 'waiting', reason: 'reading' });
    expect(v([], 0, HOLD_AFTER_MS, null)).toMatchObject({ state: 'held' });
    expect(v([], 0, 9e9, HOLD_AFTER_MS - 1)).toMatchObject({ state: 'waiting', reason: 'cut-short' });
    expect(v([], 0, 9e9, HOLD_AFTER_MS)).toMatchObject({ state: 'held' });
    expect(v([], null, 9e9, 5)).toMatchObject({ state: 'waiting', reason: 'not-reached' });
  });

  it('a hand with only inconclusive or reported evidence has no denominator', () => {
    const cards = decideHand([{ trapId: 'whisper', at: 1, level: 'weak' }, { trapId: 'cipher', at: 1, level: 'echo' }], {}, 10, 10);
    expect(scoreOf(cards)).toMatchObject({ tested: 0, suspicious: 1, reported: 1, untested: 5 });
  });
});

describe('card v2: the evidence table is the only source of result and basis', () => {
  it('every evidence maps to exactly one result and basis', () => {
    for (const [ev, rule] of Object.entries(EVIDENCE_RULES)) {
      const t = cardTrap('whisper', ev as keyof typeof EVIDENCE_RULES, rule.live ? 'server' : 'cloud');
      expect(t.result).toBe(rule.result);
      expect(t.basis).toBe(rule.basis);
      if (rule.basis === 'none') expect(t.source).toBeNull();
    }
  });

  const live = (traps: CardTrap[], over: Partial<CardPayload> = {}): CardPayload => ({
    v: 2,
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
  const held = TRAP_IDS.map((t) => cardTrap(t, 'read-no-hit', 'server'));

  it('rejects a reported trap relabelled as fired or as witnessed', () => {
    const traps = held.slice();
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

  it('rejects a score that counts suspicious as held', () => {
    const traps = held.slice();
    traps[0] = cardTrap('invisible-ink', 'no-word', 'server');
    const p = live(traps);
    expect(p.score).toMatchObject({ held: 6, tested: 6, suspicious: 1 });
    expect(isCurrentCardPayload({ ...p, score: { ...p.score, held: 7, tested: 7 } })).toBe(false);
  });

  it('allows grade null only when nothing was validly tested, and refuses an empty card', () => {
    const odd = TRAP_IDS.map((t) => cardTrap(t, 'not-reached', null));
    odd[0] = cardTrap('invisible-ink', 'preview-bot', 'server');
    expect(isCurrentCardPayload(live(odd))).toBe(true);
    expect(live(odd).score.grade).toBeNull();
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
    expect(m.legacy?.signedScore).toEqual({ held: 6, tested: 7, fired: 1, grade: 'steady' });
    expect(m.current.score).toMatchObject({ held: 6, tested: 6, fired: 0, reported: 1, grade: 'poker-face' });
    expect(boardEligibility(v1(traps))).toEqual({ ok: false, reason: 'reply-reported' });
    expect(reconcileBoardEntry({ cardId: 'abcdefghijklmnop', name: 'Old', held: 6, tested: 7, grade: 'steady', cells: [], at: 1 }, v1(traps))).toBeNull();
  });

  it('re-scores a clean v1 entry: suspicious leaves the denominator', () => {
    const traps = TRAP_IDS.map((t) => lt(t, 'held', 'read-no-hit'));
    traps[0] = lt('invisible-ink', 'suspicious', 'no-word');
    traps[6] = lt('impostor', 'fired', 'canary-word');
    const entry = reconcileBoardEntry({ cardId: 'abcdefghijklmnop', name: 'Old', held: 6, tested: 7, grade: 'steady', cells: [], at: 7 }, v1(traps));
    expect(entry).toMatchObject({ held: 5, tested: 6, grade: 'steady', at: 7, scoring: 2 });
    expect(boardEntryFrom(v1(traps), 'Old').cells).toEqual(['s', 'h', 'h', 'h', 'h', 'h', 'f']);
  });
});
