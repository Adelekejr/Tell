import type { RunView } from '@tell/shared';
import { describe, expect, it } from 'vitest';
import { ApiError } from './api';
import {
  POLL_FAST_MS,
  POLL_IDLE_MS,
  POLL_SLOW_MS,
  initialRunState,
  nextPoll,
  runReducer,
  startPollClock,
  wakePollClock,
} from './useRun-state';

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

describe('adaptive polling', () => {
  const open = (extra: Partial<RunView> = {}): RunView => ({ status: 'open', cards: [], events: [], now: 0, ...extra }) as unknown as RunView;
  const MIN = 60_000;

  function quietFor(ms: number, step = 1000) {
    let clock = startPollClock(0);
    let delay: number | null = null;
    for (let t = 0; t <= ms; t += step) ({ clock, delayMs: delay } = nextPoll(clock, open({ now: t }), t));
    return { clock, delay };
  }

  it('polls every 2 s at first, 5 s after a quiet minute, 15 s after five quiet minutes', () => {
    expect(quietFor(59_000).delay).toBe(POLL_FAST_MS);
    expect(quietFor(MIN).delay).toBe(POLL_SLOW_MS);
    expect(quietFor(5 * MIN - 1000).delay).toBe(POLL_SLOW_MS);
    expect(quietFor(5 * MIN).delay).toBe(POLL_IDLE_MS);
  });

  it('the server clock alone is not a change', () => {
    const { clock } = quietFor(6 * MIN);
    expect(nextPoll(clock, open({ now: 999_999 }), 6 * MIN + 1000).delayMs).toBe(POLL_IDLE_MS);
  });

  it('a real change resets to 2 s', () => {
    const { clock } = quietFor(6 * MIN);
    const changed = open({ events: [{ kind: 'read' }] as unknown as RunView['events'] });
    expect(nextPoll(clock, changed, 6 * MIN + 1000).delayMs).toBe(POLL_FAST_MS);
  });

  it('a user action, tab shown or back online resets to 2 s', () => {
    const { clock } = quietFor(6 * MIN);
    const woken = wakePollClock(clock, 6 * MIN + 500);
    expect(nextPoll(woken, open(), 6 * MIN + 1000).delayMs).toBe(POLL_FAST_MS);
  });

  it('keeps polling fast while a card is being decided or the run is closing', () => {
    const { clock } = quietFor(6 * MIN);
    const reading = open({ cards: [{ state: 'waiting', reason: 'reading' }] as unknown as RunView['cards'] });
    expect(nextPoll({ ...clock, fingerprint: null }, reading, 6 * MIN).delayMs).toBe(POLL_FAST_MS);
    expect(nextPoll(clock, open({ status: 'closing' }), 6 * MIN).delayMs).toBe(POLL_FAST_MS);
  });

  it('stops for finished and expired runs', () => {
    expect(nextPoll(startPollClock(0), open({ status: 'finished' }), 0).delayMs).toBeNull();
    expect(nextPoll(startPollClock(0), open({ status: 'expired' }), 0).delayMs).toBeNull();
  });
});
