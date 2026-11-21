import { useEffect, useReducer, useRef } from 'react';
import type { CSSProperties, KeyboardEvent, PointerEvent } from 'react';
import { getTrap, trapNumber } from '@tell/shared';
import type { TrapId, TrapInfo } from '@tell/shared';
import { useReducedMotion } from '../lib/motion';
import { CardBack, CardFront } from './TrapCard';
import { FAN_CARD_COUNT, fanCardIsUp, fanOffset, fanReducer, fanZ, initialFanState, swipeSteps } from './fan-state';

/** The hand in number order. The Whisper starts at the front. */
const FAN: { id: TrapId; hero?: boolean }[] = [
  { id: 'invisible-ink' },
  { id: 'ghost-letters' },
  { id: 'cipher' },
  { id: 'whisper', hero: true },
  { id: 'hashtag' },
  { id: 'postcard' },
  { id: 'impostor' },
];

const DEAL_STAGGER = 60;
const DEAL_MS = 400;
/** Degrees between neighbouring cards. */
const SPREAD = 8;
/** How far the front card stands up. */
const FRONT_LIFT = -22;
/** Pointer travel (px) before a press counts as a swipe instead of a tap. */
const DRAG_SLOP = 6;
/** Wheel travel that turns one card, and the quiet gap that ends a wheel gesture. */
const WHEEL_THRESHOLD = 24;
const WHEEL_QUIET_MS = 220;
const WHEEL_REPEAT_MS = 650;

interface Swipe {
  id: number;
  x: number;
  y: number;
  t: number;
  axis: 'pending' | 'horizontal' | 'vertical';
}

/** A face-up card on the home fan that isn't the hero: what the trap is, not a result. */
function TrickFace({ trap }: { trap: TrapInfo }) {
  return (
    <div className="tcard-face tcard-front is-trick">
      <div className="tcard-corner">
        <span className="tcard-no">{trapNumber(trap.no)}</span>
        <span className="tcard-no tcard-total">/07</span>
      </div>
      <div>
        <div className="tcard-name">{trap.name}</div>
        <div className="tcard-ev fan-trick">{trap.trick}</div>
        <div className="tcard-ev fan-family">{trap.family}</div>
      </div>
    </div>
  );
}

/**
 * Home hero: the seven trap cards are dealt into a fan, then the front card
 * flips to "Tell!". The fan turns all the way round in either direction: swipe
 * or drag sideways, use the mouse wheel or trackpad, or the arrow keys. Tap a
 * card further round and the fan rolls the short way until it is at the front;
 * tap the front card to turn it over and see what that trap tests. Every card's
 * place, tilt and stacking come from one number, its offset from the front, so
 * the hand reads in number order whichever way it turns.
 */
