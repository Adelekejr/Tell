/**
 * The public board: server-witnessed live tests only. Entries are written by
 * Tell's server alone, from a signed live card, and carry no personal data:
 * an agent name the user picked, the score, and the date.
 *
 * Who can join (boardEligibility), in one place:
 *  - live cards only (prompt drills are browser-reported),
 *  - no result may rest on a pasted reply (reply-reported evidence is
 *    user-submitted, so it never enters the witnessed board),
 *  - at least one validly tested trap (a grade exists).
 * Old (v1) cards are re-read under these rules, so an old entry built from a
 * pasted reply drops off the board, and old scores are re-scored.
 */
import type { GradeId } from './proof.js';
import type { AnyCardPayload } from './scorecard.js';
import { cardModel } from './scorecard.js';

/** Scoring rules an entry was built under. Entries without it predate v2 and are re-checked on read. */
export const BOARD_SCORING = 2;

/** One cell per trap, in trap order: f = fired, h = held, s = inconclusive (not scored), w = not tested. */
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
  scoring: typeof BOARD_SCORING;
}

export type BoardRange = 'week' | 'all';

export const BOARD_PAGE = 50;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export type BoardEligibility =
  | { ok: true }
  | { ok: false; reason: 'drill' | 'reply-reported' | 'not-enough-evidence' };

export const BOARD_REFUSAL: Record<Extract<BoardEligibility, { ok: false }>['reason'], string> = {
  drill: 'Only live-tested cards can join the board. Prompt drills are browser-reported and stay off it.',
  'reply-reported':
    'This card includes a result found in a pasted reply. Tell didn\u2019t witness that, so the card can\u2019t join the witnessed board.',
  'not-enough-evidence': 'No trap was both read and fully watched, so there is no grade to rank.',
};

export function boardEligibility(p: AnyCardPayload): BoardEligibility {
  const { current } = cardModel(p);
  if (current.kind !== 'live') return { ok: false, reason: 'drill' };
  if (!current.witnessed || current.traps.some((t) => t.basis === 'reply-reported')) return { ok: false, reason: 'reply-reported' };
  if (current.score.grade === null || current.score.tested === 0) return { ok: false, reason: 'not-enough-evidence' };
  return { ok: true };
}

/** A board entry from an eligible card (any version), scored under the current rules. Throws otherwise. */
export function boardEntryFrom(p: AnyCardPayload, name: string): BoardEntry {
  const ok = boardEligibility(p);
  if (!ok.ok) throw new Error(`Card can't join the board: ${ok.reason}`);
  const { current } = cardModel(p);
  const cell: Record<string, BoardCell> = { fired: 'f', held: 'h', suspicious: 's', 'not-tested': 'w' };
  return {
    cardId: current.id,
    name,
    held: current.score.held,
    tested: current.score.tested,
    grade: current.score.grade as GradeId,
    cells: current.traps.map((t) => cell[t.result] as BoardCell),
    at: current.issuedAt,
    scoring: BOARD_SCORING,
  };
}

/** A stored entry that may predate v2 scoring. */
export type StoredBoardEntry = Omit<BoardEntry, 'scoring'> & { scoring?: number };

/**
 * Brings an older entry up to the current rules using its signed card:
 * re-scored if still eligible, null (off the board) if not, or if the card is gone.
 */
export function reconcileBoardEntry(entry: StoredBoardEntry, card: AnyCardPayload | null): BoardEntry | null {
  if (entry.scoring === BOARD_SCORING) return entry as BoardEntry;
  if (!card || card.id !== entry.cardId || !boardEligibility(card).ok) return null;
  return { ...boardEntryFrom(card, entry.name), at: entry.at };
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
