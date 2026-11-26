import type { ProofLevel } from '@tell/shared';
import { looksCaught } from '@tell/shared';

export type TrapCardAnimation = '' | 'is-flipping' | 'is-reflipping';

export interface TrapCardState {
  readonly level: ProofLevel;
  readonly animation: TrapCardAnimation;
}

export type TrapCardAction =
  | { type: 'receive'; level: ProofLevel }
  | { type: 'animation-ended' };

function isFired(level: ProofLevel) {
  return looksCaught(level);
}

/** Results only move forward: stale polling cannot hide a revealed card. */
export function canTransitionTrapCard(from: ProofLevel, to: ProofLevel): boolean {
  if (from === to) return true;
  const rank: Record<ProofLevel, number> = { waiting: 0, suspicious: 1, quiet: 1, reported: 2, fired: 3 };
  return rank[to] > rank[from];
}

export function initialTrapCardState(level: ProofLevel): TrapCardState {
  return { level, animation: '' };
}

export function trapCardReducer(state: TrapCardState, action: TrapCardAction): TrapCardState {
  if (action.type === 'animation-ended') {
    return state.animation ? { ...state, animation: '' } : state;
  }
  if (!canTransitionTrapCard(state.level, action.level)) return state;
  if (state.level === action.level) return state;
  const animation: TrapCardAnimation =
    state.level === 'waiting' ? 'is-flipping' : isFired(action.level) && !isFired(state.level) ? 'is-reflipping' : '';
  return { level: action.level, animation };
}
