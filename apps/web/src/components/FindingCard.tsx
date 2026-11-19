import type { Finding } from '@tell/detector';
import type { AnswerSource } from '@tell/shared';
import { getTrap } from '@tell/shared';
import { findingQuote, findingTitle } from '../check/titles';
import { Badge, InferenceBadge } from './Badge';

/**
 * One finding. The rule decides the tag and the title; Gemini, if it ran,
 * only writes the plain sentence, and its badge says where it ran.
 */
export function FindingCard({
  finding,
  effect,
  explaining,
}: {
  finding: Finding;
  effect?: { text: string; source: AnswerSource } | null;
  explaining?: boolean;
}) {
  const quote = findingQuote(finding);
  return (
    <article className="finding">
      <div className="finding-top">
        <Badge tone={finding.strong ? 'accent' : 'line'}>{finding.strong ? 'Strong \u00B7 Rule' : 'Worth a look \u00B7 Rule'}</Badge>
        <span className="label">{getTrap(finding.trap).name}</span>
      </div>
      <h3 className="h4 finding-title">{findingTitle(finding)}</h3>
      <p className="finding-text">{effect ? effect.text : finding.message}</p>
      {quote ? (
        <p className="finding-quote mono">
          <span className="sr-only">It says: </span>
          {quote}
        </p>
      ) : null}
      <div className="finding-foot">
        {effect ? <InferenceBadge source={effect.source} /> : <InferenceBadge source="rules" />}
        {explaining && !effect ? <span className="small muted">Writing a plain explanation{'\u2026'}</span> : null}
      </div>
    </article>
  );
}
