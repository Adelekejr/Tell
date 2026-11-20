import { describe, expect, it } from 'vitest';
import {
  adoptStageReducer,
  compareStageReducer,
  drillStageReducer,
  hardenStageReducer,
  initialAdoptStage,
  initialCompareStage,
  initialDrillStage,
  initialHardenStage,
  initialModelState,
  modelReducer,
} from './prompt-drill-state';

const problem = 'network' as const;
const result = { results: [], finishedAt: 1 } as never;
const suggestion = { prompt: 'hardened', changes: [], source: 'on-device' as const };

describe('typed PromptDrill operation state', () => {
  it('accepts a download and ignores duplicate or stale transitions', () => {
    const started = modelReducer(initialModelState, { type: 'download-started', requestId: 1 });
    expect(modelReducer(started, { type: 'download-started', requestId: 2 })).toBe(started);
    const progress = modelReducer(started, { type: 'download-progress', requestId: 1, progress: 0.5 });
    expect(progress.download).toEqual({ kind: 'running', requestId: 1, progress: 0.5 });
    expect(modelReducer(progress, { type: 'availability-observed', requestId: 0, availability: 'downloadable' })).toBe(progress);
    expect(modelReducer(progress, { type: 'download-progress', requestId: 2, progress: 0.9 })).toBe(progress);
    expect(modelReducer(progress, { type: 'download-succeeded', requestId: 2, availability: 'available' })).toBe(progress);
    const completed = modelReducer(progress, { type: 'download-succeeded', requestId: 1, availability: 'available' });
    expect(completed).toMatchObject({ availability: 'available', generation: 1, download: { kind: 'idle' } });
    expect(modelReducer(completed, { type: 'availability-observed', requestId: 0, availability: 'downloadable' })).toBe(completed);
  });

  it('lets a newer drill replace the active generation and rejects its late updates', () => {
    const first = drillStageReducer(initialDrillStage, { type: 'drill-started', requestId: 1, label: 'Prompt drill' });
    const latest = drillStageReducer(first, { type: 'drill-started', requestId: 2, label: 'Prompt drill' });
    expect(latest).toMatchObject({ kind: 'running', requestId: 2 });
    expect(drillStageReducer(latest, { type: 'drill-progress', requestId: 1, partial: [] })).toBe(latest);
    expect(drillStageReducer(latest, { type: 'drill-succeeded', requestId: 1, result })).toBe(latest);
    expect(drillStageReducer(latest, { type: 'drill-succeeded', requestId: 2, result })).toMatchObject({ kind: 'succeeded', requestId: 2 });
    expect(drillStageReducer(initialDrillStage, { type: 'drill-succeeded', requestId: 1, result })).toBe(initialDrillStage);
  });

  it('rejects stale hardening results and supports resetting its suggestion', () => {
    const first = hardenStageReducer(initialHardenStage, { type: 'harden-started', requestId: 1 });
    const latest = hardenStageReducer(first, { type: 'harden-started', requestId: 2 });
    expect(hardenStageReducer(latest, { type: 'harden-succeeded', requestId: 1, suggestion })).toBe(latest);
    const succeeded = hardenStageReducer(latest, { type: 'harden-succeeded', requestId: 2, suggestion });
    expect(succeeded).toMatchObject({ kind: 'succeeded', suggestion });
    expect(hardenStageReducer(succeeded, { type: 'harden-reset' })).toEqual(initialHardenStage);
  });

  it('rejects stale comparisons and retains the last completed comparison after failure', () => {
    const first = compareStageReducer(initialCompareStage, { type: 'compare-started', requestId: 1 });
    const latest = compareStageReducer(first, { type: 'compare-started', requestId: 2 });
    const comparison = { device: result, cloud: result };
    expect(compareStageReducer(latest, { type: 'compare-succeeded', requestId: 1, compare: comparison })).toBe(latest);
    const succeeded = compareStageReducer(latest, { type: 'compare-succeeded', requestId: 2, compare: comparison });
    expect(succeeded).toMatchObject({ kind: 'succeeded', compare: comparison });
    const retry = compareStageReducer(succeeded, { type: 'compare-started', requestId: 3 });
    expect(compareStageReducer(retry, { type: 'compare-cancel' })).toEqual({ kind: 'idle', previous: comparison });
    const failed = compareStageReducer(retry, { type: 'compare-failed', requestId: 3, problem });
    expect(failed).toMatchObject({ kind: 'failed', previous: comparison });
    expect(compareStageReducer(failed, { type: 'compare-reset' })).toEqual(initialCompareStage);
  });

  it('accepts adoption only for the current operation', () => {
    const first = adoptStageReducer(initialAdoptStage, { type: 'adopt-started', requestId: 1 });
    const latest = adoptStageReducer(first, { type: 'adopt-started', requestId: 2 });
    expect(adoptStageReducer(latest, { type: 'adopt-succeeded', requestId: 1 })).toBe(latest);
    expect(adoptStageReducer(latest, { type: 'adopt-failed', requestId: 1, problem })).toBe(latest);
    expect(adoptStageReducer(latest, { type: 'adopt-succeeded', requestId: 2 })).toMatchObject({ kind: 'succeeded', requestId: 2 });
    expect(adoptStageReducer(latest, { type: 'adopt-reset' })).toEqual(initialAdoptStage);
  });
});
