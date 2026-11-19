/**
 * The public board: live-tested agents only. Entries are written by Tell's
 * server alone, from a signed live card, and carry no personal data: an agent
 * name the user picked, the score, and the date.
 */
import type { GradeId } from './proof.js';
import type { CardPayload } from './scorecard.js';

/** One cell per trap, in trap order: f = fired, h = held, s = suspicious (counted as held), w = not tested. */
export type BoardCell = 'f' | 'h' | 's' | 'w';

export interface BoardEntry {
  cardId: string;
  name: string;
  held: number;
  tested: number;
  grade: GradeId;
  cells: BoardCell[];
  /** When the card was signed (epoch ms). */
  at: number;
}

export type BoardRange = 'week' | 'all';

export const BOARD_PAGE = 50;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function boardEntryFrom(card: CardPayload, name: string): BoardEntry {
  const cell: Record<string, BoardCell> = { fired: 'f', held: 'h', suspicious: 's', 'not-tested': 'w' };
  return {
    cardId: card.id,
    name,
    held: card.score.held,
    tested: card.score.tested,
    grade: card.score.grade,
    cells: card.traps.map((t) => cell[t.result] as BoardCell),
    at: card.issuedAt,
  };
}

/**
 * Best first: share of traps held, then more traps tested (7/7 beats 3/3),
 * then the earlier card (who got there first). Ties break by id so the order
 * is stable.
 */
export function rankBoard(
  entries: readonly BoardEntry[],
  opts: { range: BoardRange; pokerFaceOnly: boolean; now: number; limit?: number },
): BoardEntry[] {
  return entries
    .filter((e) => opts.range === 'all' || opts.now - e.at <= WEEK_MS)
    .filter((e) => !opts.pokerFaceOnly || e.grade === 'poker-face')
    .slice()
    .sort((a, b) => b.held / b.tested - a.held / a.tested || b.tested - a.tested || a.at - b.at || (a.cardId < b.cardId ? -1 : 1))
    .slice(0, opts.limit ?? BOARD_PAGE);
}

export type NameCheck = { ok: true; name: string } | { ok: false; reason: string };

/** A short list of words that never belong on a public board. Kept small on purpose. */
const BLOCKED = /\b(fuck|shit|cunt|nigg|fag|rape|nazi|hitler|porn|sex|kill\s*yourself|kys)/i;

/**
 * Agent names for cards and the board: 3-40 characters of letters, numbers,
 * spaces and a few marks. No links, email addresses or phone numbers, so a
 * name can't carry personal data or spam.
 */
export function checkAgentName(raw: unknown): NameCheck {
  if (typeof raw !== 'string') return { ok: false, reason: 'Give your agent a name.' };
  const name = raw.normalize('NFKC').replace(/\s+/g, ' ').trim();
  if (name.length < 3) return { ok: false, reason: 'Use at least 3 characters.' };
  if (name.length > 40) return { ok: false, reason: 'Keep it to 40 characters.' };
  if (/@|https?|www\.|\.(com|net|org|io|ai|app|dev|co)\b/i.test(name)) return { ok: false, reason: 'No links or email addresses.' };
  if (!/^[\p{L}\p{N}][\p{L}\p{N} .,'&+()_-]*$/u.test(name)) {
    return { ok: false, reason: 'Use letters, numbers, spaces and simple marks only.' };
  }
  if ((name.match(/\p{N}/gu) ?? []).length >= 7) return { ok: false, reason: 'No phone numbers or long numbers.' };
  if (BLOCKED.test(name)) return { ok: false, reason: 'Pick a different name.' };
  return { ok: true, name };
}
