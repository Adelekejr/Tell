import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { getTrap } from '@tell/shared';
import type { TrapId } from '@tell/shared';
import { useReducedMotion } from '../lib/motion';
import { TrapCard } from './TrapCard';

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
const DEAL_MS = 560;

/**
 * Home hero: the seven trap cards are dealt into a fan, then the raised card
 * flips to "Tell!". With reduced motion the finished hand is shown at once.
 */
export function Fan() {
  const reduced = useReducedMotion();
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    if (reduced) return;
    const t = window.setTimeout(() => setFlipped(true), FAN.length * DEAL_STAGGER + DEAL_MS + 140);
    return () => window.clearTimeout(t);
  }, [reduced]);

  const showResult = reduced || flipped;

  return (
    <div className="fan" aria-hidden="true">
      {FAN.map((c, i) => (
        <div
          key={c.id}
          className="fan-card"
          style={
            {
              '--rot': `${c.rot}deg`,
              '--lift': `${c.lift ?? 0}px`,
              '--i': i,
              zIndex: c.z,
            } as CSSProperties
          }
        >
          <TrapCard
            trap={getTrap(c.id)}
            state={c.hero && showResult ? 'fired' : 'waiting'}
            evidence={c.hero ? 'canary hit \u00B7 word \u2713' : undefined}
            backLabel=""
            decorative
          />
        </div>
      ))}
    </div>
  );
}
