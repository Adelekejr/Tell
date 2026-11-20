import type { StoredRun } from './store.js';

export type RunLifecycle =
  | { status: 'open'; expiresAt: number }
  | { status: 'finished'; finishedAt: number }
  | { status: 'expired'; expiresAt: number };

export type RunLifecycleEvent =
  | { type: 'finish'; at: number }
  | { type: 'expire'; at: number };

/** Derives the named lifecycle without changing finish-over-expiry precedence. */
export function lifecycleOf(run: Pick<StoredRun, 'expiresAt' | 'finishedAt'>, now: number): RunLifecycle {
  if (run.finishedAt !== null) return { status: 'finished', finishedAt: run.finishedAt };
  if (now >= run.expiresAt) return { status: 'expired', expiresAt: run.expiresAt };
  return { status: 'open', expiresAt: run.expiresAt };
}

/** Terminal lifecycle states ignore later events; an open run may finish or expire once. */
export function transitionLifecycle(state: RunLifecycle, event: RunLifecycleEvent): RunLifecycle {
  if (state.status !== 'open') return state;
  if (event.type === 'finish') return event.at < state.expiresAt ? { status: 'finished', finishedAt: event.at } : state;
  return event.at >= state.expiresAt ? { status: 'expired', expiresAt: state.expiresAt } : state;
}
