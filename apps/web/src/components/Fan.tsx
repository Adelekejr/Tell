import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, PointerEvent } from 'react';
import { TRAPS, trapNumber } from '@tell/shared';
import type { TrapInfo } from '@tell/shared';
import { tick, useReducedMotion } from '../lib/motion';
import { CardBack, CardFront } from './TrapCard';
import {
  FAN_CARD_COUNT,
  FAN_HERO_INDEX,
  cardPose,
  dragToPos,
  fanCardIsUp,
  fanReducer,
  flingTarget,
  frontOf,
  initialFanState,
  ringOffset,
  shortestTarget,
  springDone,
  springStep,
  SPRING_K,
} from './fan-state';
import type { Spring } from './fan-state';

/** The hand in number order, No.01 to No.07. */
const HAND: readonly TrapInfo[] = [...TRAPS].sort((a, b) => a.no - b.no);

const DEAL_STAGGER = 60;
const DEAL_MS = 400;
/** Pointer travel (px) before a press becomes a drag instead of a tap. */
const DRAG_SLOP = 8;
/** A turned card rises a little so its face reads. */
const UP_LIFT = -14;
/** Wheel: a mouse notch turns one card; trackpad scrolling follows, then snaps after this quiet gap. */
const WHEEL_NOTCH = 100;
const WHEEL_QUIET_MS = 140;
const WHEEL_TRACKPAD_PX = 120;

interface Gesture {
  id: number;
  x: number;
  y: number;
  startPos: number;
  mode: 'pending' | 'drag' | 'scroll';
  samples: { t: number; pos: number }[];
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

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const raf = (cb: FrameRequestCallback) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(cb) : window.setTimeout(() => cb(now()), 16));
const caf = (id: number) => (typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame(id) : window.clearTimeout(id));

/**
 * Home hero: the seven trap cards on an endless ring, No.01 to No.07. The ring
 * follows a finger or mouse drag directly, carries on with the flick's momentum,
 * and springs onto the nearest card. The mouse wheel, trackpad and arrow keys
 * turn it too. Tap a card further round and the ring rolls the short way to
 * it; tap the front card to turn it over and see what that trap tests. Cards
 * going round the back fade out behind the hand, so none ever sweeps across
 * it. Only transforms and opacity change, frame by frame.
 */
