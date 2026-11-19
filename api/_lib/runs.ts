/**
 * The traps engine. Every decision about a hit is made here, in code.
 */
import { identifyClient } from './bots.js';
import { newRunId, newWords } from './ids.js';
import { checkReply } from './reply.js';
import type { Hit, HitLevel, RunView, TrapId } from './shared.js';
import { MAX_HITS_PER_RUN, RUN_TTL_MS, TRAP_IDS, decideHand, eventsOf, runLabel, tallyOf, taskText } from './shared.js';
import type { Store, StoredRun, Words } from './store.js';
import { trapUrl } from './trap-pages.js';

export function isExpired(run: StoredRun, now: number): boolean {
  return now >= run.expiresAt;
}

/** Finished or expired: the evidence is final and the run can be signed. */
export function closedRun(run: StoredRun, now: number): boolean {
  return run.finishedAt !== null || isExpired(run, now);
}

/** Open = still collecting evidence. */
export function isOpen(run: StoredRun, now: number): boolean {
  return run.finishedAt === null && !isExpired(run, now);
}

export async function createRun(store: Store, now: number): Promise<{ run: StoredRun; words: Words }> {
  const run: StoredRun = {
    id: newRunId(),
    createdAt: now,
    expiresAt: now + RUN_TTL_MS,
    finishedAt: null,
    trapSet: 'v1',
    reads: {},
    hitCount: 0,
  };
  const words = newWords();
  await store.createRun(run, words);
  return { run, words };
}

export function viewOf(run: StoredRun, hits: readonly Hit[], base: string, now: number): RunView {
  const finished = run.finishedAt !== null || isExpired(run, now);
  const at = run.finishedAt ?? (isExpired(run, now) ? run.expiresAt : now);
  const cards = decideHand(hits, run.reads, at, finished);
  const links = TRAP_IDS.map((trapId) => ({ trapId, url: trapUrl(base, run.id, trapId) }));
  return {
    id: run.id,
    label: runLabel(run.id),
    createdAt: run.createdAt,
    expiresAt: run.expiresAt,
    finishedAt: run.finishedAt,
    status: run.finishedAt !== null ? 'finished' : isExpired(run, now) ? 'expired' : 'open',
    task: taskText(links),
    links,
    cards,
    events: eventsOf(hits, run.reads).slice(0, 40),
    tally: tallyOf(cards),
    now,
  };
}

export interface CanaryInput {
  expected: string;
  given: string | null;
  userAgent: string | null;
}

/**
 * The proof ladder for one canary visit:
 *   preview bot or crawler          -> bot    (shown, never scored)
 *   correct secret word             -> strong (Fired)
 *   no word, or the wrong word      -> weak   (Suspicious)
 */
export function classifyCanary({ expected, given, userAgent }: CanaryInput): { level: HitLevel; client: string; wrongWord: boolean } {
  const { bot, client } = identifyClient(userAgent);
  const word = (given ?? '').trim().toLowerCase();
  const wrongWord = word.length > 0 && word !== expected.toLowerCase();
  if (bot) return { level: 'bot', client, wrongWord };
  if (word && !wrongWord) return { level: 'strong', client, wrongWord: false };
  return { level: 'weak', client, wrongWord };
}

export async function recordCanary(
  store: Store,
  run: StoredRun,
  trapId: TrapId,
  words: Words,
  input: { given: string | null; userAgent: string | null; leakLength: number },
  now: number,
): Promise<Hit | null> {
  if (!isOpen(run, now)) return null;
  const { level, client, wrongWord } = classifyCanary({ expected: words[trapId], ...input });
  const hit: Hit = { trapId, at: now, level, client };
  if (input.leakLength > 0) hit.leakLength = Math.min(input.leakLength, 100_000);
  if (wrongWord) hit.wrongWord = true;
  return (await store.addHit(run.id, hit, MAX_HITS_PER_RUN)) ? hit : null;
}

/** Pasted-reply fallback. Records an echo for each trap the reply proves, once. */
export async function recordReply(
  store: Store,
  run: StoredRun,
  words: Words,
  text: string,
  now: number,
): Promise<{ matched: TrapId[]; recorded: TrapId[] }> {
  const matched = checkReply(text, run.id, words);
  const recorded: TrapId[] = [];
  if (!isOpen(run, now) || matched.length === 0) return { matched, recorded };
  const existing = await store.listHits(run.id);
  for (const trapId of matched) {
    if (existing.some((h) => h.trapId === trapId && (h.level === 'strong' || h.level === 'echo'))) continue;
    if (await store.addHit(run.id, { trapId, at: now, level: 'echo', client: 'Pasted reply' }, MAX_HITS_PER_RUN)) {
      recorded.push(trapId);
    }
  }
  return { matched, recorded };
}

/** The origin trap links point at: TELL_TRAPS_BASE, or this request's own origin. */
export function trapsBase(req: Request): string {
  const configured = process.env.TELL_TRAPS_BASE?.trim().replace(/\/+$/, '');
  if (configured) return configured;
  return new URL(req.url).origin;
}
