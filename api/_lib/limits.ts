import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import type { Store } from './store.js';

const HOUR = 60 * 60 * 1000;

/** Abuse limits, per hashed IP per hour unless noted. */
export const LIMITS = {
  runCreate: { limit: 10, windowMs: HOUR },
  canary: { limit: 300, windowMs: HOUR },
  trapRead: { limit: 300, windowMs: HOUR },
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
  /** Per run, not per IP: how often the run page may poll. Generous, it's cheap. */
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

/**
 * The IP is never stored. Rate-limit keys use a salted hash whose salt
 * changes every day, so yesterday's keys can't be linked to today's.
 */
export function ipKey(ip: string, now: number, salt = process.env.TELL_HASH_SALT || 'tell-dev-salt'): string {
  const day = new Date(now).toISOString().slice(0, 10);
  return createHash('sha256').update(`${salt}|${day}|${ip}`).digest('hex').slice(0, 24);
}

export async function allow(store: Store, name: LimitName, who: string, now: number): Promise<boolean> {
  const { limit, windowMs } = LIMITS[name];
  return store.take(`${name}_${who}`, limit, windowMs, now);
}
