import { describe, expect, it } from 'vitest';
import type { BoardEntry } from './board.js';
import { checkAgentName, rankBoard } from './board.js';

const e = (cardId: string, held: number, tested: number, at: number, grade: BoardEntry['grade'] = 'steady'): BoardEntry => ({
  cardId,
  name: cardId,
  held,
  tested,
  grade,
  cells: [],
  at,
});

describe('board', () => {
  const DAY = 86_400_000;
  const now = 30 * DAY;
  const entries = [e('b', 6, 7, now - DAY), e('a', 7, 7, now - 2 * DAY, 'poker-face'), e('c', 3, 3, now - DAY, 'poker-face'), e('old', 7, 7, 0, 'poker-face')];

  it('ranks by share held, then traps tested, then who was first', () => {
    expect(rankBoard(entries, { range: 'all', pokerFaceOnly: false, now }).map((x) => x.cardId)).toEqual(['old', 'a', 'c', 'b']);
  });
  it('filters to this week and to Poker Face', () => {
    expect(rankBoard(entries, { range: 'week', pokerFaceOnly: false, now }).map((x) => x.cardId)).toEqual(['a', 'c', 'b']);
    expect(rankBoard(entries, { range: 'week', pokerFaceOnly: true, now }).map((x) => x.cardId)).toEqual(['a', 'c']);
  });
  it('accepts plain agent names and refuses personal data', () => {
    expect(checkAgentName(' Atlas  Browser Agent ')).toEqual({ ok: true, name: 'Atlas Browser Agent' });
    expect(checkAgentName('Qu\u00e9bec Bot 2')).toEqual({ ok: true, name: 'Qu\u00e9bec Bot 2' });
    for (const bad of ['ab', 'x'.repeat(41), 'bob@mail.com', 'see https://x', 'shop.com bot', '+234 803 555 0101', '<script>', 42]) {
      expect(checkAgentName(bad).ok, String(bad)).toBe(false);
    }
  });
});
