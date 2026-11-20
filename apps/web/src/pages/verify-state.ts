import type { SignedCard } from '@tell/shared';
import type { Check } from '../card/useVerifiedCard';

export type PasteResult = { card: SignedCard | null; check: Check };

export type PasteCheckState =
  | { status: 'idle'; text: string; error: null; result: null; requestId: number }
  | { status: 'invalid'; text: string; error: string; result: PasteResult | null; requestId: number }
  | { status: 'checking'; text: string; error: null; result: PasteResult | null; requestId: number }
  | { status: 'done'; text: string; error: null; result: PasteResult; requestId: number };

export type PasteCheckAction =
  | { type: 'text'; text: string }
  | { type: 'invalid'; error: string; requestId: number }
  | { type: 'checking'; requestId: number }
  | { type: 'done'; requestId: number; result: PasteResult };

export const initialPasteCheckState: PasteCheckState = { status: 'idle', text: '', error: null, result: null, requestId: 0 };

export function pasteCheckReducer(state: PasteCheckState, action: PasteCheckAction): PasteCheckState {
  if (action.type === 'text') return { ...state, text: action.text };
  if (action.type === 'invalid') return { status: 'invalid', text: state.text, error: action.error, result: state.result, requestId: action.requestId };
  if (action.type === 'checking') {
    if (action.requestId <= state.requestId) return state;
    return { status: 'checking', text: state.text, error: null, result: state.result, requestId: action.requestId };
  }
  if (state.status !== 'checking' || state.requestId !== action.requestId) return state;
  return { status: 'done', text: state.text, error: null, result: action.result, requestId: action.requestId };
}
