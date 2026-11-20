import type { DeviceAvailability } from '../ai/source';
import type { AiProblem } from '../ai/modes';
import type { DrillResult, DrillTrapResult, HardenSuggestion } from '../drill/run';

type DownloadState =
  | { kind: 'idle' }
  | { kind: 'running'; requestId: number; progress: number }
  | { kind: 'failed'; requestId: number };

export type ModelState = {
  availability: DeviceAvailability | null;
  download: DownloadState;
  generation: number;
};

export type ModelAction =
  | { type: 'availability-observed'; requestId: number; availability: DeviceAvailability }
  | { type: 'download-started'; requestId: number }
  | { type: 'download-progress'; requestId: number; progress: number }
  | { type: 'download-succeeded'; requestId: number; availability: DeviceAvailability }
  | { type: 'download-failed'; requestId: number };

export const initialModelState: ModelState = { availability: null, download: { kind: 'idle' }, generation: 0 };

export function modelReducer(state: ModelState, action: ModelAction): ModelState {
  switch (action.type) {
    case 'availability-observed':
      return action.requestId === state.generation && state.download.kind !== 'running'
        ? { ...state, availability: action.availability }
        : state;
    case 'download-started':
      if (state.download.kind === 'running' || action.requestId <= state.generation) return state;
      return { ...state, generation: action.requestId, download: { kind: 'running', requestId: action.requestId, progress: 0 } };
    case 'download-progress':
      if (state.download.kind !== 'running' || state.download.requestId !== action.requestId) return state;
      return { ...state, download: { ...state.download, progress: action.progress } };
    case 'download-succeeded':
      if (state.download.kind !== 'running' || state.download.requestId !== action.requestId) return state;
      return { ...state, availability: action.availability, download: { kind: 'idle' } };
    case 'download-failed':
      if (state.download.kind !== 'running' || state.download.requestId !== action.requestId) return state;
      return { ...state, download: { kind: 'failed', requestId: action.requestId } };
  }
}

export type DrillStage =
  | { kind: 'idle' }
  | { kind: 'running'; requestId: number; label: string; partial: DrillTrapResult[] }
  | { kind: 'succeeded'; requestId: number; result: DrillResult }
  | { kind: 'failed'; requestId: number; problem: AiProblem };

export type DrillStageAction =
  | { type: 'drill-started'; requestId: number; label: string }
  | { type: 'drill-progress'; requestId: number; partial: DrillTrapResult[] }
  | { type: 'drill-succeeded'; requestId: number; result: DrillResult }
  | { type: 'drill-failed'; requestId: number; problem: AiProblem }
  | { type: 'drill-finished'; requestId: number };

export const initialDrillStage: DrillStage = { kind: 'idle' };

export function drillStageReducer(state: DrillStage, action: DrillStageAction): DrillStage {
  switch (action.type) {
    case 'drill-started':
      if (state.kind === 'running' && action.requestId <= state.requestId) return state;
      return { kind: 'running', requestId: action.requestId, label: action.label, partial: [] };
    case 'drill-progress':
      if (state.kind !== 'running' || state.requestId !== action.requestId) return state;
      return { ...state, partial: action.partial };
    case 'drill-succeeded':
      if (state.kind !== 'running' || state.requestId !== action.requestId) return state;
      return { kind: 'succeeded', requestId: action.requestId, result: action.result };
    case 'drill-failed':
      if (state.kind !== 'running' || state.requestId !== action.requestId) return state;
      return { kind: 'failed', requestId: action.requestId, problem: action.problem };
    case 'drill-finished':
      if (state.kind !== 'running' || state.requestId !== action.requestId) return state;
      return { kind: 'idle' };
  }
}

export type HardenStage =
  | { kind: 'idle' }
  | { kind: 'running'; requestId: number }
  | { kind: 'succeeded'; requestId: number; suggestion: HardenSuggestion }
  | { kind: 'failed'; requestId: number; problem: AiProblem };

