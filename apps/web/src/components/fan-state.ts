export const FAN_CARD_COUNT = 7;
export const FAN_HERO_INDEX = 3;
/** Cards either side of the front card. */
export const FAN_REACH = (FAN_CARD_COUNT - 1) / 2;

export interface FanState {
  readonly up: ReadonlySet<number>;
  readonly heroDealt: boolean;
  readonly touched: boolean;
  /** The card at the front of the fan. */
  readonly active: number;
}

export type FanAction =
  | { type: 'hero-dealt' }
  | { type: 'flip'; index: number; reduced: boolean }
  | { type: 'rotate'; step: number }
  | { type: 'select'; index: number; reduced: boolean };

export function initialFanState(): FanState {
  return { up: new Set<number>(), heroDealt: false, touched: false, active: FAN_HERO_INDEX };
}

function validIndex(index: number) {
  return Number.isInteger(index) && index >= 0 && index < FAN_CARD_COUNT;
}

const wrap = (i: number) => ((i % FAN_CARD_COUNT) + FAN_CARD_COUNT) % FAN_CARD_COUNT;

/**
 * Where card `index` sits relative to the front card: 0 is the front,
 * -3..-1 to its left, 1..3 to its right. One formula for both directions,
 * so the hand always reads in number order around the fan.
 */
export function fanOffset(index: number, active: number): number {
  const d = wrap(index - active);
  return d > FAN_REACH ? d - FAN_CARD_COUNT : d;
}

/** Card indexes from left to right for a given front card. */
export function fanOrder(active: number): number[] {
  return Array.from({ length: FAN_CARD_COUNT }, (_, k) => wrap(active - FAN_REACH + k));
}

/** Front card on top, then outward: 10, 9, 8, 7. */
export function fanZ(offset: number): number {
  return 10 - Math.abs(offset);
}

function flip(state: FanState, index: number, reduced: boolean): FanState {
  const next = new Set(state.up);
  if (!state.touched && (reduced || state.heroDealt)) next.add(FAN_HERO_INDEX);
  if (next.has(index)) next.delete(index);
  else next.add(index);
  return { ...state, touched: true, up: next };
}

export function fanReducer(state: FanState, action: FanAction): FanState {
  switch (action.type) {
    case 'hero-dealt':
      return state.heroDealt ? state : { ...state, heroDealt: true };
    case 'flip':
      return validIndex(action.index) ? flip(state, action.index, action.reduced) : state;
    case 'rotate': {
      if (!Number.isInteger(action.step) || action.step === 0) return state;
      return { ...state, active: wrap(state.active + action.step) };
    }
    case 'select': {
      if (!validIndex(action.index)) return state;
      // The front card turns over; any other card rolls the fan round to the front.
      if (action.index === state.active) return flip(state, action.index, action.reduced);
      return { ...state, active: action.index };
    }
  }
}

export function fanCardIsUp(state: FanState, index: number, reduced: boolean): boolean {
  return index === FAN_HERO_INDEX ? (state.touched ? state.up.has(index) : reduced || state.heroDealt) : state.up.has(index);
}

/** Horizontal travel before a swipe turns the fan by one card. */
const SWIPE_THRESHOLD = 36;
/** Each further stretch of this many pixels turns one more card. */
const SWIPE_STEP = 90;
/** A quick, long flick (px per ms, and at least this far) turns one card further. */
const FLING_SPEED = 0.8;
const FLING_MIN = 80;
const MAX_SWIPE_STEPS = 3;

/** Cards a swipe of `dx` pixels over `ms` milliseconds turns (signed: positive turns to later cards). */
export function swipeSteps(dx: number, ms: number): number {
  const dist = Math.abs(dx);
  if (dist < SWIPE_THRESHOLD) return 0;
  let steps = 1 + Math.floor((dist - SWIPE_THRESHOLD) / SWIPE_STEP);
  if (dist >= FLING_MIN && ms > 0 && dist / ms >= FLING_SPEED) steps += 1;
  steps = Math.min(steps, MAX_SWIPE_STEPS);
  // Swiping left brings the next card (to the right) to the front.
  return dx < 0 ? steps : -steps;
}
