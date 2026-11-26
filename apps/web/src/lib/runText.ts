import type { CardView, RunView } from '@tell/shared';
import { gradeOrNull, scoreOf } from '@tell/shared';
import { clock } from './copy';

const NUMBER_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven'];

/** The card's one line of evidence. Code decided the state; this only words it. */
export function evidenceFor(card: CardView, finished: boolean): { evidence?: string; backLabel: string } {
  const t = card.at ? clock(card.at) : '';
  switch (card.reason) {
    case 'word':
      return { evidence: `${t} \u00B7 word \u2713 strong`, backLabel: '' };
    case 'reply':
      return { evidence: `${t} \u00B7 pasted reply \u00B7 reported`, backLabel: '' };
    case 'no-word':
      return { evidence: 'Visited \u00B7 no word', backLabel: '' };
    case 'wrong-word':
      return { evidence: 'Visited \u00B7 wrong word', backLabel: '' };
    case 'preview-bot':
      return { evidence: 'Link preview bot \u00B7 not scored', backLabel: '' };
    case 'cut-short':
      return { backLabel: 'Cut short \u00B7 not tested' };
    case 'ignored':
      return { evidence: 'Read it \u00B7 ignored the line', backLabel: '' };
    case 'reading':
      return { backLabel: `Read ${clock(card.readAt, false)}` };
    case 'not-reached':
      return { backLabel: finished ? 'Not reached' : 'Waiting' };
  }
}

export function headline(run: RunView): { title: string; sub: string | null } {
  const { fired } = run.tally;
  if (run.status === 'closing') {
    const left = Math.max(0, Math.ceil(((run.finishedAt ?? run.now) - run.now) / 1000));
    return { title: 'Closing\u2026', sub: `Watching the last pages for ${left} more second${left === 1 ? '' : 's'}, so every Held is earned.` };
  }
  if (run.status !== 'open') {
    const score = scoreOf(run.cards);
    const extra = [
      score.reported ? `${score.reported} reply-reported` : '',
      score.suspicious ? `${score.suspicious} inconclusive` : '',
    ].filter(Boolean);
    const aside = extra.length ? ` ${extra.join(', ')}, not scored.` : '';
    const grade = gradeOrNull(score.held, score.tested);
    if (!grade) {
      if (run.events.length === 0) return { title: 'No cards were played.', sub: 'The agent never opened a trap page.' };
      return { title: 'Not enough evidence.', sub: `No trap was both read and fully watched, so there\u2019s no grade.${aside}` };
    }
    return { title: `${grade.label}.`, sub: `${score.held} of ${score.tested} held.${aside}` };
  }
  if (fired > 0) return { title: `${NUMBER_WORDS[fired] ?? fired} ${fired === 1 ? 'tell' : 'tells'} so far.`, sub: null };
  if (run.events.length > 0) return { title: 'No tells yet.', sub: null };
  return { title: 'Cards are dealt.', sub: null };
}


/** How long an open run waits for its first visit before saying so. */
export const NO_VISIT_MS = 60_000;

/** True when a run has been open a minute (by the server's clock) and nothing has opened any link. */
export function noVisitYet(run: RunView): boolean {
  return run.status === 'open' && run.events.length === 0 && run.now - run.createdAt >= NO_VISIT_MS;
}
