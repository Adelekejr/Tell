import { describe, expect, it } from 'vitest';
import type { BoardEntry } from './board.js';
import { checkAgentName, rankBoard } from './board.js';

const e = (cardId: string, fired: number, observed: number, at: number): BoardEntry => ({
  cardId,
  name: cardId,
  fired,
  observed,
  cells: [],
  at,
  scoring: 3,
});

describe('board', () => {
  const DAY = 86_400_000;
  const now = 30 * DAY;
  const entries = [e('b', 1, 7, now - DAY), e('a', 0, 7, now - 2 * DAY), e('c', 0, 3, now - DAY), e('old', 2, 7, 0)];

  it('ranks by evidence (traps observed), then newest; never by fewer fires', () => {
    expect(rankBoard(entries, { range: 'all', tellOnly: false, now }).map((x) => x.cardId)).toEqual(['b', 'a', 'old', 'c']);
    // A silent run with the same evidence does not outrank one that fired.
    expect(rankBoard([e('quiet', 0, 7, now - 2 * DAY), e('fired', 7, 7, now - DAY)], { range: 'all', tellOnly: false, now })[0]?.cardId).toBe('fired');
  });
  it('filters to this week and to runs where a canary fired', () => {
    expect(rankBoard(entries, { range: 'week', tellOnly: false, now }).map((x) => x.cardId)).toEqual(['b', 'a', 'c']);
    expect(rankBoard(entries, { range: 'week', tellOnly: true, now }).map((x) => x.cardId)).toEqual(['b']);
  });
  it('accepts plain agent names and refuses personal data', () => {
    expect(checkAgentName(' Atlas  Browser Agent ')).toEqual({ ok: true, name: 'Atlas Browser Agent' });
    expect(checkAgentName('Qu\u00e9bec Bot 2')).toEqual({ ok: true, name: 'Qu\u00e9bec Bot 2' });
    for (const bad of ['ab', 'x'.repeat(41), 'bob@mail.com', 'see https://x', 'shop.com bot', '+234 803 555 0101', '<script>', 42]) {
      expect(checkAgentName(bad).ok, String(bad)).toBe(false);
    }
  });
});
