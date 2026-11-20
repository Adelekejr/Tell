import type { TrapId } from '@tell/shared';
import { TRAPS, getTrap } from '@tell/shared';
import { EVIDENCE_TEXT } from '../drill/judge';
import type { DrillTrapResult } from '../drill/run';
import { scoreDrill } from '../drill/run';
import { InferenceBadge } from './Badge';
import { FiredIcon, HeldIcon } from './icons';

function names(ids: readonly TrapId[]): string {
  const n = ids.map((id) => getTrap(id).name);
  if (n.length <= 1) return n.join('');
  return `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`;
}

/**
 * A drill result as a scorecard sheet: the grade set big in italic, seven
 * rows (fired rows flooded with accent), and a badge on every row saying
 * where the model ran. Always marked browser-reported.
 */
export function DrillSheet({
  results,
  title = 'Prompt drill',
  pending = 0,
  compact,
}: {
  results: readonly DrillTrapResult[];
  title?: string;
  /** Rows still being drilled, shown as waiting. */
  pending?: number;
  compact?: boolean;
}) {
  const score = scoreDrill(results);
  const byId = new Map(results.map((r) => [r.trapId, r]));
  const done = pending === 0;
  const ms = results.filter((r) => r.state !== 'error').map((r) => r.ms);
  const avg = ms.length ? Math.round(ms.reduce((a, b) => a + b, 0) / ms.length) : 0;
  return (
    <article className={`sheet${compact ? ' is-compact' : ''}`} aria-label={`${title} result`}>
      <div className="sheet-top">
        <span className="label">{title}</span>
        <span className="tag tag-outline">Browser-reported</span>
      </div>
      {done && score.complete ? (
        <>
          <p className="sheet-grade">{score.grade?.label}</p>
          <p className="sheet-summary">
            {score.held} of {score.tested} held.
            {score.fallen.length ? (
              <>
                {' '}
                Your agent folded on <b>{names(score.fallen)}</b>.
              </>
            ) : (
              ' Not one tell.'
            )}
          </p>
        </>
      ) : done ? (
        <p className="sheet-summary">
          Incomplete: {score.tested} of {TRAPS.length} answered; {score.unanswered} unanswered.
        </p>
      ) : (
        <p className="sheet-summary muted" aria-live="polite">
          Drilling {Math.min(results.length + 1, 7)}/7{ '\u2026' }
        </p>
      )}
      <ol className="sheet-rows">
        {TRAPS.map((t) => {
          const r = byId.get(t.id);
          const state = r?.state ?? (done ? 'error' : 'waiting');
          return (
            <li key={t.id} className={`sheet-row is-${state}`}>
              <span className="mono sheet-no">{String(t.no).padStart(2, '0')}</span>
              <span className="sheet-name">
                {t.name}
                {r?.state === 'fired' && r.evidence ? <span className="sheet-ev">{EVIDENCE_TEXT[r.evidence]}</span> : null}
                {state === 'error' ? <span className="sheet-ev">Not tested</span> : null}
                {r?.source && !compact ? <InferenceBadge source={r.source} /> : null}
              </span>
              <span className="sheet-state">
                {state === 'fired' ? <FiredIcon /> : state === 'held' ? <HeldIcon /> : null}
                {state === 'fired' ? 'Tell!' : state === 'held' ? 'Held' : state === 'error' ? 'Skipped' : '\u2026'}
              </span>
            </li>
          );
        })}
      </ol>
      <div className="sheet-foot">
        <span className="mono">Simulated with Gemini{avg ? ` \u00B7 ${avg} ms avg` : ''}</span>
        <span className="mono">Not witnessed</span>
      </div>
    </article>
  );
}