export type HardenStageAction =
  | { type: 'harden-started'; requestId: number }
  | { type: 'harden-succeeded'; requestId: number; suggestion: HardenSuggestion }
  | { type: 'harden-failed'; requestId: number; problem: AiProblem }
  | { type: 'harden-reset' };

export const initialHardenStage: HardenStage = { kind: 'idle' };

export function hardenStageReducer(state: HardenStage, action: HardenStageAction): HardenStage {
  switch (action.type) {
    case 'harden-started':
      if (state.kind === 'running' && action.requestId <= state.requestId) return state;
      return { kind: 'running', requestId: action.requestId };
    case 'harden-succeeded':
      if (state.kind !== 'running' || state.requestId !== action.requestId) return state;
      return { kind: 'succeeded', requestId: action.requestId, suggestion: action.suggestion };
    case 'harden-failed':
      if (state.kind !== 'running' || state.requestId !== action.requestId) return state;
      return { kind: 'failed', requestId: action.requestId, problem: action.problem };
    case 'harden-reset':
      return initialHardenStage;
  }
}

export type CompareResult = { device: DrillResult; cloud: DrillResult };
export type CompareStage =
  | { kind: 'idle'; previous: CompareResult | null }
  | { kind: 'running'; requestId: number; previous: CompareResult | null }
  | { kind: 'succeeded'; requestId: number; compare: CompareResult; previous: CompareResult | null }
  | { kind: 'failed'; requestId: number; problem: AiProblem; previous: CompareResult | null };

export type CompareStageAction =
  | { type: 'compare-started'; requestId: number }
  | { type: 'compare-succeeded'; requestId: number; compare: CompareResult }
  | { type: 'compare-failed'; requestId: number; problem: AiProblem }
  | { type: 'compare-cancel' }
  | { type: 'compare-reset' };

export const initialCompareStage: CompareStage = { kind: 'idle', previous: null };

export function compareStageReducer(state: CompareStage, action: CompareStageAction): CompareStage {
  switch (action.type) {
    case 'compare-started': {
      if (state.kind === 'running' && action.requestId <= state.requestId) return state;
      const previous = state.kind === 'succeeded' ? state.compare : state.previous;
      return { kind: 'running', requestId: action.requestId, previous };
    }
    case 'compare-succeeded':
      if (state.kind !== 'running' || state.requestId !== action.requestId) return state;
      return { kind: 'succeeded', requestId: action.requestId, compare: action.compare, previous: state.previous };
    case 'compare-failed':
      if (state.kind !== 'running' || state.requestId !== action.requestId) return state;
      return { kind: 'failed', requestId: action.requestId, problem: action.problem, previous: state.previous };
    case 'compare-cancel':
      if (state.kind !== 'running') return state;
      return { kind: 'idle', previous: state.previous };
    case 'compare-reset':
      return initialCompareStage;
  }
}

export type AdoptStage = { kind: 'idle' } | { kind: 'running'; requestId: number } | { kind: 'succeeded'; requestId: number } | { kind: 'failed'; requestId: number; problem: AiProblem };
export type AdoptStageAction =
  | { type: 'adopt-started'; requestId: number }
  | { type: 'adopt-succeeded'; requestId: number }
  | { type: 'adopt-failed'; requestId: number; problem: AiProblem }
  | { type: 'adopt-reset' };

export const initialAdoptStage: AdoptStage = { kind: 'idle' };

export function adoptStageReducer(state: AdoptStage, action: AdoptStageAction): AdoptStage {
  switch (action.type) {
    case 'adopt-started':
      if (state.kind === 'running' && action.requestId <= state.requestId) return state;
      return { kind: 'running', requestId: action.requestId };
    case 'adopt-succeeded':
      if (state.kind !== 'running' || state.requestId !== action.requestId) return state;
      return { kind: 'succeeded', requestId: action.requestId };
    case 'adopt-failed':
      if (state.kind !== 'running' || state.requestId !== action.requestId) return state;
      return { kind: 'failed', requestId: action.requestId, problem: action.problem };
    case 'adopt-reset':
      return initialAdoptStage;
  }
}
