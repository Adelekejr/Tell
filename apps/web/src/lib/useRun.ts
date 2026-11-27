import { useCallback, useEffect, useReducer, useRef } from 'react';
import type { RunView } from '@tell/shared';
import { ApiError, getRun } from './api';
import type { PollClock } from './useRun-state';
import { POLL_FAST_MS, initialRunState, nextPoll, runReducer, startPollClock, wakePollClock } from './useRun-state';

const MAX_BACKOFF_MS = 15000;

export interface RunState {
  run: RunView | null;
  error: ApiError | null;
  /** True after repeated failures: the page shows the offline strip. */
  offline: boolean;
  refresh: () => void;
  /** Replace the run with a fresher copy (after finish or a reply check). */
  replace: (run: RunView) => void;
}

/**
 * Polls GET /api/run/{id}. Chosen over a Firestore listener because the web
 * app never needs any Firestore access for runs: the server decides every
 * card and the browser only reads its verdicts. Polling pauses while the tab
 * is hidden and catches up the moment it is visible or back online. It slows
 * down when nothing changes (2 s, then 5 s after a quiet minute, then 15 s
 * after five) and speeds up again on any change or user action.
 */
export function useRun(id: string): RunState {
  const [state, dispatch] = useReducer(runReducer, undefined, initialRunState);
  const timer = useRef<number | null>(null);
  const live = useRef(true);
  const requestId = useRef(0);
  const tickRef = useRef<() => void>(() => {});
  const clock = useRef<PollClock>(startPollClock(0));

  const schedule = useCallback((ms: number) => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => tickRef.current(), ms);
  }, []);

  useEffect(() => {
    if (!id) return;
    live.current = true;
    let failCount = 0;
    let controller: AbortController | null = null;
    clock.current = startPollClock(Date.now());
    const effectRequest = ++requestId.current;
    dispatch({ type: 'request', requestId: effectRequest, phase: 'loading', preserveRun: false });

    tickRef.current = async () => {
      if (!live.current) return;
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      controller?.abort();
      controller = new AbortController();
      const currentRequest = ++requestId.current;
      dispatch({ type: 'request', requestId: currentRequest, phase: failCount ? 'retrying' : 'loading', preserveRun: true });
      try {
        const next = await getRun(id, controller.signal);
        if (!live.current) return;
        failCount = 0;
        dispatch({ type: 'success', requestId: currentRequest, run: next });
        // Open and closing runs still change; finished and expired ones are final.
        const poll = nextPoll(clock.current, next, Date.now());
        clock.current = poll.clock;
        if (poll.delayMs !== null) schedule(poll.delayMs);
      } catch (err) {
        if (!live.current || (err instanceof Error && err.name === 'AbortError')) return;
        const e = err instanceof ApiError ? err : new ApiError('network', 'Couldn\u2019t reach the run.', 0);
        if (e.status === 404 || e.code === 'not-configured') {
          dispatch({ type: 'failure', requestId: currentRequest, error: e, failures: failCount, showError: true });
          return;
        }
        failCount += 1;
        dispatch({ type: 'failure', requestId: currentRequest, error: e, failures: failCount, showError: failCount >= 2 });
        schedule(Math.min(POLL_FAST_MS * 2 ** failCount, MAX_BACKOFF_MS));
      }
    };
    tickRef.current();
    const wake = () => {
      if (document.visibilityState !== 'visible') return;
      clock.current = wakePollClock(clock.current, Date.now());
      tickRef.current();
    };
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('online', wake);
    return () => {
      live.current = false;
      requestId.current += 1;
      controller?.abort();
      if (timer.current !== null) window.clearTimeout(timer.current);
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('online', wake);
    };
  }, [id, schedule]);

  const refresh = useCallback(() => {
    clock.current = wakePollClock(clock.current, Date.now());
    tickRef.current();
  }, []);
  const replace = useCallback((next: RunView) => {
    clock.current = wakePollClock(clock.current, Date.now());
    const nextRequestId = ++requestId.current;
    dispatch({ type: 'replace', requestId: nextRequestId, run: next });
  }, []);
  return { run: state.run, error: state.error, offline: state.failures >= 2, refresh, replace };
}
