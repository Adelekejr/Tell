import { describe, expect, it } from 'vitest';
import {
  FAN_CARD_COUNT,
  FAN_HERO_INDEX,
  cardPose,
  dragToPos,
  fanCardIsUp,
  fanOffset,
  fanReducer,
  flingTarget,
  frontOf,
  initialFanState,
  ringOffset,
  shortestTarget,
  springDone,
  springStep,
} from './fan-state';

const ids = Array.from({ length: FAN_CARD_COUNT }, (_, i) => i);
/** Left-to-right order of the visible cards at ring position `pos`. */
const visibleOrder = (pos: number) =>
  ids.filter((i) => cardPose(ringOffset(i, pos)).opacity > 0.5).sort((a, b) => ringOffset(a, pos) - ringOffset(b, pos));

describe('fan cards', () => {
  it('flips a card and toggles it back, and ignores an out-of-range index', () => {
    const up = fanReducer(initialFanState(), { type: 'flip', index: 0 });
    expect(fanCardIsUp(up, 0)).toBe(true);
    expect(fanCardIsUp(up, FAN_HERO_INDEX)).toBe(false);
    expect(fanReducer(up, { type: 'flip', index: 0 }).up.has(0)).toBe(false);
    expect(fanReducer(up, { type: 'flip', index: 7 })).toBe(up);
  });

  it('starts with No.02 at the front index, face down', () => {
    expect(FAN_HERO_INDEX).toBe(1);
    expect(fanCardIsUp(initialFanState(), FAN_HERO_INDEX)).toBe(false);
  });
});

describe('fan ring', () => {
  it('every whole position, either way round and laps past 7, reads front-3..front+3', () => {
    for (let pos = -21; pos <= 21; pos += 1) {
      const f = frontOf(pos);
      const expected = [-3, -2, -1, 0, 1, 2, 3].map((d) => (f + d + 7) % 7);
      expect(visibleOrder(pos)).toEqual(expected);
      expect(expected.map((i) => fanOffset(i, pos))).toEqual([-3, -2, -1, 0, 1, 2, 3]);
      const zs = ids.map((i) => cardPose(ringOffset(i, pos)).z);
      expect(Math.max(...zs)).toBe(cardPose(0).z);
      expect(zs.filter((z) => z === cardPose(0).z)).toHaveLength(1);
      expect(zs[f]).toBe(cardPose(0).z);
    }
  });

  it('mid-turn, cards keep number order and a wrapping card is hidden behind the hand', () => {
    for (let pos = -14; pos <= 14; pos += 0.05) {
      const order = visibleOrder(pos);
      for (let k = 1; k < order.length; k += 1) expect(order[k]).toBe((order[k - 1]! + 1) % 7);
      for (const i of ids) {
        const o = ringOffset(i, pos);
        expect(o).toBeGreaterThanOrEqual(-3.5);
        expect(o).toBeLessThan(3.5);
        // Only the half card nearest the back fades; at ±3.5 it is gone.
        if (Math.abs(o) > 3.45) expect(cardPose(o).opacity).toBeLessThan(0.11);
        if (Math.abs(o) <= 3) expect(cardPose(o).opacity).toBe(1);
      }
    }
  });

  it('poses: the front card stands up, further cards tilt, shrink and sink', () => {
    expect(cardPose(0)).toMatchObject({ rot: 0, lift: -22, scale: 1, opacity: 1 });
    expect(cardPose(-1).rot).toBe(-8);
    expect(cardPose(2).scale).toBeLessThan(cardPose(1).scale);
    expect(cardPose(2).lift).toBeGreaterThan(cardPose(1).lift);
    expect(cardPose(1).z).toBeGreaterThan(cardPose(2).z);
  });

  it('dragging follows the finger: left brings later cards forward', () => {
    expect(dragToPos(1, -73, 73)).toBe(2);
    expect(dragToPos(1, 146, 73)).toBe(-1);
    expect(dragToPos(1, -36, 72)).toBe(1.5);
  });

  it('a slow release snaps to the nearest card; a flick carries on but never laps', () => {
    expect(flingTarget(1.4, 0)).toBe(1);
    expect(flingTarget(1.6, 1)).toBe(2);
    expect(flingTarget(1.2, 20)).toBe(3);
    expect(flingTarget(1.2, -20)).toBe(-1);
    expect(flingTarget(4.6, 200, 1)).toBe(5);
    expect(flingTarget(-2.6, -200, 1)).toBe(-3);
  });

  it('a tap rolls the short way to the card', () => {
    expect(shortestTarget(1, 2)).toBe(2);
    expect(shortestTarget(1, 5)).toBe(-2);
    expect(shortestTarget(1, 4)).toBe(4);
    expect(shortestTarget(15, 0)).toBe(14);
    for (let i = 0; i < 7; i += 1) expect(frontOf(shortestTarget(-9, i))).toBe(i);
  });

  it('the snap spring settles on the target with only a small overshoot', () => {
    let s = { x: 0, v: 8 };
    let max = 0;
    let steps = 0;
    while (!springDone(s, 1) && steps < 2000) {
      s = springStep(s, 1, 1 / 120);
      max = Math.max(max, s.x);
      steps += 1;
    }
    expect(springDone(s, 1)).toBe(true);
    expect(steps / 120).toBeLessThan(1.2);
    expect(max).toBeLessThan(1.35);
  });
});
