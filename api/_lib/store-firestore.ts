import type { Firestore } from 'firebase-admin/firestore';
import type * as FirestoreModule from 'firebase-admin/firestore';
import type { ServiceAccount } from './admin.js';
import { getAdminApp } from './admin.js';
import type { BoardEntry, Hit, SignedCard, StoredBoardEntry, TrapId } from './shared.js';
import { isTrapId } from './shared.js';
import type { Store, StoredCard, StoredRun, Words } from './store.js';

/**
 * Firestore layout (see PLAN 4.4):
 *   runs/{runId}              run metadata, no secret words (clients may `get` it)
 *   runs/{runId}/hits/{hitId} canary hits and pasted-reply echoes
 *   runSecrets/{runId}        the seven secret words, server only
 *   cards/{cardId}            signed scorecards (kept; no expiry)
 *   board/{cardId}            opt-in board entries, live cards only
 *   limits/{key_window}       rate-limit counters keyed by a salted IP hash
 * Every doc carries `expireAt` (a Timestamp) so a Firestore TTL policy can
 * delete it after the run ends.
 */
export class FirestoreStore implements Store {
  readonly kind = 'firestore' as const;

  private constructor(
    private readonly db: Firestore,
    private readonly ts: typeof FirestoreModule,
  ) {}

  static async create(account: ServiceAccount): Promise<FirestoreStore> {
    const app = await getAdminApp(account);
    const mod = await import('firebase-admin/firestore');
    return new FirestoreStore(mod.getFirestore(app), mod);
  }

  private expireAt(ms: number) {
    return this.ts.Timestamp.fromMillis(ms);
  }

  async createRun(run: StoredRun, words: Words): Promise<void> {
    const batch = this.db.batch();
    batch.create(this.db.collection('runs').doc(run.id), { ...run, status: 'open', expireAt: this.expireAt(run.expiresAt) });
    batch.create(this.db.collection('runSecrets').doc(run.id), { words, expireAt: this.expireAt(run.expiresAt) });
    await batch.commit();
  }

  async getRun(id: string): Promise<StoredRun | null> {
    const snap = await this.db.collection('runs').doc(id).get();
    if (!snap.exists) return null;
    const d = snap.data() as Record<string, unknown>;
    const reads: Partial<Record<TrapId, number>> = {};
    for (const [k, v] of Object.entries((d.reads as Record<string, unknown>) ?? {})) {
      if (isTrapId(k) && typeof v === 'number') reads[k] = v;
    }
    return {
      id,
      createdAt: Number(d.createdAt),
      expiresAt: Number(d.expiresAt),
      finishedAt: typeof d.finishedAt === 'number' ? d.finishedAt : null,
      trapSet: 'v1',
      reads,
      hitCount: Number(d.hitCount ?? 0),
    };
  }

  async getWords(id: string): Promise<Words | null> {
    const snap = await this.db.collection('runSecrets').doc(id).get();
    return snap.exists ? ((snap.data() as { words: Words }).words ?? null) : null;
  }

  async listHits(id: string): Promise<Hit[]> {
    const snap = await this.db.collection('runs').doc(id).collection('hits').orderBy('at').limit(100).get();
    return snap.docs.map((doc) => {
      const d = doc.data() as Hit & { expireAt?: unknown };
      const hit: Hit = { trapId: d.trapId, at: d.at, level: d.level };
      if (d.client) hit.client = d.client;
      if (d.leakLength) hit.leakLength = d.leakLength;
      if (d.wrongWord) hit.wrongWord = true;
      return hit;
    });
  }

