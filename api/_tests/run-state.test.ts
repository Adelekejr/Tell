import { describe, expect, it } from 'vitest';
import { lifecycleOf, transitionLifecycle } from '../_lib/run-state.js';

describe('run lifecycle', () => {
  it('allows open to finish and keeps finished terminal', () => {
    const open = lifecycleOf({ expiresAt: 200, finishedAt: null }, 100);
    const finished = transitionLifecycle(open, { type: 'finish', at: 150 });
    expect(finished).toEqual({ status: 'finished', finishedAt: 150 });
    expect(transitionLifecycle(finished, { type: 'expire', at: 200 })).toBe(finished);
  });

  it('allows open to expire and ignores later finish', () => {
    const open = lifecycleOf({ expiresAt: 200, finishedAt: null }, 200);
    expect(open).toEqual({ status: 'expired', expiresAt: 200 });
    expect(transitionLifecycle(open, { type: 'finish', at: 201 })).toBe(open);
  });

  it('ignores illegal early expiry and late finish transitions', () => {
    const open = lifecycleOf({ expiresAt: 200, finishedAt: null }, 100);
    expect(transitionLifecycle(open, { type: 'expire', at: 199 })).toBe(open);
    expect(transitionLifecycle(open, { type: 'finish', at: 200 })).toBe(open);
  });

  it('preserves finish precedence at a later observation', () => {
    expect(lifecycleOf({ expiresAt: 200, finishedAt: 150 }, 200)).toEqual({ status: 'finished', finishedAt: 150 });
  });
});
