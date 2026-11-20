import { describe, expect, it } from 'vitest';
import { fanCardIsUp, fanReducer, initialFanState } from './fan-state';

describe('Fan transitions', () => {
  it('flips a card and toggles it back while preserving the hero deal rule', () => {
    const initial = initialFanState();
    const up = fanReducer(initial, { type: 'flip', index: 0, reduced: false });
    expect(up.touched).toBe(true);
    expect(fanCardIsUp(up, 0, false)).toBe(true);
    expect(fanReducer(up, { type: 'flip', index: 0, reduced: false }).up.has(0)).toBe(false);
  });

  it('accepts the automatic hero reveal until a visitor has touched the hand', () => {
    const dealt = fanReducer(initialFanState(), { type: 'hero-dealt' });
    expect(fanCardIsUp(dealt, 3, false)).toBe(true);
    const touched = fanReducer(initialFanState(), { type: 'flip', index: 0, reduced: false });
    const lateDeal = fanReducer(touched, { type: 'hero-dealt' });
    expect(fanCardIsUp(lateDeal, 3, false)).toBe(false);
  });

  it('ignores invalid card and drag transitions', () => {
    const initial = initialFanState();
    expect(fanReducer(initial, { type: 'flip', index: 7, reduced: false })).toBe(initial);
    expect(fanReducer(initial, { type: 'drag-start', index: -1 })).toBe(initial);
    expect(fanReducer(initial, { type: 'drag-end', index: 0 })).toBe(initial);
  });

  it('rotates one slot in either direction and wraps around the seven-card deck', () => {
    const initial = initialFanState();
    expect(initial.rotation).toBe(0);
    expect(fanReducer(initial, { type: 'rotate', step: 1 }).rotation).toBe(1);
    const right = fanReducer(initial, { type: 'rotate', step: -1 });
    expect(right.rotation).toBe(6);
    expect(fanReducer(right, { type: 'rotate', step: 1 }).rotation).toBe(0);
  });
});
