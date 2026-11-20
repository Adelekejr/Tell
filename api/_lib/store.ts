import type { BoardEntry, Hit, SignedCard, TrapId } from './shared.js';
import { readServiceAccount } from './admin.js';

export interface StoredRun {
  id: string;
  createdAt: number;
  expiresAt: number;
  finishedAt: number | null;
  trapSet: 'v1';
  /** First time each trap page was read by a non-bot client. */
  reads: Partial<Record<TrapId, number>>;
  hitCount: number;
}

import type { Words } from './shared.js';
export type { Words };

/** A signed card as stored. `runId` stays server-side; it is never returned. */
export interface StoredCard {
  card: SignedCard;
  /** Only when the user ticked "Include my prompt on my card". */
  prompt: string | null;
  runId: string | null;
  listed: boolean;
}

/**
 * Where runs live. Production always uses Firestore through the Admin SDK.
 * The memory store exists only for local development and tests.
 */
export interface Store {
  readonly kind: 'firestore' | 'memory';
  createRun(run: StoredRun, words: Words): Promise<void>;
  getRun(id: string): Promise<StoredRun | null>;
  /** Server-side only. Never returned to a browser. */
  getWords(id: string): Promise<Words | null>;
  listHits(id: string): Promise<Hit[]>;
  /** Adds a hit unless the run already holds `max` hits. Returns false when capped. */
  addHit(id: string, hit: Hit, max: number, now: number): Promise<boolean>;
  /** Records the first read of a trap page; later reads are ignored. */
  markRead(id: string, trapId: TrapId, at: number): Promise<void>;
  finish(id: string, at: number): Promise<void>;
  /**
   * One card per live run: returns the run's existing card, or stores the one
   * `make` builds. Null when the run doesn't exist.
   */
  createLiveCard(runId: string, make: () => StoredCard): Promise<{ stored: StoredCard; created: boolean } | null>;
  createCard(card: StoredCard): Promise<void>;
  getCard(id: string): Promise<StoredCard | null>;
  /** Adds a board entry once per card and marks the card listed. */
  addToBoard(entry: BoardEntry): Promise<'added' | 'exists'>;
  /** Visible entries, newest first. */
  listBoard(limit: number): Promise<BoardEntry[]>;
  /** Fixed-window counter. Returns true while `key` is under `limit` in this window. */
  take(key: string, limit: number, windowMs: number, now: number): Promise<boolean>;
}

let cached: Store | null = null;
let warned = false;

/**
 * The memory store is allowed only when TELL_DEV_STORE=memory is set AND we
 * are not on Vercel AND not a production build. It is never used in
 * production: without a service account, production answers 503.
 */
export function memoryStoreAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.TELL_DEV_STORE === 'memory' && !env.VERCEL && !env.VERCEL_ENV && env.NODE_ENV !== 'production';
}

export async function getStore(): Promise<Store | null> {
  if (cached) return cached;
  const account = readServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT);
  if (account) {
    const { FirestoreStore } = await import('./store-firestore.js');
    cached = await FirestoreStore.create(account);
    return cached;
  }
  if (memoryStoreAllowed()) {
    if (!warned && process.env.NODE_ENV !== 'test') {
      console.warn('[tell-api] DEV ONLY: using the in-memory store (TELL_DEV_STORE=memory). Data vanishes on restart.');
      warned = true;
    }
    const { MemoryStore } = await import('./store-memory.js');
    cached = new MemoryStore();
    return cached;
  }
  return null;
}

/** Tests only: forget the cached store so each test starts clean. */
export function resetStoreForTests(): void {
  cached = null;
}
