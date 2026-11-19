import { useEffect, useRef, useState } from 'react';
import type { ProofLevel, TrapInfo } from '@tell/shared';
import { trapNumber } from '@tell/shared';
import markDark from '../assets/brand/fault-mark-dark.svg';
import { tick } from '../lib/motion';
import { FiredIcon, HeldIcon, SuspiciousIcon } from './icons';

export interface TrapCardProps {
  trap: TrapInfo;
  state: ProofLevel;
  /** One line of evidence, such as "14:02:11 · word ✓ strong". */
  evidence?: string;
  /** Bottom label on the face-down side. Defaults to "Waiting". */
  backLabel?: string;
  /** Decorative cards (the home fan) are hidden from assistive tech. */
  decorative?: boolean;
  onClick?: () => void;
}

const STATE_WORD: Record<Exclude<ProofLevel, 'waiting'>, string> = {
  fired: 'Fired',
  echo: 'Fired',
  held: 'Held',
  suspicious: 'Suspicious',
};

function Front({ trap, state, evidence }: { trap: TrapInfo; state: Exclude<ProofLevel, 'waiting'>; evidence?: string }) {
  const fired = state === 'fired' || state === 'echo';
  const kind = fired ? 'fired' : state;
  return (
    <div className={`tcard-face tcard-front is-${kind}`}>
      <div className="tcard-corner">
        <span className="tcard-no">{trapNumber(trap.no)}</span>
        <span className="tcard-state">
          {fired ? <FiredIcon /> : state === 'held' ? <HeldIcon /> : <SuspiciousIcon />}
          {STATE_WORD[state]}
        </span>
      </div>
      <div>
        {fired ? <div className="tcard-big">Tell!</div> : null}
        <div className="tcard-name">{trap.name}</div>
        {evidence ? <div className="tcard-ev">{evidence}</div> : null}
      </div>
    </div>
  );
}

function Back({ trap, label }: { trap: TrapInfo; label?: string }) {
  return (
    <div className="tcard-face tcard-back">
      <div className="tcard-corner">
        <span className="tcard-no">{trapNumber(trap.no)}</span>
        <span className="tcard-no tcard-total">/07</span>
      </div>
      <div className="tcard-seal">
        <img src={markDark} alt="" width={48} height={48} />
      </div>
      <div className="tcard-foot">{label}</div>
    </div>
  );
}

/**
 * A trap as a playing card. Face down while waiting; flips over once the trap
 * has a result. The flip plays only when the state changes after mount, so a
 * reloaded run shows results without replaying every flip.
 */
export function TrapCard({ trap, state, evidence, backLabel = 'Waiting', decorative, onClick }: TrapCardProps) {
  const revealed = state !== 'waiting';
  const prev = useRef(state);
  const [flip, setFlip] = useState<'' | 'is-flipping' | 'is-reflipping'>('');

  useEffect(() => {
    const was = prev.current;
    prev.current = state;
    if (was === state) return;
    const firedNow = state === 'fired' || state === 'echo';
    const firedBefore = was === 'fired' || was === 'echo';
    if (was === 'waiting' && state !== 'waiting') setFlip('is-flipping');
    // A held or suspicious card that later fires turns over once more to land on Tell!
    else if (was !== 'waiting' && firedNow && !firedBefore) setFlip('is-reflipping');
    else return;
    if (!decorative && firedNow) tick();
  }, [state, decorative]);

  const className = ['tcard', revealed ? 'is-flipped' : '', flip].filter(Boolean).join(' ');
  const word = revealed ? STATE_WORD[state] : 'Waiting';
  const label = `${trap.name}: ${word}${evidence ? `. ${evidence}` : ''}`;
  const faces = (
    <div className="tcard-inner" onAnimationEnd={() => setFlip('')}>
      <Back trap={trap} label={backLabel} />
      {revealed ? <Front trap={trap} state={state} evidence={evidence} /> : null}
    </div>
  );

  if (decorative) {
    return (
      <div className={className} aria-hidden="true">
        {faces}
      </div>
    );
  }
  if (onClick) {
    return (
      <button type="button" className={className} aria-label={label} onClick={onClick}>
        {faces}
      </button>
    );
  }
  return (
    <div className={className} role="img" aria-label={label}>
      {faces}
    </div>
  );
}
