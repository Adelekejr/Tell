import { useCallback, useEffect, useRef, useState } from 'react';
import type { RunView } from '@tell/shared';
import { ApiError, getRun } from './api';

const FAST_MS = 2000;
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
 * is hidden and catches up the moment it is visible or back online.
 */
export function useRun(id: string): RunState {
  const [run, setRun] = useState<RunView | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [failures, setFailures] = useState(0);
  const timer = useRef<number | null>(null);
  const live = useRef(true);
  const tickRef = useRef<() => void>(() => {});

  const schedule = useCallback((ms: number) => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => tickRef.current(), ms);
  }, []);

  useEffect(() => {
    if (!id) return;
    live.current = true;
    let failCount = 0;
    let controller: AbortController | null = null;
    tickRef.current = async () => {
      if (!live.current) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      controller?.abort();
      controller = new AbortController();
      try {
        const next = await getRun(id, controller.signal);
        if (!live.current) return;
        failCount = 0;
        setFailures(0);
        setError(null);
        setRun(next);
        if (next.status === 'open') schedule(FAST_MS);
      } catch (err) {
        if (!live.current || (err instanceof DOMException && err.name === 'AbortError')) return;
        const e = err instanceof ApiError ? err : new ApiError('network', 'Couldn\u2019t reach the run.', 0);
        if (e.status === 404 || e.code === 'not-configured') {
          setError(e);
          return;
        }
        failCount += 1;
        setFailures(failCount);
        if (failCount >= 2) setError(e);
        schedule(Math.min(FAST_MS * 2 ** failCount, MAX_BACKOFF_MS));
      }
    };
    tickRef.current();
    const wake = () => {
      if (document.visibilityState === 'visible') tickRef.current();
    };
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('online', wake);
    return () => {
      live.current = false;
      controller?.abort();
      if (timer.current !== null) window.clearTimeout(timer.current);
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('online', wake);
    };
  }, [id, schedule]);

  const refresh = useCallback(() => tickRef.current(), []);
  const replace = useCallback((next: RunView) => setRun(next), []);
  return { run, error, offline: failures >= 2, refresh, replace };
}
