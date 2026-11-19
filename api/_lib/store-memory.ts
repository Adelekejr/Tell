/**
 * DEV AND TESTS ONLY. An in-memory stand-in for Firestore, selected by
 * TELL_DEV_STORE=memory and refused on Vercel or in production builds
 * (see memoryStoreAllowed in store.ts). Nothing here survives a restart.
 */
import type { Hit, TrapId } from './shared.js';
import type { Store, StoredRun, Words } from './store.js';

export class MemoryStore implements Store {
  readonly kind = 'memory' as const;
  private runs = new Map<string, StoredRun>();
  private words = new Map<string, Words>();
  private hits = new Map<string, Hit[]>();
  private counters = new Map<string, number>();

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

  async addHit(id: string, hit: Hit, max: number): Promise<boolean> {
    const run = this.runs.get(id);
    const list = this.hits.get(id);
    if (!run || !list || run.hitCount >= max) return false;
    list.push({ ...hit });
    run.hitCount += 1;
    return true;
  }

  async markRead(id: string, trapId: TrapId, at: number): Promise<void> {
    const run = this.runs.get(id);
    if (run && run.reads[trapId] === undefined) run.reads[trapId] = at;
  }

  async finish(id: string, at: number): Promise<void> {
    const run = this.runs.get(id);
    if (run && run.finishedAt === null) run.finishedAt = at;
  }

  async take(key: string, limit: number, windowMs: number, now: number): Promise<boolean> {
    const bucket = `${key}:${Math.floor(now / windowMs)}`;
    const count = this.counters.get(bucket) ?? 0;
    if (count >= limit) return false;
    this.counters.set(bucket, count + 1);
    return true;
  }
}
