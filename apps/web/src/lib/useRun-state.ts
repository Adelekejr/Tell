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
