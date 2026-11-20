import { describe, expect, it } from 'vitest';
import { analyseText } from '../check/analyse';
import { checkReducer, initialCheckState } from './check-state';

const first = analyseText('first');
const second = analyseText('second');

function loading(requestId: number) {
  return checkReducer(initialCheckState(), { type: 'start', requestId });
}

describe('check request state', () => {
  it('allows a request to start and complete', () => {
    const started = loading(1);
    const completed = checkReducer(started, { type: 'success', requestId: 1, view: first, meta: 'first result' });

    expect(started.status).toBe('loading');
    expect(completed).toMatchObject({ status: 'success', view: first, meta: 'first result', error: null, requestId: 1 });
  });

  it('retains the prior result while loading and after failure', () => {
    const prior = { status: 'success' as const, view: first, meta: 'first result', error: null, requestId: 1 };
    const started = checkReducer(prior, { type: 'start', requestId: 2 });
    const failed = checkReducer(started, { type: 'failure', requestId: 2, error: 'Could not open the page.' });

    expect(started).toMatchObject({ status: 'loading', view: first, meta: 'first result', error: null, requestId: 2 });
    expect(failed).toMatchObject({ status: 'error', view: first, meta: 'first result', error: 'Could not open the page.', requestId: 2 });
  });

  it('ignores stale success and failure responses from an older request', () => {
    const newer = checkReducer(loading(1), { type: 'start', requestId: 2 });
    const afterOldSuccess = checkReducer(newer, { type: 'success', requestId: 1, view: first, meta: 'old result' });
    const afterOldFailure = checkReducer(afterOldSuccess, { type: 'failure', requestId: 1, error: 'old failure' });
    const afterNewSuccess = checkReducer(afterOldFailure, { type: 'success', requestId: 2, view: second, meta: 'new result' });

    expect(afterOldFailure).toBe(newer);
    expect(afterNewSuccess).toMatchObject({ status: 'success', view: second, meta: 'new result', requestId: 2 });
  });

  it('rejects terminal transitions that do not follow the active request', () => {
    const idle = initialCheckState();
    const afterSuccess = checkReducer(idle, { type: 'success', requestId: 1, view: first, meta: 'unexpected' });
    const afterFailure = checkReducer(idle, { type: 'failure', requestId: 1, error: 'unexpected' });
    const started = loading(1);
    const afterOlderStart = checkReducer(started, { type: 'start', requestId: 1 });

    expect(afterSuccess).toBe(idle);
    expect(afterFailure).toBe(idle);
    expect(afterOlderStart).toBe(started);
  });
});
