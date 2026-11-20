export const FAN_CARD_COUNT = 7;
export const FAN_HERO_INDEX = 3;

export interface FanState {
  readonly up: ReadonlySet<number>;
  readonly heroDealt: boolean;
  readonly touched: boolean;
  readonly top: number | null;
  readonly focus: number;
  readonly dragging: number | null;
}

export type FanAction =
  | { type: 'hero-dealt' }
  | { type: 'flip'; index: number; reduced: boolean }
  | { type: 'focus'; index: number }
  | { type: 'drag-start'; index: number }
  | { type: 'drag-end'; index: number };

export function initialFanState(): FanState {
  return {
    up: new Set<number>(),
    heroDealt: false,
    touched: false,
    top: null,
    focus: FAN_HERO_INDEX,
    dragging: null,
  };
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
      const touched = true;
      if (!state.touched && (action.reduced || state.heroDealt)) next.add(FAN_HERO_INDEX);
      if (next.has(action.index)) next.delete(action.index);
      else next.add(action.index);
      return { ...state, touched, up: next, top: action.index };
    }
    case 'focus':
      return validIndex(action.index) && state.focus !== action.index ? { ...state, focus: action.index } : state;
    case 'drag-start':
      return validIndex(action.index) ? { ...state, dragging: action.index, top: action.index } : state;
    case 'drag-end':
      return state.dragging === action.index ? { ...state, dragging: null } : state;
  }
}

export function fanCardIsUp(state: FanState, index: number, reduced: boolean): boolean {
  return index === FAN_HERO_INDEX ? (state.touched ? state.up.has(index) : reduced || state.heroDealt) : state.up.has(index);
}
