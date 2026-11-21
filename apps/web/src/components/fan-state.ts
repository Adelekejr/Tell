export const FAN_CARD_COUNT = 7;
/** The Whisper (No.02) starts at the front and turns to Tell! after the deal. */
export const FAN_HERO_INDEX = 1;
/** Half the ring: a card this far round is directly behind the front. */
export const FAN_HALF = FAN_CARD_COUNT / 2;

export interface FanState {
  readonly up: ReadonlySet<number>;
  readonly heroDealt: boolean;
  readonly touched: boolean;
}

export type FanAction = { type: 'hero-dealt' } | { type: 'flip'; index: number; reduced: boolean };

export function initialFanState(): FanState {
  return { up: new Set<number>(), heroDealt: false, touched: false };
}

function validIndex(index: number) {
  return Number.isInteger(index) && index >= 0 && index < FAN_CARD_COUNT;
}

export function fanReducer(state: FanState, action: FanAction): FanState {
  switch (action.type) {
    case 'hero-dealt':
      return state.heroDealt ? state : { ...state, heroDealt: true };
    case 'flip': {
      if (!validIndex(action.index)) return state;
      const next = new Set(state.up);
      if (!state.touched && (action.reduced || state.heroDealt)) next.add(FAN_HERO_INDEX);
      if (next.has(action.index)) next.delete(action.index);
      else next.add(action.index);
      return { ...state, touched: true, up: next };
    }
  }
}

export function fanCardIsUp(state: FanState, index: number, reduced: boolean): boolean {
  return index === FAN_HERO_INDEX ? (state.touched ? state.up.has(index) : reduced || state.heroDealt) : state.up.has(index);
}

/** Card index 0..6 for any whole ring position, negative or past 7. */
export function wrapIndex(i: number): number {
  return ((Math.round(i) % FAN_CARD_COUNT) + FAN_CARD_COUNT) % FAN_CARD_COUNT;
}

/**
 * Where card `index` sits on the ring when the ring is at `pos` (a float; the
 * card `pos` points at is in front). Always in [-3.5, 3.5): 0 is the front,
 * negatives to its left, ±3.5 directly behind it. One formula for every
 * direction, so the hand always reads in number order.
 */
export function ringOffset(index: number, pos: number): number {
  const d = (((index - pos) % FAN_CARD_COUNT) + FAN_CARD_COUNT) % FAN_CARD_COUNT;
  return d >= FAN_HALF ? d - FAN_CARD_COUNT : d;
}

/** Whole-card offset at rest: -3..3. */
export function fanOffset(index: number, active: number): number {
  return Math.round(ringOffset(index, active));
}

/** The card nearest the front for a ring position. */
export function frontOf(pos: number): number {
  return wrapIndex(pos);
}

/** Ring position that brings `index` to the front the short way from `pos`. */
export function shortestTarget(pos: number, index: number): number {
  const base = Math.round(pos);
  return base + fanOffset(index, base);
}

export interface CardPose {
  /** Tilt around the fan's pivot, degrees. */
  rot: number;
  /** Vertical lift in px (negative is up). */
  lift: number;
  scale: number;
  opacity: number;
  z: number;
}

/** Degrees between neighbouring cards, the front card's lift and the depth falloff. */
export const SPREAD = 8;
export const FRONT_LIFT = -22;
const DEPTH_SCALE = 0.05;
const DEPTH_SINK = 4;

/**
 * The look of a card at ring offset `o`: tilt, lift, a little smaller and
 * lower the further round it is, and it fades out over the last half card so
 * a card wrapping round passes behind the hand unseen instead of sweeping
 * across it.
 */
export function cardPose(o: number): CardPose {
  const a = Math.abs(o);
  const front = Math.max(0, 1 - a);
  const edge = FAN_HALF - 0.5;
  return {
    rot: o * SPREAD,
    lift: FRONT_LIFT * front + DEPTH_SINK * Math.min(a, edge),
    scale: 1 - DEPTH_SCALE * Math.min(a, edge),
    opacity: a <= edge ? 1 : Math.max(0, 1 - (a - edge) / 0.5),
    z: Math.round(100 - a * 10),
  };
}

/** Swiping left (negative dx) brings later cards forward. */
export function dragToPos(startPos: number, dx: number, pxPerCard: number): number {
  return startPos - dx / pxPerCard;
}

/** Below this speed (cards a second) a release just snaps to the nearest card. */
export const FLING_MIN_SPEED = 2.5;
/** Seconds of travel a flick carries on for, before the spring takes over. */
const FLING_CARRY = 0.1;

/**
 * Momentum: where a release at `velocity` (cards a second) comes to rest. A
 * slow release snaps to the nearest card; a flick carries on, at most
 * `maxExtra` cards past the release and `maxTotal` cards from where the
 * gesture began, so a spin never laps the whole hand.
 */
export function flingTarget(pos: number, velocity: number, startPos = pos, maxExtra = 2, maxTotal = 4): number {
  const v = Math.abs(velocity) < FLING_MIN_SPEED ? 0 : velocity;
  let t = Math.round(pos + v * FLING_CARRY);
  const r = Math.round(pos);
  t = Math.max(r - maxExtra, Math.min(r + maxExtra, t));
  const s = Math.round(startPos);
  return Math.max(s - maxTotal, Math.min(s + maxTotal, t));
}

export interface Spring {
  x: number;
  v: number;
}

/** Spring constants: quick, with a small settle past the card. */
export const SPRING_K = 230;
export const SPRING_C = 24;

/** One semi-implicit Euler step of the snap spring. */
export function springStep(s: Spring, target: number, dt: number): Spring {
  const a = -SPRING_K * (s.x - target) - SPRING_C * s.v;
  const v = s.v + a * dt;
  return { x: s.x + v * dt, v };
}

export function springDone(s: Spring, target: number): boolean {
  return Math.abs(s.x - target) < 0.002 && Math.abs(s.v) < 0.02;
}
