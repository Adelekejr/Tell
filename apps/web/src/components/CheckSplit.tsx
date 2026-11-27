import { useState } from 'react';
import type { CSSProperties } from 'react';
import type { CheckView, Paragraph, Piece } from '../check/analyse';
import { focus } from '../check/analyse';

function Hidden({ piece }: { piece: Piece }) {
  if (!piece.flagged) {
    // Hidden from people but not flagged by a rule (menus, labels): shown quietly.
    return <span className="ai-quiet">{piece.text}</span>;
  }
  return (
    <mark className="ai-hidden" style={{ '--i': (piece.n ?? 1) - 1 } as CSSProperties}>
      <span className="sr-only">Hidden from people: </span>
      {piece.text}
    </mark>
  );
}

export const STEER_NOTE = 'You can see this too, but an AI may take it as an order.';

function Reads({ p, note }: { p: Paragraph; note: boolean }) {
  return (
    <>
      {note ? <p className="split-note">{STEER_NOTE}</p> : null}
      <p>
        {p.map((piece, i) =>
          piece.hidden ? (
            <Hidden key={i} piece={piece} />
          ) : piece.steer ? (
            <mark key={i} className="ai-steer">
              <span className="sr-only">Aimed at an AI: </span>
              {piece.text}
            </mark>
          ) : (
            <span key={i}>{piece.text}</span>
          ),
        )}
      </p>
    </>
  );
}

function Sees({ p }: { p: Paragraph }) {
  const text = p
    .filter((x) => x.hidden === null)
    .map((x) => x.text)
    .join('')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return text ? <p>{text}</p> : null;
}

/**
 * "You see" next to "Your AI reads". Two columns from 360 px; below that a
 * toggle, so the text stays large enough to read.
 */
export function CheckSplit({ view }: { view: CheckView }) {
  const [whole, setWhole] = useState(false);
  const [side, setSide] = useState<'see' | 'reads'>('reads');
  const { paragraphs, trimmed } = whole ? { paragraphs: view.paragraphs, trimmed: false } : focus(view.paragraphs);
  const canTrim = view.paragraphs.length > 14;
  // The note goes once, above the first visible line aimed at an AI.
  const firstSteer = paragraphs.findIndex((p) => p !== 'gap' && p.some((x) => x.steer && x.hidden === null));
  const gap = (i: number) => (
    <p key={`g${i}`} className="split-gap" aria-hidden="true">
      {'\u22EF'}
    </p>
  );
  return (
    <div className="check-split-wrap">
      <div className="seg seg-sm split-seg" role="group" aria-label="Which view">
        <button type="button" className="seg-btn" aria-pressed={side === 'see'} onClick={() => setSide('see')}>
          You see
        </button>
        <button type="button" className="seg-btn" aria-pressed={side === 'reads'} onClick={() => setSide('reads')}>
          Your AI reads
        </button>
      </div>
      <div className="check-split" data-side={side}>
        <section className="split-col split-see" aria-label="What you see">
          <p className="label">You see</p>
          {view.title ? <p className="split-title">{view.title}</p> : null}
          {paragraphs.map((p, i) => (p === 'gap' ? gap(i) : <Sees key={i} p={p} />))}
          {view.paragraphs.every((p) => p.every((x) => x.hidden)) ? <p className="muted">Nothing. The page shows no text.</p> : null}
        </section>
        <section className="split-col split-reads" aria-label="What your AI reads">
          <p className="label">Your AI reads</p>
          {view.title ? <p className="split-title">{view.title}</p> : null}
          {paragraphs.map((p, i) => (p === 'gap' ? gap(i) : <Reads key={i} p={p} note={i === firstSteer} />))}
        </section>
      </div>
      {canTrim ? (
        <button type="button" className="linkish split-more" onClick={() => setWhole(!whole)}>
          {whole ? 'Show only the parts that matter' : trimmed ? `Show the whole page (${view.paragraphs.length} paragraphs)` : null}
        </button>
      ) : null}
    </div>
  );
}
