import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import type { Store } from './store.js';

const HOUR = 60 * 60 * 1000;

/** Abuse limits, per hashed IP per hour unless noted. */
export const LIMITS = {
  runCreate: { limit: 10, windowMs: HOUR },
  /**
   * Canary visits and trap-page reads are counted per RUN, so many agents
   * behind one shared egress IP (a cloud browser, a company proxy) don't
   * starve each other. A loose per-IP backstop still caps one caller.
   */
  canary: { limit: 300, windowMs: HOUR },
  trapRead: { limit: 300, windowMs: HOUR },
  canaryIp: { limit: 3000, windowMs: HOUR },
  trapReadIp: { limit: 3000, windowMs: HOUR },
  reply: { limit: 30, windowMs: HOUR },
  finish: { limit: 60, windowMs: HOUR },
  /** Page fetches for the check page (POST /api/fetch). */
  fetch: { limit: 30, windowMs: HOUR },
  /** Signing scorecards (POST /api/sign). */
  sign: { limit: 20, windowMs: HOUR },
  /** Adding a card to the board (POST /api/board). */
  boardAdd: { limit: 10, windowMs: HOUR },
  /** Reading cards and the board. Generous, they're small. */
  publicRead: { limit: 600, windowMs: HOUR },
  /**
   * Per run, not per IP: how often the run page may poll. Counted in this
   * server instance's memory, never in Firestore, so polling a run costs no
   * database writes. A cold start forgets the count; that's fine for a cheap,
   * read-only endpoint keyed by an unguessable id.
   */
  view: { limit: 3000, windowMs: HOUR },
} as const;

export type LimitName = keyof typeof LIMITS;

/**
 * The caller's IP for rate limits, from headers the platform sets, never the
 * client's own claim. On Vercel, x-vercel-forwarded-for and x-real-ip are
 * written by the edge; the first hop of x-forwarded-for can be supplied by
 * the client, so it is used only off Vercel (local dev and tests). Anything
 * that isn't a well-formed IP counts as one shared "unknown" caller.
 */
export function clientIp(req: Request, onVercel = Boolean(process.env.VERCEL)): string {
  const first = (h: string) => req.headers.get(h)?.split(',')[0]?.trim() ?? '';
  const candidates = [first('x-vercel-forwarded-for'), first('x-real-ip')];
  if (!onVercel) candidates.push(first('x-forwarded-for'));
  for (const c of candidates) if (c && isIP(c)) return c;
  return 'unknown';
}

let warnedSalt = false;

/**
 * Is TELL_HASH_SALT set? On Vercel a missing salt falls back to a public
 * default, which still never stores an IP but makes the hashes guessable,
 * so it warns once (never echoing any value) and /api/health reports it.
 */
export function hashSaltStatus(env: NodeJS.ProcessEnv = process.env): 'ok' | 'not-configured' {
  return env.TELL_HASH_SALT ? 'ok' : 'not-configured';
}

/** Warns once per instance when running on Vercel without TELL_HASH_SALT. Never throws. */
export function warnIfNoHashSalt(env: NodeJS.ProcessEnv = process.env): boolean {
  if (warnedSalt || !env.VERCEL || hashSaltStatus(env) === 'ok') return false;
  warnedSalt = true;
  console.warn('[tell-api] TELL_HASH_SALT is not set; rate-limit keys use the public default salt. Set it in Vercel.');
  return true;
}

/** Tests only. */
export function resetSaltWarningForTests(): void {
  warnedSalt = false;
}

/**
 * The IP is never stored. Rate-limit keys use a salted hash whose salt
 * changes every day, so yesterday's keys can't be linked to today's.
 */
export function ipKey(ip: string, now: number, salt = process.env.TELL_HASH_SALT || 'tell-dev-salt'): string {
  if (!process.env.TELL_HASH_SALT) warnIfNoHashSalt();
  const day = new Date(now).toISOString().slice(0, 10);
  return createHash('sha256').update(`${salt}|${day}|${ip}`).digest('hex').slice(0, 24);
}

/** Limits counted in memory (per server instance) instead of the store. */
export const MEMORY_LIMITS: ReadonlySet<LimitName> = new Set<LimitName>(['view']);

const local = new Map<string, { window: number; count: number }>();
const LOCAL_MAX_KEYS = 10_000;

/**
 * Fixed-window counter in this instance's memory. Never touches Firestore.
 * The map is bounded: old windows are dropped first, and if it is still
 * full the oldest key goes.
 */
export function allowLocal(name: LimitName, who: string, now: number): boolean {
  const { limit, windowMs } = LIMITS[name];
  const window = Math.floor(now / windowMs);
  const key = `${name}_${who}`;
  const cur = local.get(key);
  if (cur && cur.window === window) {
    if (cur.count >= limit) return false;
    cur.count += 1;
    return true;
  }
  if (!cur && local.size >= LOCAL_MAX_KEYS) {
    for (const [k, v] of local) if (v.window !== window) local.delete(k);
    if (local.size >= LOCAL_MAX_KEYS) local.delete(local.keys().next().value as string);
  }
  local.set(key, { window, count: 1 });
  return true;
}

/** Tests only. */
export function resetLocalLimitsForTests(): void {
  local.clear();
}

/** The key for a per-run limit; never collides with a hashed IP. */
export function runKey(runId: string): string {
  return `run-${runId}`;
}

export async function allow(store: Store, name: LimitName, who: string, now: number): Promise<boolean> {
  if (MEMORY_LIMITS.has(name)) return allowLocal(name, who, now);
  const { limit, windowMs } = LIMITS[name];
  return store.take(`${name}_${who}`, limit, windowMs, now);
}
