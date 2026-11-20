import type { CheckView } from '../check/analyse';

type CheckStateStatus = 'idle' | 'loading' | 'success' | 'error';

export type CheckState = {
  status: CheckStateStatus;
  view: CheckView | null;
  meta: string | null;
  error: string | null;
  requestId: number;
};

type CheckAction =
  | { type: 'start'; requestId: number }
  | { type: 'success'; requestId: number; view: CheckView; meta: string | null }
  | { type: 'failure'; requestId: number; error: string }
  | { type: 'clear'; requestId: number };

export function initialCheckState(opening: { view: CheckView; meta: string } | null = null): CheckState {
  return opening
    ? { status: 'success', view: opening.view, meta: opening.meta, error: null, requestId: 0 }
    : { status: 'idle', view: null, meta: null, error: null, requestId: 0 };
}

export function checkReducer(state: CheckState, action: CheckAction): CheckState {
  switch (action.type) {
    case 'start':
      return action.requestId > state.requestId
        ? { ...state, status: 'loading', error: null, requestId: action.requestId }
        : state;
    case 'success':
      return action.requestId === state.requestId && state.status === 'loading'
        ? { status: 'success', view: action.view, meta: action.meta, error: null, requestId: action.requestId }
        : state;
    case 'failure':
      return action.requestId === state.requestId && state.status === 'loading'
        ? { ...state, status: 'error', error: action.error }
        : state;
    case 'clear':
      return action.requestId > state.requestId
        ? { status: 'idle', view: null, meta: null, error: null, requestId: action.requestId }
        : state;
  }
}
