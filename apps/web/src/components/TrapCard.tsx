import { useEffect, useReducer } from 'react';
import type { ProofLevel, TrapInfo } from '@tell/shared';
import { trapNumber } from '@tell/shared';
import markDark from '../assets/brand/fault-mark-dark.svg';
import { tick } from '../lib/motion';
import { FiredIcon, HeldIcon, SuspiciousIcon } from './icons';
import { canTransitionTrapCard, initialTrapCardState, trapCardReducer } from './trap-card-state';

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
  reported: 'Reported',
  held: 'Held',
  suspicious: 'Suspicious',
};

/** The face-up side of a trap card. */
export function CardFront({ trap, state, evidence }: { trap: TrapInfo; state: Exclude<ProofLevel, 'waiting'>; evidence?: string }) {
  // Only a server-witnessed fire gets the big "Tell!". A pasted-reply report is shown, but never as a witnessed fire.
  const fired = state === 'fired';
  const kind = state === 'reported' ? 'suspicious is-reported' : state;
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

/** The face-down side of a trap card. */
export function CardBack({ trap, label }: { trap: TrapInfo; label?: string }) {
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
  const [card, dispatch] = useReducer(trapCardReducer, state, initialTrapCardState);
  const visibleState = canTransitionTrapCard(card.level, state) ? state : card.level;

  useEffect(() => {
    dispatch({ type: 'receive', level: state });
  }, [state]);

  useEffect(() => {
    if (card.animation && !decorative && card.level === 'fired') tick();
  }, [card.animation, card.level, decorative]);

  const revealed = visibleState !== 'waiting';
  const className = ['tcard', revealed ? 'is-flipped' : '', card.animation].filter(Boolean).join(' ');
  const word = revealed ? STATE_WORD[visibleState] : 'Waiting';
  const label = `${trap.name}: ${word}${evidence ? `. ${evidence}` : ''}`;
  const faces = (
    <div className="tcard-inner" onAnimationEnd={() => dispatch({ type: 'animation-ended' })}>
      <CardBack trap={trap} label={backLabel} />
      {revealed ? <CardFront trap={trap} state={visibleState} evidence={evidence} /> : null}
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
