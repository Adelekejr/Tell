import { createHash } from 'node:crypto';
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

export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  const first = fwd?.split(',')[0]?.trim();
  return first || req.headers.get('x-real-ip')?.trim() || 'unknown';
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
