/**
 * DEV AND TESTS ONLY. An in-memory stand-in for Firestore, selected by
 * TELL_DEV_STORE=memory and refused on Vercel or in production builds
 * (see memoryStoreAllowed in store.ts). Nothing here survives a restart.
 */
import type { BoardEntry, Hit, TrapId } from './shared.js';
import type { Store, StoredCard, StoredRun, Words } from './store.js';

export class MemoryStore implements Store {
  readonly kind = 'memory' as const;
  private runs = new Map<string, StoredRun>();
  private words = new Map<string, Words>();
  private hits = new Map<string, Hit[]>();
  private counters = new Map<string, number>();
  private cards = new Map<string, StoredCard>();
  private runCards = new Map<string, string>();
  private board = new Map<string, BoardEntry & { hidden: boolean }>();

  async createRun(run: StoredRun, words: Words): Promise<void> {
    this.runs.set(run.id, structuredClone(run));
    this.words.set(run.id, { ...words });
    this.hits.set(run.id, []);
  }

  async getRun(id: string): Promise<StoredRun | null> {
    const run = this.runs.get(id);
    return run ? structuredClone(run) : null;
  }

  async getWords(id: string): Promise<Words | null> {
    const w = this.words.get(id);
    return w ? { ...w } : null;
  }

  async listHits(id: string): Promise<Hit[]> {
    return (this.hits.get(id) ?? []).map((h) => ({ ...h }));
  }

  async addHit(id: string, hit: Hit, max: number, now: number): Promise<boolean> {
    const run = this.runs.get(id);
    const list = this.hits.get(id);
    if (!run || !list || run.finishedAt !== null || now >= run.expiresAt || run.hitCount >= max) return false;
    list.push({ ...hit });
    run.hitCount += 1;
    return true;
  }

  async markRead(id: string, trapId: TrapId, at: number): Promise<void> {
    const run = this.runs.get(id);
    if (run && run.finishedAt === null && at < run.expiresAt && run.reads[trapId] === undefined) run.reads[trapId] = at;
  }

  async finish(id: string, at: number): Promise<void> {
    const run = this.runs.get(id);
    if (run && run.finishedAt === null) run.finishedAt = at;
  }

  async createLiveCard(runId: string, make: () => StoredCard) {
    if (!this.runs.has(runId)) return null;
    const existing = this.runCards.get(runId);
    if (existing) return { stored: structuredClone(this.cards.get(existing)!), created: false };
    const stored = make();
    this.cards.set(stored.card.payload.id, structuredClone(stored));
    this.runCards.set(runId, stored.card.payload.id);
    return { stored, created: true };
  }

  async createCard(card: StoredCard): Promise<void> {
    if (this.cards.has(card.card.payload.id)) throw new Error('card exists');
    this.cards.set(card.card.payload.id, structuredClone(card));
  }

  async getCard(id: string): Promise<StoredCard | null> {
    const c = this.cards.get(id);
    return c ? structuredClone(c) : null;
  }

  async addToBoard(entry: BoardEntry): Promise<'added' | 'exists'> {
    if (this.board.has(entry.cardId)) return 'exists';
    this.board.set(entry.cardId, { ...structuredClone(entry), hidden: false });
    const card = this.cards.get(entry.cardId);
    if (card) card.listed = true;
    return 'added';
  }

  async listBoard(limit: number): Promise<BoardEntry[]> {
    return [...this.board.values()]
      .filter((e) => !e.hidden)
      .sort((a, b) => b.at - a.at)
      .slice(0, limit)
      .map(({ hidden: _hidden, ...e }) => structuredClone(e));
  }

  async take(key: string, limit: number, windowMs: number, now: number): Promise<boolean> {
    const bucket = `${key}:${Math.floor(now / windowMs)}`;
    const count = this.counters.get(bucket) ?? 0;
    if (count >= limit) return false;
    this.counters.set(bucket, count + 1);
    return true;
  }
}
