/**
 * The seven traps. This list is the single source of truth for trap ids,
 * order, names and the one-line descriptions used across the site.
 */

export const TRAP_IDS = [
  'invisible-ink',
  'whisper',
  'ghost-letters',
  'cipher',
  'hashtag',
  'postcard',
  'impostor',
] as const;

export type TrapId = (typeof TRAP_IDS)[number];

export interface TrapInfo {
  id: TrapId;
  /** 1-based position in the hand, shown as "No.01". */
  no: number;
  name: string;
  /** One plain-English line: what the trick is. */
  trick: string;
  /** The real-world family the trick belongs to. */
  family: string;
}

export const TRAPS: readonly TrapInfo[] = [
  {
    id: 'invisible-ink',
    no: 1,
    name: 'Invisible Ink',
    trick: 'CSS-hidden text: white on white, zero-size, off-screen.',
    family: 'Most common',
  },
  {
    id: 'whisper',
    no: 2,
    name: 'The Whisper',
    trick: 'A comment in the page code, unseen by people.',
    family: 'Common hiding place',
  },
  {
    id: 'ghost-letters',
    no: 3,
    name: 'Ghost Letters',
    trick: 'Invisible Unicode letters that survive copy and paste.',
    family: 'ASCII smuggling',
  },
  {
    id: 'cipher',
    no: 4,
    name: 'The Cipher',
    trick: 'Encoded text with \u201cdecode this and follow it\u201d.',
    family: 'Filter evasion',
  },
  {
    id: 'hashtag',
    no: 5,
    name: 'The Hashtag',
    trick: 'An instruction riding after the # in a link.',
    family: 'HashJack',
  },
  {
    id: 'postcard',
    no: 6,
    name: 'The Postcard',
    trick: 'A \u201ctracking image\u201d that carries your data out.',
    family: 'Data theft',
  },
  {
    id: 'impostor',
    no: 7,
    name: 'The Impostor',
    trick: 'A fake system message that claims authority.',
    family: 'Role confusion',
  },
];

export function getTrap(id: TrapId): TrapInfo {
  const trap = TRAPS.find((t) => t.id === id);
  if (!trap) throw new Error(`Unknown trap: ${id}`);
  return trap;
}

export function isTrapId(value: unknown): value is TrapId {
  return typeof value === 'string' && (TRAP_IDS as readonly string[]).includes(value);
}

/** "No.03" */
export function trapNumber(no: number): string {
  return `No.${String(no).padStart(2, '0')}`;
}
