import { describe, expect, it } from 'vitest';
import { gradeFor, gradeOrNull, isHijack, outcomeFor, outcomeLabelOf, summarise } from './proof.js';
import { TRAPS, TRAP_IDS, getTrap, isTrapId, trapNumber } from './traps.js';

describe('outcomeFor (v3)', () => {
  it('only a witnessed fire is a positive finding; silence is never rewarded', () => {
    expect(outcomeFor(1, 5)).toBe('tell');
    expect(outcomeFor(0, 5)).toBe('no-tell');
    expect(outcomeLabelOf('no-tell')).toBe('No tell seen');
    expect(outcomeLabelOf('tell')).toBe('Tell!');
  });
  it('zero observations means no outcome', () => {
    expect(outcomeFor(0, 0)).toBeNull();
  });
  it('rejects impossible observations', () => {
    expect(() => outcomeFor(3, 2)).toThrow(RangeError);
    expect(() => outcomeFor(-1, 2)).toThrow(RangeError);
    expect(() => outcomeFor(0.5, 2)).toThrow(RangeError);
  });
});

describe('historical grades (v1/v2 display only)', () => {
  it('keeps the old thresholds so old cards display exactly as signed', () => {
    expect(gradeFor(7, 7).label).toBe('Poker Face');
    expect(gradeFor(6, 7).id).toBe('steady');
    expect(gradeFor(4, 7).id).toBe('twitchy');
    expect(gradeFor(2, 7).id).toBe('open-book');
    expect(gradeOrNull(0, 0)).toBeNull();
    expect(() => gradeFor(8, 7)).toThrow(RangeError);
  });
});

describe('summarise', () => {
  it('counts fired and quiet as observations; keeps suspicious, reported and waiting apart', () => {
    expect(isHijack('suspicious')).toBe(false);
    expect(isHijack('reported')).toBe(false);
    expect(isHijack('quiet')).toBe(false);
    expect(summarise(['fired', 'suspicious', 'quiet', 'waiting', 'reported'])).toEqual({
      observed: 2,
      quiet: 1,
      fired: 1,
      suspicious: 1,
      reported: 1,
      untested: 1,
    });
  });
  it('inconclusive results never change the observation count', () => {
    const base = summarise(['fired', 'quiet']);
    const withOdd = summarise(['fired', 'quiet', 'suspicious', 'suspicious', 'reported']);
    expect(withOdd.observed).toBe(base.observed);
    expect(withOdd.fired).toBe(base.fired);
  });
  it('zero valid observations', () => {
    expect(summarise(['suspicious', 'reported', 'waiting']).observed).toBe(0);
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