  async addHit(id: string, hit: Hit, max: number, now: number): Promise<boolean> {
    const runRef = this.db.collection('runs').doc(id);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(runRef);
      if (!snap.exists) return false;
      const d = snap.data() as { hitCount?: number; expiresAt: number; finishedAt?: unknown };
      if ((typeof d.finishedAt === 'number' && now >= d.finishedAt) || now >= d.expiresAt || (d.hitCount ?? 0) >= max) return false;
      tx.create(runRef.collection('hits').doc(), { ...hit, expireAt: this.expireAt(d.expiresAt) });
      tx.update(runRef, { hitCount: this.ts.FieldValue.increment(1) });
      return true;
    });
  }

  async markRead(id: string, trapId: TrapId, at: number): Promise<void> {
    const runRef = this.db.collection('runs').doc(id);
    await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(runRef);
      if (!snap.exists) return;
      const data = snap.data() as { reads?: Record<string, number>; expiresAt: number; finishedAt?: unknown };
      if ((typeof data.finishedAt === 'number' && at >= data.finishedAt) || at >= data.expiresAt) return;
      const reads = (data.reads ?? {}) as Record<string, number>;
      if (reads[trapId] !== undefined) return;
      tx.update(runRef, { [`reads.${trapId}`]: at });
    });
  }

  async finish(id: string, at: number): Promise<void> {
    const runRef = this.db.collection('runs').doc(id);
    await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(runRef);
      if (!snap.exists || typeof (snap.data() as { finishedAt?: unknown }).finishedAt === 'number') return;
      tx.update(runRef, { finishedAt: at, status: 'closing' });
    });
  }

  async createLiveCard(runId: string, make: () => StoredCard) {
    const runRef = this.db.collection('runs').doc(runId);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(runRef);
      if (!snap.exists) return null;
      const cardId = (snap.data() as { cardId?: unknown }).cardId;
      if (typeof cardId === 'string') {
        const existing = await tx.get(this.db.collection('cards').doc(cardId));
        if (existing.exists) return { stored: this.toStored(existing.data() as Record<string, unknown>), created: false };
      }
      const stored = make();
      tx.create(this.db.collection('cards').doc(stored.card.payload.id), this.fromStored(stored));
      tx.update(runRef, { cardId: stored.card.payload.id });
      return { stored, created: true };
    });
  }

  async createCard(card: StoredCard): Promise<void> {
    await this.db.collection('cards').doc(card.card.payload.id).create(this.fromStored(card));
  }

  async getCard(id: string): Promise<StoredCard | null> {
    const snap = await this.db.collection('cards').doc(id).get();
    return snap.exists ? this.toStored(snap.data() as Record<string, unknown>) : null;
  }

  async addToBoard(entry: BoardEntry): Promise<'added' | 'exists'> {
    const ref = this.db.collection('board').doc(entry.cardId);
    const cardRef = this.db.collection('cards').doc(entry.cardId);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists) return 'exists' as const;
      tx.create(ref, { ...entry, cells: entry.cells.join(''), hidden: false });
      tx.update(cardRef, { listed: true });
      return 'added' as const;
    });
  }

  async listBoard(limit: number): Promise<StoredBoardEntry[]> {
    const snap = await this.db.collection('board').where('hidden', '==', false).orderBy('at', 'desc').limit(limit).get();
    return snap.docs.map((doc) => {
      const d = doc.data() as Record<string, unknown>;
      // Only the id, name and date are read back; everything shown is rebuilt from the signed card.
      const entry: StoredBoardEntry = { cardId: doc.id, name: String(d.name ?? ''), at: Number(d.at) };
      if (typeof d.scoring === 'number') entry.scoring = d.scoring;
      return entry;
    });
  }

  async rescoreBoardEntry(entry: BoardEntry): Promise<void> {
    // Replace the whole document so fields from older scoring versions don't linger.
    await this.db.collection('board').doc(entry.cardId).set({ ...entry, cells: entry.cells.join(''), hidden: false });
  }

  async hideBoardEntry(cardId: string, reason: string): Promise<void> {
    await this.db.collection('board').doc(cardId).update({ hidden: true, hiddenReason: reason });
  }

  /** Cards are stored as the signed JSON string, so the signed bytes never drift through Firestore types. */
  private fromStored(c: StoredCard) {
    return { signed: JSON.stringify(c.card), prompt: c.prompt, runId: c.runId, listed: c.listed, kind: c.card.payload.kind, issuedAt: c.card.payload.issuedAt };
  }

  private toStored(d: Record<string, unknown>): StoredCard {
    return {
      card: JSON.parse(String(d.signed)) as SignedCard,
      prompt: typeof d.prompt === 'string' ? d.prompt : null,
      runId: typeof d.runId === 'string' ? d.runId : null,
      listed: d.listed === true,
    };
  }

  async take(key: string, limit: number, windowMs: number, now: number): Promise<boolean> {
    const windowStart = Math.floor(now / windowMs);
    const ref = this.db.collection('limits').doc(`${key}_${windowStart}`);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const count = snap.exists ? Number((snap.data() as { count?: number }).count ?? 0) : 0;
      if (count >= limit) return false;
      tx.set(ref, { count: count + 1, expireAt: this.expireAt((windowStart + 2) * windowMs) }, { merge: true });
      return true;
    });
  }
}