export function Fan() {
  const reduced = useReducedMotion();
  const [fan, dispatch] = useReducer(fanReducer, undefined, initialFanState);
  const root = useRef<HTMLDivElement | null>(null);
  const cards = useRef<(HTMLButtonElement | null)[]>([]);
  const swipe = useRef<Swipe | null>(null);
  const swallowClick = useRef(false);
  const keyboard = useRef(false);

  // After the deal, the front card turns over on its own, unless the visitor got there first.
  useEffect(() => {
    if (reduced) return;
    const t = window.setTimeout(() => dispatch({ type: 'hero-dealt' }), FAN.length * DEAL_STAGGER + DEAL_MS + 140);
    return () => window.clearTimeout(t);
  }, [reduced]);

  // Keyboard turns keep focus on the card that came to the front.
  useEffect(() => {
    if (!keyboard.current) return;
    keyboard.current = false;
    cards.current[fan.active]?.focus();
  }, [fan.active]);

  // Mouse wheel and trackpad: one card per gesture, whichever axis it scrolls on.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let total = 0;
    let locked = false;
    let lockedAt = 0;
    let quiet: number | null = null;
    const onWheel = (e: WheelEvent) => {
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (!delta) return;
      e.preventDefault();
      if (quiet !== null) window.clearTimeout(quiet);
      quiet = window.setTimeout(() => {
        locked = false;
        total = 0;
        quiet = null;
      }, WHEEL_QUIET_MS);
      const now = Date.now();
      if (locked && now - lockedAt < WHEEL_REPEAT_MS) return;
      locked = false;
      total += delta;
      if (Math.abs(total) < WHEEL_THRESHOLD) return;
      dispatch({ type: 'rotate', step: total > 0 ? 1 : -1 });
      total = 0;
      locked = true;
      lockedAt = now;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
      if (quiet !== null) window.clearTimeout(quiet);
    };
  }, []);

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    swipe.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, axis: 'pending' };
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const s = swipe.current;
    if (!s || s.id !== e.pointerId || s.axis !== 'pending') return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.hypot(dx, dy) < DRAG_SLOP) return;
    s.axis = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
    // Keep following a sideways mouse drag that leaves the fan.
    if (s.axis === 'horizontal') e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  function onPointerEnd(e: PointerEvent<HTMLDivElement>) {
    const s = swipe.current;
    if (!s || s.id !== e.pointerId) return;
    swipe.current = null;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (s.axis === 'pending') return;
    // Any real movement ends in a click that isn't a tap; let it pass without selecting.
    if (e.type === 'pointerup') {
      swallowClick.current = true;
      window.setTimeout(() => (swallowClick.current = false), 400);
    }
    if (e.type !== 'pointerup' || s.axis !== 'horizontal' || Math.abs(dx) <= Math.abs(dy)) return;
    const step = swipeSteps(dx, e.timeStamp - s.t);
    if (step) dispatch({ type: 'rotate', step });
  }

  function onClick(i: number) {
    if (swallowClick.current) {
      swallowClick.current = false;
      return;
    }
    dispatch({ type: 'select', index: i, reduced });
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    keyboard.current = true;
    dispatch({ type: 'rotate', step });
  }

  const front = getTrap(FAN[fan.active]!.id);

  return (
    <div
      ref={root}
      className="fan"
      role="toolbar"
      aria-label="The seven trap cards. Swipe, scroll or use the arrow keys to turn the fan. Press the front card to flip it."
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onLostPointerCapture={onPointerEnd}
    >
      {FAN.map((c, i) => {
        const trap = getTrap(c.id);
        const faceUp = fanCardIsUp(fan, i, reduced);
        const offset = fanOffset(i, fan.active);
        const atFront = offset === 0;
        return (
          <div
            key={c.id}
            className={`fan-card${faceUp ? ' is-up' : ''}${atFront ? ' is-front' : ''}`}
            data-offset={offset}
            style={
              {
                '--rot': `${offset * SPREAD}deg`,
                '--lift': `${atFront ? FRONT_LIFT : 0}px`,
                '--i': i,
                zIndex: fanZ(offset),
              } as CSSProperties
            }
          >
            <button
              ref={(el) => {
                cards.current[i] = el;
              }}
              type="button"
              className={`tcard${faceUp ? ' is-flipped' : ''}`}
              tabIndex={atFront ? 0 : -1}
              aria-label={
                faceUp
                  ? `${trap.name}: ${c.hero ? 'Tell! It fired.' : trap.trick}`
                  : `${trap.name}, face down${atFront ? '' : '. Press to bring it to the front.'}`
              }
              onClick={() => onClick(i)}
              onKeyDown={onKeyDown}
            >
              <div className="tcard-inner" aria-hidden="true">
                <CardBack trap={trap} label="" />
                {c.hero ? <CardFront trap={trap} state="fired" evidence={'canary hit \u00B7 word \u2713'} /> : <TrickFace trap={trap} />}
              </div>
            </button>
          </div>
        );
      })}
      <p className="sr-only" aria-live="polite">
        {`${trapNumber(front.no)} of ${FAN_CARD_COUNT}, ${front.name}, at the front.`}
      </p>
    </div>
  );
}
