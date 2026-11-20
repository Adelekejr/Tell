export type SubmissionState =
  | { status: 'idle' }
  | { status: 'submitting'; requestId: number }
  | { status: 'validation-error'; requestId: number; message: string }
  | { status: 'error'; requestId: number; message: string }
  | { status: 'success'; requestId: number };

export type SubmissionAction =
  | { type: 'begin'; requestId: number }
  | { type: 'validation-error'; requestId: number; message: string }
  | { type: 'failure'; requestId: number; message: string }
  | { type: 'success'; requestId: number };

export const initialSubmissionState: SubmissionState = { status: 'idle' };

export function submissionReducer(state: SubmissionState, action: SubmissionAction): SubmissionState {
  switch (action.type) {
    case 'begin':
      return state.status === 'submitting' ? state : { status: 'submitting', requestId: action.requestId };
    case 'validation-error':
      return state.status === 'submitting' && state.requestId === action.requestId
        ? { status: 'validation-error', requestId: action.requestId, message: action.message }
        : state;
    case 'failure':
      return state.status === 'submitting' && state.requestId === action.requestId
        ? { status: 'error', requestId: action.requestId, message: action.message }
        : state;
    case 'success':
      return state.status === 'submitting' && state.requestId === action.requestId
        ? { status: 'success', requestId: action.requestId }
        : state;
  }
}
