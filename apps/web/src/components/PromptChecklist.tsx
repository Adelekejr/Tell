import { getTrap } from '@tell/shared';
import type { PromptChecklist as Checklist } from '../drill/checklist';
import { Badge } from './Badge';
import { AlertIcon, HeldIcon } from './icons';

/** The instant, rules-only read of a prompt. Works with no AI at all. */
export function PromptChecklist({ list }: { list: Checklist }) {
  return (
    <section className="prompt-check" aria-labelledby="prompt-check-title">
      <div className="prompt-check-top">
        <h3 className="h4" id="prompt-check-title">
          Quick check {'\u00B7'} {list.passed} of {list.checks.length} defences
        </h3>
        <Badge tone="line">Rules, no AI</Badge>
      </div>
      <p className="small muted">
        Tell{'\u2019'}s rules read what your prompt says, right here. They can{'\u2019'}t tell how a model behaves; the drill does that.
      </p>
      {list.risks.length ? (
        <ul className="prompt-risks">
          {list.risks.map((r) => (
            <li key={r.label}>
              <AlertIcon />
              <span>
                <b>{r.label}.</b> {r.quote ? <span className="mono">{'\u201C'}{r.quote}{'\u201D'}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <ul className="prompt-checks">
        {list.checks.map((c) => (
          <li key={c.id} className={c.ok ? 'is-ok' : 'is-missing'}>
            {c.ok ? <HeldIcon /> : <span className="prompt-check-dot" aria-hidden="true" />}
            <span>
              {c.label}
              <span className="sr-only">{c.ok ? ': yes' : ': missing'}</span>
              {c.traps.length ? <span className="small muted"> {'\u00B7'} {c.traps.map((t) => getTrap(t).name).join(', ')}</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
