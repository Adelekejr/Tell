import { describe, expect, it } from 'vitest';
import { closeTimeFor, closedAtOf, lifecycleOf, transitionLifecycle } from '../_lib/run-state.js';
import { WATCH_WINDOW_MS } from '../_lib/shared.js';

describe('run lifecycle machine', () => {
  it('open -> finished at once when no watch window is pending, and finished is terminal', () => {
    const open = lifecycleOf({ expiresAt: 200, finishedAt: null }, 100);
    const finished = transitionLifecycle(open, { type: 'finish', at: 150, closesAt: 150 });
    expect(finished).toEqual({ status: 'finished', finishedAt: 150 });
    expect(transitionLifecycle(finished, { type: 'tick', at: 500 })).toBe(finished);
    expect(transitionLifecycle(finished, { type: 'finish', at: 160, closesAt: 170 })).toBe(finished);
  });

  it('open -> closing -> finished when a page is still inside its watch window', () => {
    const open = lifecycleOf({ expiresAt: 10_000, finishedAt: null }, 100);
    const closing = transitionLifecycle(open, { type: 'finish', at: 100, closesAt: 160 });
    expect(closing).toEqual({ status: 'closing', closesAt: 160, expiresAt: 10_000 });
    expect(transitionLifecycle(closing, { type: 'tick', at: 159 })).toBe(closing);
    expect(transitionLifecycle(closing, { type: 'finish', at: 120, closesAt: 900 })).toBe(closing); // a second Finish never moves the close
    expect(transitionLifecycle(closing, { type: 'tick', at: 160 })).toEqual({ status: 'finished', finishedAt: 160 });
  });

  it('open -> expired, and expired is terminal', () => {
    const open = lifecycleOf({ expiresAt: 200, finishedAt: null }, 199);
    expect(transitionLifecycle(open, { type: 'tick', at: 199 })).toBe(open);
    const expired = transitionLifecycle(open, { type: 'tick', at: 200 });
    expect(expired).toEqual({ status: 'expired', expiresAt: 200 });
    expect(transitionLifecycle(expired, { type: 'finish', at: 201, closesAt: 201 })).toBe(expired);
    expect(lifecycleOf({ expiresAt: 200, finishedAt: null }, 200)).toEqual(expired);
  });

  it('a finish at or after expiry is an expiry; closing never runs past expiry', () => {
    const open = lifecycleOf({ expiresAt: 200, finishedAt: null }, 100);
    expect(transitionLifecycle(open, { type: 'finish', at: 200, closesAt: 200 })).toEqual({ status: 'expired', expiresAt: 200 });
    expect(transitionLifecycle(open, { type: 'finish', at: 150, closesAt: 900 })).toEqual({ status: 'closing', closesAt: 200, expiresAt: 200 });
  });

  it('derives closing and finished from the stored close time', () => {
    expect(lifecycleOf({ expiresAt: 500, finishedAt: 150 }, 100)).toEqual({ status: 'closing', closesAt: 150, expiresAt: 500 });
    expect(lifecycleOf({ expiresAt: 200, finishedAt: 150 }, 200)).toEqual({ status: 'finished', finishedAt: 150 });
    expect(closedAtOf(lifecycleOf({ expiresAt: 500, finishedAt: 150 }, 100))).toBeNull();
    expect(closedAtOf(lifecycleOf({ expiresAt: 500, finishedAt: 150 }, 151))).toBe(150);
    expect(closedAtOf(lifecycleOf({ expiresAt: 500, finishedAt: null }, 600))).toBe(500);
  });

  it('close time waits for the last pending watch window, bounded by now and expiry', () => {
    expect(closeTimeFor([], 1000, 9e9)).toBe(1000);
    expect(closeTimeFor([990, 950], 1000, 9e9)).toBe(990 + WATCH_WINDOW_MS);
    expect(closeTimeFor([1000 - WATCH_WINDOW_MS - 5], 1000, 9e9)).toBe(1000);
    expect(closeTimeFor([990], 1000, 1010)).toBe(1010);
  });
});
