import { describe, expect, it } from 'vitest';
import { SAMPLE_CARD } from '@tell/shared';
import { scoreLine } from './text';

describe('scoreLine', () => {
  it('names inconclusive results on the sample card without changing the 3 of 6 count', () => {
    const sample = SAMPLE_CARD.payload;
    expect(sample.v).toBe(3);
    if (sample.v !== 3) throw new Error('sample card is not v3');
    expect(sample.score.observed).toBe(6);
    expect(sample.score.suspicious).toBe(1);
    expect(scoreLine(sample)).toBe('Fired 3 of 6 traps fetched · 1 inconclusive');
  });

  it('stays a plain fired-of-observed line when nothing was inconclusive', () => {
    const sample = SAMPLE_CARD.payload;
    expect(sample.v).toBe(3);
    if (sample.v !== 3) throw new Error('sample card is not v3');
    const payload = {
      ...sample,
      score: { observed: 7, fired: 3, noCanary: 4, suspicious: 0, reported: 0, outcome: 'tell' as const },
    };
    expect(scoreLine(payload)).toBe('Fired 3 of 7 traps fetched');
  });
});
