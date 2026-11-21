import { describe, expect, it } from 'vitest';
import { FAN_CARD_COUNT, fanCardIsUp, fanOffset, fanOrder, fanReducer, fanZ, initialFanState } from './fan-state';

const order = (active: number) =>
  Array.from({ length: FAN_CARD_COUNT }, (_, i) => i).sort((a, b) => fanOffset(a, active) - fanOffset(b, active));

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

  it('ignores invalid transitions', () => {
    const initial = initialFanState();
    expect(fanReducer(initial, { type: 'flip', index: 7, reduced: false })).toBe(initial);
    expect(fanReducer(initial, { type: 'select', index: -1, reduced: false })).toBe(initial);
    expect(fanReducer(initial, { type: 'rotate', step: 0 })).toBe(initial);
  });

  it('turns all the way round in either direction', () => {
    let s = initialFanState();
    for (let k = 0; k < FAN_CARD_COUNT; k += 1) s = fanReducer(s, { type: 'rotate', step: 1 });
    expect(s.active).toBe(3);
    for (let k = 0; k < FAN_CARD_COUNT; k += 1) s = fanReducer(s, { type: 'rotate', step: -1 });
    expect(s.active).toBe(3);
    expect(fanReducer(s, { type: 'rotate', step: -4 }).active).toBe(6);
    expect(fanReducer(s, { type: 'rotate', step: 5 }).active).toBe(1);
  });

  it('every front card and both directions read in number order, active-3..active+3', () => {
    for (const step of [1, -1]) {
      let s = initialFanState();
      for (let k = 0; k < FAN_CARD_COUNT * 2; k += 1) {
        s = fanReducer(s, { type: 'rotate', step });
        const a = s.active;
        const expected = [-3, -2, -1, 0, 1, 2, 3].map((d) => (a + d + FAN_CARD_COUNT) % FAN_CARD_COUNT);
        expect(order(a)).toEqual(expected);
        expect(fanOrder(a)).toEqual(expected);
        // Offsets are exactly -3..3, and the front card is always on top, then outward.
        expect(expected.map((i) => fanOffset(i, a))).toEqual([-3, -2, -1, 0, 1, 2, 3]);
        expect(expected.map((i) => fanZ(fanOffset(i, a)))).toEqual([7, 8, 9, 10, 9, 8, 7]);
      }
    }
  });

  it('selecting another card brings it to the front; selecting the front card flips it', () => {
    const s = initialFanState();
    for (let i = 0; i < FAN_CARD_COUNT; i += 1) {
      const next = fanReducer(s, { type: 'select', index: i, reduced: false });
      expect(next.active).toBe(i);
      expect(fanOffset(i, next.active)).toBe(0);
    }
    const flipped = fanReducer(s, { type: 'select', index: 3, reduced: false });
    expect(flipped.active).toBe(3);
    expect(flipped.up.has(3)).toBe(true);
    const moved = fanReducer(s, { type: 'select', index: 5, reduced: false });
    expect(moved.up.size).toBe(0);
    expect(fanReducer(moved, { type: 'select', index: 5, reduced: false }).up.has(5)).toBe(true);
  });
});
