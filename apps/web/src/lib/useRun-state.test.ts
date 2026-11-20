import type { RunView } from '@tell/shared';
import { describe, expect, it } from 'vitest';
import { ApiError } from './api';
import { initialRunState, runReducer } from './useRun-state';

function run(status: RunView['status']): RunView {
  return { status } as RunView;
}

const networkError = new ApiError('network', 'offline', 0);

describe('run state reducer', () => {
  it.each(['open', 'finished', 'expired'] as const)('accepts the %s terminal/data status', (status) => {
    const loading = runReducer(initialRunState(), { type: 'request', requestId: 1, phase: 'loading', preserveRun: false });
    const ready = runReducer(loading, { type: 'success', requestId: 1, run: run(status) });
    expect(ready).toMatchObject({ phase: 'ready', runStatus: status, run: { status } });
  });

  it('moves from loading to retrying and failed without dropping the prior run', () => {
    const first = runReducer(initialRunState(), { type: 'request', requestId: 1, phase: 'loading', preserveRun: false });
    const ready = runReducer(first, { type: 'success', requestId: 1, run: run('open') });
    const retrying = runReducer(ready, { type: 'request', requestId: 2, phase: 'retrying', preserveRun: true });
    const failed = runReducer(retrying, { type: 'failure', requestId: 2, error: networkError, failures: 2, showError: true });
    expect(retrying).toMatchObject({ phase: 'retrying', run: { status: 'open' }, error: null });
    expect(failed).toMatchObject({ phase: 'failed', run: { status: 'open' }, error: networkError, failures: 2 });
  });

  it('rejects an older request and its response', () => {
    const loading = runReducer(initialRunState(), { type: 'request', requestId: 2, phase: 'loading', preserveRun: false });
    const newer = runReducer(loading, { type: 'success', requestId: 2, run: run('finished') });
    const staleRequest = runReducer(newer, { type: 'request', requestId: 1, phase: 'retrying', preserveRun: true });
    const staleResponse = runReducer(newer, { type: 'success', requestId: 1, run: run('open') });
    expect(staleRequest).toBe(newer);
    expect(staleResponse).toBe(newer);
  });

  it('rejects a response from a request that was cancelled by a newer request', () => {
    const loading = runReducer(initialRunState(), { type: 'request', requestId: 1, phase: 'loading', preserveRun: false });
    const retrying = runReducer(loading, { type: 'request', requestId: 2, phase: 'retrying', preserveRun: false });
    expect(runReducer(retrying, { type: 'failure', requestId: 1, error: networkError, failures: 1, showError: false })).toBe(retrying);
  });
});
