import { describe, expect, it } from 'vitest';
import { canTransitionTrapCard, initialTrapCardState, trapCardReducer } from './trap-card-state';

describe('TrapCard transitions', () => {
  it('reveals waiting cards and animates the first reveal', () => {
    expect(trapCardReducer(initialTrapCardState('waiting'), { type: 'receive', level: 'quiet' })).toEqual({
      level: 'quiet',
      animation: 'is-flipping',
    });
  });

  it('reflips a non-fired result when it later fires', () => {
    const held = trapCardReducer(initialTrapCardState('quiet'), { type: 'receive', level: 'quiet' });
    expect(trapCardReducer(held, { type: 'receive', level: 'fired' })).toEqual({
      level: 'fired',
      animation: 'is-reflipping',
    });
  });

  it('rejects stale and illegal regressions', () => {
    expect(canTransitionTrapCard('fired', 'waiting')).toBe(false);
    expect(canTransitionTrapCard('fired', 'quiet')).toBe(false);
    expect(canTransitionTrapCard('quiet', 'suspicious')).toBe(false);
    expect(canTransitionTrapCard('suspicious', 'quiet')).toBe(false);
    expect(canTransitionTrapCard('reported', 'fired')).toBe(true);
    expect(canTransitionTrapCard('fired', 'reported')).toBe(false);
    expect(canTransitionTrapCard('quiet', 'reported')).toBe(true);
    const fired = { level: 'fired' as const, animation: '' as const };
    expect(trapCardReducer(fired, { type: 'receive', level: 'waiting' })).toBe(fired);
    expect(trapCardReducer(fired, { type: 'receive', level: 'quiet' })).toBe(fired);
    const suspicious = { level: 'suspicious' as const, animation: '' as const };
    expect(trapCardReducer(suspicious, { type: 'receive', level: 'quiet' })).toBe(suspicious);
  });

  it('clears only an active animation', () => {
    const flipping = trapCardReducer(initialTrapCardState('waiting'), { type: 'receive', level: 'suspicious' });
    expect(trapCardReducer(flipping, { type: 'animation-ended' })).toEqual({ level: 'suspicious', animation: '' });
    expect(trapCardReducer(flipping, { type: 'animation-ended' })).not.toEqual(flipping);
  });
});