export function Fan() {
  const reduced = useReducedMotion();
  const [fan, dispatch] = useReducer(fanReducer, undefined, initialFanState);
  const [active, setActive] = useState(FAN_HERO_INDEX);
  const root = useRef<HTMLDivElement | null>(null);
  const slots = useRef<(HTMLDivElement | null)[]>([]);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const pos = useRef<number>(FAN_HERO_INDEX);
  const spring = useRef<{ s: Spring; target: number } | null>(null);
  const frame = useRef<number | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const dragged = useRef(false);
  const tapped = useRef(false);
  const detent = useRef(FAN_HERO_INDEX);
  const focusFront = useRef(false);
  const upRef = useRef<(i: number) => boolean>(() => false);
  const reducedRef = useRef(reduced);

  /** Draw every card for the current ring position. */
  const draw = useCallback(() => {
    const p = pos.current;
    for (let i = 0; i < FAN_CARD_COUNT; i += 1) {
      const el = slots.current[i];
      if (!el) continue;
      const o = ringOffset(i, p);
      const pose = cardPose(o);
      const lift = pose.lift + (upRef.current(i) && !reducedRef.current ? UP_LIFT : 0);
      el.style.transform = `rotate(${pose.rot.toFixed(3)}deg) translateY(${lift.toFixed(2)}px) scale(${pose.scale.toFixed(4)})`;
      el.style.opacity = pose.opacity < 1 ? pose.opacity.toFixed(3) : '';
      el.style.zIndex = String(pose.z);
      el.style.visibility = pose.opacity <= 0 ? 'hidden' : '';
      el.dataset.offset = String(Math.round(o));
    }
    const f = frontOf(p);
    const d = Math.round(p);
    if (d !== detent.current) {
      detent.current = d;
      // A light detent click each time a card passes the front, like a dial.
      if (gesture.current?.mode === 'drag' || spring.current) tick();
    }
    setActive((a) => (a === f ? a : f));
  }, []);

  const stop = useCallback(() => {
    if (frame.current !== null) caf(frame.current);
    frame.current = null;
    spring.current = null;
  }, []);

  /** Spring the ring to rest on `target`, starting with `velocity` (cards a second). */
  const settle = useCallback(
    (target: number, velocity = 0) => {
      stop();
      if (reducedRef.current) {
        pos.current = target;
        draw();
        return;
      }
      // Hand the flick's speed to the spring, but no more than it needs to arrive:
      // a hard flick lands with a soft settle instead of a long wobble.
      const cap = Math.sqrt(SPRING_K) * Math.abs(target - pos.current) + 1;
      const v = Math.max(-cap, Math.min(cap, velocity));
      spring.current = { s: { x: pos.current, v }, target };
      let last = now();
      const loop = (t: number) => {
        const sp = spring.current;
        if (!sp) return;
        // Fixed small steps keep the spring stable on slow frames.
        let dt = Math.min(0.064, Math.max(0, (t - last) / 1000));
        last = t;
        while (dt > 0) {
          const h = Math.min(dt, 1 / 120);
          sp.s = springStep(sp.s, sp.target, h);
          dt -= h;
        }
        if (springDone(sp.s, sp.target)) {
          pos.current = sp.target;
          spring.current = null;
          frame.current = null;
          draw();
          return;
        }
        pos.current = sp.s.x;
        draw();
        frame.current = raf(loop);
      };
      frame.current = raf(loop);
    },
    [draw, stop],
  );

  const turn = useCallback(
    (step: number) => {
      const base = spring.current ? spring.current.target : Math.round(pos.current);
      settle(base + step, spring.current?.s.v ?? 0);
    },
    [settle],
  );

  // Draw before paint, and again whenever a card turns over.
  useLayoutEffect(() => {
    reducedRef.current = reduced;
    upRef.current = (i: number) => fanCardIsUp(fan, i, reduced);
    draw();
  }, [draw, fan, reduced]);
  useEffect(() => stop, [stop]);

  // After the deal, the front card turns over on its own, unless the visitor got there first.
  useEffect(() => {
    if (reduced) return;
    const t = window.setTimeout(() => dispatch({ type: 'hero-dealt' }), HAND.length * DEAL_STAGGER + DEAL_MS + 140);
    return () => window.clearTimeout(t);
  }, [reduced]);

  // Keyboard turns keep focus on the card that came to the front.
  useEffect(() => {
    if (!focusFront.current) return;
    focusFront.current = false;
    buttons.current[active]?.focus();
  }, [active]);

  // Mouse wheel and trackpad, on whichever axis they scroll.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let quiet: number | null = null;
    const onWheel = (e: WheelEvent) => {
      const raw = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (!raw) return;
      e.preventDefault();
      const delta = e.deltaMode === 1 ? raw * 40 : e.deltaMode === 2 ? raw * 400 : raw;
      if (quiet !== null) window.clearTimeout(quiet);
      if (e.deltaMode !== 0 || (Math.abs(raw) >= WHEEL_NOTCH && Number.isInteger(raw))) {
        // A mouse wheel notch: one card.
        quiet = null;
        turn(delta > 0 ? 1 : -1);
        return;
      }
      // A trackpad: follow the fingers, then snap.
      stop();
      pos.current += delta / WHEEL_TRACKPAD_PX;
      draw();
      quiet = window.setTimeout(() => {
        quiet = null;
        settle(Math.round(pos.current));
      }, WHEEL_QUIET_MS);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
      if (quiet !== null) window.clearTimeout(quiet);
    };
  }, [draw, settle, stop, turn]);

  function pxPerCard() {
    const w = slots.current[0]?.offsetWidth || 118;
    return Math.max(60, w * 0.8);
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    dragged.current = false;
    tapped.current = false;
    // Catch a spinning ring where it is, like a real one.
    const sp = spring.current;
    const caught = sp !== null && (Math.abs(sp.s.v) > 0.6 || Math.abs(sp.s.x - sp.target) > 0.15);
    stop();
    if (caught) dragged.current = true;
    gesture.current = { id: e.pointerId, x: e.clientX, y: e.clientY, startPos: pos.current, mode: 'pending', samples: [{ t: now(), pos: pos.current }] };
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId || g.mode === 'scroll') return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (g.mode === 'pending') {
      if (Math.hypot(dx, dy) < DRAG_SLOP) return;
      if (Math.abs(dy) > Math.abs(dx)) {
        g.mode = 'scroll';
        return;
      }
      g.mode = 'drag';
      dragged.current = true;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* the pointer may already be gone */
      }
    }
    pos.current = dragToPos(g.startPos, dx, pxPerCard());
    const t = now();
    g.samples.push({ t, pos: pos.current });
    while (g.samples.length > 2 && t - g.samples[0]!.t > 100) g.samples.shift();
    draw();
  }

  function release(e: PointerEvent<HTMLDivElement>, cancelled: boolean) {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    gesture.current = null;
    if (g.mode !== 'drag') {
      // A ring caught mid-spin and let go: rest on the nearest card.
      if (dragged.current || cancelled) {
        settle(Math.round(pos.current));
        return;
      }
      // A tap: act on the card under the finger, without waiting for (or trusting) the click.
      const i = cardAt(e.clientX, e.clientY, e.target);
      if (i !== null) {
        tapped.current = true;
        select(i);
      }
      return;
    }
    const first = g.samples[0]!;
    const last = g.samples[g.samples.length - 1]!;
    const span = (now() - first.t) / 1000;
    const velocity = cancelled || span <= 0 || now() - last.t > 80 ? 0 : (last.pos - first.pos) / span;
    settle(flingTarget(pos.current, velocity, g.startPos), velocity);
  }

  /** The card actually under a point: the browser's touch targeting can pick a neighbour on a thin sliver. */
  function cardAt(x: number, y: number, fallback: EventTarget | null): number | null {
    const hit = typeof document.elementFromPoint === 'function' ? document.elementFromPoint(x, y) : null;
    for (const el of [hit, fallback instanceof Element ? fallback : null]) {
      const card = el?.closest<HTMLElement>('.fan-card');
      const i = card ? slots.current.indexOf(card as HTMLDivElement) : -1;
      if (i >= 0) return i;
    }
    return null;
  }

  function onClick(i: number) {
    // Pointer taps are handled on release; this is the keyboard (Enter or Space).
    if (dragged.current || tapped.current) {
      dragged.current = false;
      tapped.current = false;
      return;
    }
    select(i);
  }

  function select(i: number) {
    if (i === frontOf(spring.current ? spring.current.target : pos.current)) {
      dispatch({ type: 'flip', index: i, reduced });
      return;
    }
    settle(shortestTarget(spring.current ? spring.current.target : pos.current, i));
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    focusFront.current = true;
    turn(step);
  }

  const front = HAND[active]!;

  return (
    <div
      ref={root}
      className="fan"
      role="toolbar"
      aria-label="The seven trap cards. Swipe, scroll or use the arrow keys to turn the fan. Press the front card to flip it."
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => release(e, false)}
      onPointerCancel={(e) => release(e, true)}
      // A card's seal image must never start a native image drag (it cancels the turn).
      onDragStart={(e) => e.preventDefault()}
    >
      {HAND.map((trap, i) => {
        const hero = i === FAN_HERO_INDEX;
        const faceUp = fanCardIsUp(fan, i, reduced);
        const atFront = i === active;
        return (
          <div
            key={trap.id}
            ref={(el) => {
              slots.current[i] = el;
            }}
            className={`fan-card${faceUp ? ' is-up' : ''}${atFront ? ' is-front' : ''}`}
            data-no={trap.no}
            style={{ '--i': i } as CSSProperties}
          >
            <button
              ref={(el) => {
                buttons.current[i] = el;
              }}
              type="button"
              className={`tcard${faceUp ? ' is-flipped' : ''}`}
              tabIndex={atFront ? 0 : -1}
              aria-label={
                faceUp
                  ? `${trap.name}: ${hero ? 'Tell! It fired.' : trap.trick}`
                  : `${trap.name}, face down${atFront ? '' : '. Press to bring it to the front.'}`
              }
              onClick={() => onClick(i)}
              onKeyDown={onKeyDown}
            >
              <div className="tcard-inner" aria-hidden="true">
                <CardBack trap={trap} label="" />
                {hero ? <CardFront trap={trap} state="fired" evidence={'canary hit \u00B7 word \u2713'} /> : <TrickFace trap={trap} />}
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
