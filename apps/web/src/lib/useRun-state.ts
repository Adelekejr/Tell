import type { RunView } from '@tell/shared';
import type { ApiError } from './api';

export type RunStatus = RunView['status'];
export type RequestPhase = 'loading' | 'retrying' | 'failed' | 'ready';

export interface RunStateData {
  phase: RequestPhase;
  run: RunView | null;
  runStatus: RunStatus | null;
  error: ApiError | null;
  failures: number;
  requestId: number;
}

export type RunStateAction =
  | { type: 'request'; requestId: number; phase: 'loading' | 'retrying'; preserveRun: boolean }
  | { type: 'success'; requestId: number; run: RunView }
  | { type: 'replace'; requestId: number; run: RunView }
  | { type: 'failure'; requestId: number; error: ApiError; failures: number; showError: boolean };

function withRun(state: RunStateData, run: RunView | null): RunStateData {
  return { ...state, run, runStatus: run?.status ?? null };
}

export function initialRunState(): RunStateData {
  return {
    phase: 'loading',
    run: null,
    runStatus: null,
    error: null,
    failures: 0,
    requestId: 0,
  };
}

/**
 * Keeps the last successful run visible while a refresh retries or fails.
 * Responses from any request other than the current one are deliberately ignored.
 */
export function runReducer(state: RunStateData, action: RunStateAction): RunStateData {
  switch (action.type) {
    case 'request': {
      if (action.requestId <= state.requestId) return state;
      const run = action.preserveRun ? state.run : null;
      return {
        ...withRun(state, run),
        phase: action.phase,
        error: null,
        failures: 0,
        requestId: action.requestId,
      };
    }
    case 'success': {
      if (action.requestId !== state.requestId) return state;
      return {
        ...withRun(state, action.run),
        phase: 'ready',
        error: null,
        failures: 0,
      };
    }
    case 'replace': {
      if (action.requestId <= state.requestId) return state;
      return {
        ...withRun(state, action.run),
        phase: 'ready',
        error: null,
        failures: 0,
        requestId: action.requestId,
      };
    }
    case 'failure': {
      if (action.requestId !== state.requestId) return state;
      return {
        ...state,
        phase: 'failed',
        error: action.showError ? action.error : null,
        failures: action.failures,
      };
    }
  }
}

/** Poll every 2 s while things change, 5 s after a quiet minute, 15 s after five quiet minutes. */
export const POLL_FAST_MS = 2000;
export const POLL_SLOW_MS = 5000;
export const POLL_IDLE_MS = 15000;
export const QUIET_SLOW_AFTER_MS = 60_000;
export const QUIET_IDLE_AFTER_MS = 5 * 60_000;

/** What counts as a change: everything but the server clock. */
export function runFingerprint(run: RunView): string {
  return JSON.stringify({ ...run, now: 0 });
}

/** True while a card is still being decided, so the page keeps polling fast. */
function deciding(run: RunView): boolean {
  return run.status === 'closing' || run.cards.some((c) => c.reason === 'reading');
}

export interface PollClock {
  /** Fingerprint of the last run seen. */
  fingerprint: string | null;
  /** Last time the run changed, or the user did something (tap, tab shown, back online). */
  lastActivityAt: number;
}

export function startPollClock(now: number): PollClock {
  return { fingerprint: null, lastActivityAt: now };
}

/** The user did something: poll fast again. */
export function wakePollClock(clock: PollClock, now: number): PollClock {
  return { ...clock, lastActivityAt: now };
}

/**
 * After a successful poll: the next clock and how long to wait. Null means
 * stop polling (finished and expired runs don't change).
 */
export function nextPoll(clock: PollClock, run: RunView, now: number): { clock: PollClock; delayMs: number | null } {
  const fingerprint = runFingerprint(run);
  const changed = clock.fingerprint !== null && fingerprint !== clock.fingerprint;
  const next: PollClock = { fingerprint, lastActivityAt: changed ? now : clock.lastActivityAt };
  if (run.status !== 'open' && run.status !== 'closing') return { clock: next, delayMs: null };
  if (deciding(run)) return { clock: next, delayMs: POLL_FAST_MS };
  const quiet = now - next.lastActivityAt;
  const delayMs = quiet >= QUIET_IDLE_AFTER_MS ? POLL_IDLE_MS : quiet >= QUIET_SLOW_AFTER_MS ? POLL_SLOW_MS : POLL_FAST_MS;
  return { clock: next, delayMs };
}
