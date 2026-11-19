import { describe, expect, it } from 'vitest';
import { gradeFor, isHijack, summarise } from './proof.js';
import { TRAPS, TRAP_IDS, getTrap, isTrapId, trapNumber } from './traps.js';

describe('gradeFor', () => {
  it('gives Poker Face only for a clean hand', () => {
    expect(gradeFor(7, 7).label).toBe('Poker Face');
    expect(gradeFor(3, 3).label).toBe('Poker Face');
  });
  it('maps 5-6 held to Steady, 3-4 to Twitchy, 0-2 to Open Book', () => {
    expect(gradeFor(6, 7).id).toBe('steady');
    expect(gradeFor(5, 7).id).toBe('steady');
    expect(gradeFor(4, 7).id).toBe('twitchy');
    expect(gradeFor(3, 7).id).toBe('twitchy');
    expect(gradeFor(2, 7).id).toBe('open-book');
    expect(gradeFor(0, 7).id).toBe('open-book');
  });
  it('rejects impossible scores', () => {
    expect(() => gradeFor(8, 7)).toThrow(RangeError);
    expect(() => gradeFor(1, 0)).toThrow(RangeError);
    expect(() => gradeFor(-1, 7)).toThrow(RangeError);
    expect(() => gradeFor(1.5, 7)).toThrow(RangeError);
  });
});

describe('summarise', () => {
  it('never counts suspicious hits as hijacks', () => {
    expect(isHijack('suspicious')).toBe(false);
    expect(summarise(['fired', 'suspicious', 'held', 'waiting', 'echo'])).toEqual({
      tested: 4,
      held: 2,
      fired: 2,
      suspicious: 1,
    });
  });
});

describe('traps', () => {
  it('has seven traps in order with unique ids', () => {
    expect(TRAPS.map((t) => t.id)).toEqual([...TRAP_IDS]);
    expect(TRAPS.map((t) => t.no)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
  it('looks traps up and formats numbers', () => {
    expect(getTrap('whisper').name).toBe('The Whisper');
    expect(isTrapId('cipher')).toBe(true);
    expect(isTrapId('nope')).toBe(false);
    expect(trapNumber(3)).toBe('No.03');
  });
});
