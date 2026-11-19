import type { CardPayload } from '@tell/shared';
import { DEMO_KID, cardSummary } from '@tell/shared';
import { Fragment } from 'react';
import type { Check } from '../card/useVerifiedCard';
import { EVIDENCE_TEXT, RESULT_WORD, cardKicker, gradeLabel, trapName } from '../card/text';
import { Badge } from './Badge';
import { AlertIcon, FiredIcon, HeldIcon, SuspiciousIcon } from './icons';

function Summary({ p }: { p: CardPayload }) {
  const fallen = p.traps.filter((t) => t.result === 'fired').map((t) => trapName(t.trap));
  const head = `${p.score.held} of ${p.score.tested} held.`;
  if (!fallen.length) return <p className="sheet-summary">{cardSummary(p, trapName)}</p>;
  return (
    <p className="sheet-summary">
      {head} Your agent folded on{' '}
      {fallen.map((name, i) => (
        <Fragment key={name}>
          {i > 0 ? (i === fallen.length - 1 ? ' and ' : ', ') : null}
          <b>{name}</b>
        </Fragment>
      ))}
      .
    </p>
  );
}

function SigLine({ check }: { check: Check }) {
  if (check.status === 'checking') return <span className="sheet-sig-state">Checking{'\u2026'}</span>;
  if (check.verdict.status === 'valid') {
    return (
      <span className="sheet-sig-state">
        <HeldIcon />
        Signature valid
      </span>
    );
  }
  return (
    <span className="sheet-sig-state is-bad">
      <AlertIcon />
      Signature not valid
    </span>
  );
}

/** The scorecard sheet from the UI spec: label row, big grade, seven rows, signature footer. */
export function ScoreSheet({ payload: p, kid, check }: { payload: CardPayload; kid: string; check: Check }) {
  return (
    <article className="sheet" aria-label="Scorecard">
      <div className="sheet-head">
        <div className="sheet-top">
          <span className="label">{cardKicker(p)}</span>
          {kid === DEMO_KID ? (
            <span title="Made up to show what a card looks like">
              <Badge tone="accent">Sample</Badge>
            </span>
          ) : p.witnessed ? (
            <span title={'Seen by Tell\u2019s server'}>
              <Badge tone="solid">Witnessed</Badge>
            </span>
          ) : (
            <span title={'Reported by the browser that ran the drill'}>
              <Badge tone="outline">Browser-reported</Badge>
            </span>
          )}
        </div>
        <h1 className="sheet-grade">{gradeLabel(p)}</h1>
        <Summary p={p} />
      </div>
      <ol className="sheet-rows">
        {p.traps.map((t, i) => (
          <li key={t.trap} className={`sheet-row is-${t.result}`} title={EVIDENCE_TEXT[t.evidence]}>
            <span className="sheet-n">{String(i + 1).padStart(2, '0')}</span>
            <span className="sheet-name">{trapName(t.trap)}</span>
            <span className="sheet-word">
              {t.result === 'fired' ? <FiredIcon /> : t.result === 'held' ? <HeldIcon /> : t.result === 'suspicious' ? <SuspiciousIcon /> : null}
              {RESULT_WORD[t.result]}
            </span>
            <span className="sr-only">. {EVIDENCE_TEXT[t.evidence]}.</span>
          </li>
        ))}
      </ol>
      <div className="sheet-sig">
        <span>Ed25519 {'\u00B7'} key {kid}</span>
        <SigLine check={check} />
      </div>
    </article>
  );
}
