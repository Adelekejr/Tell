import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, PointerEvent } from 'react';
import { getTrap, trapNumber } from '@tell/shared';
import type { TrapId, TrapInfo } from '@tell/shared';
import { rubber, useReducedMotion } from '../lib/motion';
import { CardBack, CardFront } from './TrapCard';

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

const HERO = FAN.findIndex((c) => c.hero);
const DEAL_STAGGER = 60;
const DEAL_MS = 400;
/** Pointer travel (px) before a press counts as a drag instead of a tap. */
const DRAG_SLOP = 6;
/** How far a card can be pulled before it resists completely. */
const MAX_X = 36;
const MAX_Y = 24;

interface Drag {
  id: number;
  x: number;
  y: number;
  moved: boolean;
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
  const [up, setUp] = useState<ReadonlySet<number>>(() => new Set());
  const [heroDealt, setHeroDealt] = useState(false);
  const [top, setTop] = useState<number | null>(null);
  const [focus, setFocus] = useState(HERO);
  const [dragging, setDragging] = useState<number | null>(null);
  const cards = useRef<(HTMLButtonElement | null)[]>([]);
  const drag = useRef<Drag | null>(null);

  // After the deal, the hero turns over on its own, unless the visitor got there first.
  useEffect(() => {
    if (reduced) return;
    const t = window.setTimeout(() => setHeroDealt(true), FAN.length * DEAL_STAGGER + DEAL_MS + 140);
    return () => window.clearTimeout(t);
  }, [reduced]);
  const [touched, setTouched] = useState(false);
  const heroUp = touched ? up.has(HERO) : reduced || heroDealt;
  const isUp = (i: number) => (i === HERO ? heroUp : up.has(i));

  function flip(i: number) {
    const next = new Set(up);
    if (!touched) {
      setTouched(true);
      if (reduced || heroDealt) next.add(HERO);
    }
    if (next.has(i)) next.delete(i);
    else next.add(i);
    setUp(next);
    setTop(i);
  }

  function place(el: HTMLElement, dx: number, dy: number) {
    el.style.setProperty('--dx', `${dx}px`);
    el.style.setProperty('--dy', `${dy}px`);
    el.style.setProperty('--dr', `${dx * 0.1}deg`);
  }

  function release(i: number, el: HTMLElement) {
    drag.current = null;
    place(el, 0, 0);
    setDragging((d) => (d === i ? null : d));
  }

  function onPointerDown(i: number, e: PointerEvent<HTMLButtonElement>) {
    if (e.button !== 0 || reduced) return;
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(i: number, e: PointerEvent<HTMLButtonElement>) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_SLOP) return;
    if (!d.moved) {
      d.moved = true;
      setDragging(i);
      setTop(i);
    }
    const slot = e.currentTarget.parentElement;
    if (slot) place(slot, rubber(dx, MAX_X), rubber(dy, MAX_Y));
  }

  function onPointerEnd(i: number, e: PointerEvent<HTMLButtonElement>) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const slot = e.currentTarget.parentElement;
    if (slot) release(i, slot);
    // A drag ends in the click that follows pointerup; swallow that one click.
    if (d.moved && e.type === 'pointerup') e.currentTarget.dataset.dragged = '1';
  }

  function onClick(i: number, el: HTMLButtonElement) {
    if (el.dataset.dragged) {
      delete el.dataset.dragged;
      return;
    }
    flip(i);
  }

  function onKeyDown(i: number, e: KeyboardEvent<HTMLButtonElement>) {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    let next = step ? (i + step + FAN.length) % FAN.length : -1;
    if (e.key === 'Home') next = 0;
    if (e.key === 'End') next = FAN.length - 1;
    if (next < 0) return;
    e.preventDefault();
    setFocus(next);
    cards.current[next]?.focus();
  }

  return (
    <div className="fan" role="toolbar" aria-label="The seven trap cards. Press a card to flip it.">
      {FAN.map((c, i) => {
        const trap = getTrap(c.id);
        const faceUp = isUp(i);
        const z = dragging === i ? 30 : top === i ? 20 : faceUp && c.hero ? 12 : c.z;
        return (
          <div
            key={c.id}
            className={`fan-card${dragging === i ? ' is-dragging' : ''}${faceUp ? ' is-up' : ''}`}
            style={{ '--rot': `${c.rot}deg`, '--lift': `${c.lift ?? 0}px`, '--i': i, zIndex: z } as CSSProperties}
          >
            <button
              ref={(el) => {
                cards.current[i] = el;
              }}
              type="button"
              className={`tcard${faceUp ? ' is-flipped' : ''}`}
              tabIndex={focus === i ? 0 : -1}
              aria-label={faceUp ? `${trap.name}: ${c.hero ? 'Tell! It fired.' : trap.trick}` : `${trap.name}, face down`}
              onClick={(e) => onClick(i, e.currentTarget)}
              onKeyDown={(e) => onKeyDown(i, e)}
              onFocus={() => setFocus(i)}
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
