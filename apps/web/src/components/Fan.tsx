import { useEffect, useReducer, useRef } from 'react';
import type { CSSProperties, KeyboardEvent, PointerEvent } from 'react';
import { getTrap, trapNumber } from '@tell/shared';
import type { TrapId, TrapInfo } from '@tell/shared';
import { rubber, useReducedMotion } from '../lib/motion';
import { CardBack, CardFront } from './TrapCard';
import { fanCardIsUp, fanReducer, initialFanState } from './fan-state';

/** Fan order, left to right. The Whisper sits raised in the middle. */
const FAN: { id: TrapId; rot: number; lift?: number; z: number; hero?: boolean }[] = [
  { id: 'invisible-ink', rot: -24, z: 0 },
  { id: 'ghost-letters', rot: -16, z: 1 },
  { id: 'cipher', rot: -8, z: 2 },
  { id: 'whisper', rot: 0, lift: -22, z: 9, hero: true },
  { id: 'hashtag', rot: 8, z: 4 },
  { id: 'postcard', rot: 16, z: 5 },
  { id: 'impostor', rot: 24, z: 6 },
];

const DEAL_STAGGER = 60;
const DEAL_MS = 400;
/** Pointer travel (px) before a press counts as a drag instead of a tap. */
const DRAG_SLOP = 6;
/** Horizontal travel before a gesture turns the fan by one card. */
const SWIPE_THRESHOLD = 36;
/** How far a card can be pulled before it resists completely. */
const MAX_X = 36;
const MAX_Y = 24;

interface Drag {
  id: number;
  x: number;
  y: number;
  moved: boolean;
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
 * Home hero: the seven trap cards are dealt into a fan, then the raised card
 * flips to "Tell!". Visitors can flip any card (tap, Enter or Space) and pull
 * one a little; it springs back on release. Arrow keys move between cards.
 * With reduced motion the hand is shown at once, flips crossfade and the
 * cards don't follow the pointer.
 */
export function Fan() {
  const reduced = useReducedMotion();
  const [fan, dispatch] = useReducer(fanReducer, undefined, initialFanState);
  const cards = useRef<(HTMLButtonElement | null)[]>([]);
  const drag = useRef<Drag | null>(null);

  // After the deal, the hero turns over on its own, unless the visitor got there first.
  useEffect(() => {
    if (reduced) return;
    const t = window.setTimeout(() => dispatch({ type: 'hero-dealt' }), FAN.length * DEAL_STAGGER + DEAL_MS + 140);
    return () => window.clearTimeout(t);
  }, [reduced]);
  const isUp = (i: number) => fanCardIsUp(fan, i, reduced);

  function place(el: HTMLElement, dx: number, dy: number) {
    el.style.setProperty('--dx', `${dx}px`);
    el.style.setProperty('--dy', `${dy}px`);
    el.style.setProperty('--dr', `${dx * 0.1}deg`);
  }

  function release(i: number, el: HTMLElement) {
    drag.current = null;
    place(el, 0, 0);
    dispatch({ type: 'drag-end', index: i });
  }

  function onPointerDown(i: number, e: PointerEvent<HTMLButtonElement>) {
    if (e.button !== 0) return;
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false, axis: 'pending' };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(i: number, e: PointerEvent<HTMLButtonElement>) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (d.axis === 'pending' && Math.hypot(dx, dy) < DRAG_SLOP) return;
    if (d.axis === 'pending') {
      d.moved = true;
      d.axis = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
      if (d.axis === 'vertical' && !reduced) dispatch({ type: 'drag-start', index: i });
    }
    if (d.axis === 'vertical' && !reduced) {
      const slot = e.currentTarget.parentElement;
      if (slot) place(slot, rubber(dx, MAX_X), rubber(dy, MAX_Y));
    }
  }

  function onPointerEnd(i: number, e: PointerEvent<HTMLButtonElement>) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const slot = e.currentTarget.parentElement;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (d.axis === 'vertical' && !reduced && slot) release(i, slot);
    else {
      drag.current = null;
      if (slot) place(slot, 0, 0);
    }
    if (e.type === 'pointerup' && d.axis === 'horizontal' && Math.abs(dx) >= SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
      dispatch({ type: 'rotate', step: dx < 0 ? 1 : -1 });
    }
    // A drag ends in the click that follows pointerup; swallow that one click.
    if (d.moved && e.type === 'pointerup') e.currentTarget.dataset.dragged = '1';
  }

  function onClick(i: number, el: HTMLButtonElement) {
    if (el.dataset.dragged) {
      delete el.dataset.dragged;
      return;
    }
    dispatch({ type: 'flip', index: i, reduced });
  }

  function onKeyDown(i: number, e: KeyboardEvent<HTMLButtonElement>) {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    const slot = (i - fan.rotation + FAN.length) % FAN.length;
    let nextSlot = step ? (slot + step + FAN.length) % FAN.length : -1;
    if (e.key === 'Home') nextSlot = 0;
    if (e.key === 'End') nextSlot = FAN.length - 1;
    if (nextSlot < 0) return;
    const next = (nextSlot + fan.rotation) % FAN.length;
    e.preventDefault();
    dispatch({ type: 'focus', index: next });
    cards.current[next]?.focus();
  }

  return (
    <div className="fan" role="toolbar" aria-label="The seven trap cards. Press a card to flip it.">
      {FAN.map((shape, slot) => {
        const i = (slot + fan.rotation) % FAN.length;
        const c = FAN[i]!;
        const trap = getTrap(c.id);
        const faceUp = isUp(i);
        const z = fan.dragging === i ? 30 : fan.top === i ? 20 : faceUp && c.hero ? 12 : shape.z;
        return (
          <div
            key={c.id}
            className={`fan-card${fan.dragging === i ? ' is-dragging' : ''}${faceUp ? ' is-up' : ''}`}
            style={{ '--rot': `${shape.rot}deg`, '--lift': `${shape.lift ?? 0}px`, '--i': slot, zIndex: z } as CSSProperties}
          >
            <button
              ref={(el) => {
                cards.current[i] = el;
              }}
              type="button"
              className={`tcard${faceUp ? ' is-flipped' : ''}`}
              tabIndex={fan.focus === i ? 0 : -1}
              aria-label={faceUp ? `${trap.name}: ${c.hero ? 'Tell! It fired.' : trap.trick}` : `${trap.name}, face down`}
              onClick={(e) => onClick(i, e.currentTarget)}
              onKeyDown={(e) => onKeyDown(i, e)}
              onFocus={() => dispatch({ type: 'focus', index: i })}
              onPointerDown={(e) => onPointerDown(i, e)}
              onPointerMove={(e) => onPointerMove(i, e)}
              onPointerUp={(e) => onPointerEnd(i, e)}
              onPointerCancel={(e) => onPointerEnd(i, e)}
              onLostPointerCapture={(e) => onPointerEnd(i, e)}
            >
              <div className="tcard-inner" aria-hidden="true">
                <CardBack trap={trap} label="" />
                {c.hero ? <CardFront trap={trap} state="fired" evidence={'canary hit \u00B7 word \u2713'} /> : <TrickFace trap={trap} />}
              </div>
            </button>
          </div>
        );
      })}
    </div>
  );
}
