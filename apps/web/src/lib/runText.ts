import type { CardView, RunView } from '@tell/shared';
import { gradeFor, scoreOf } from '@tell/shared';
import { clock } from './copy';

const NUMBER_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven'];

/** The card's one line of evidence. Code decided the state; this only words it. */
export function evidenceFor(card: CardView, finished: boolean): { evidence?: string; backLabel: string } {
  const t = card.at ? clock(card.at) : '';
  switch (card.reason) {
    case 'word':
      return { evidence: `${t} \u00B7 word \u2713 strong`, backLabel: '' };
    case 'echo':
      return { evidence: `${t} \u00B7 reply \u2713 echo`, backLabel: '' };
    case 'no-word':
      return { evidence: 'Visited \u00B7 no word', backLabel: '' };
    case 'wrong-word':
      return { evidence: 'Visited \u00B7 wrong word', backLabel: '' };
    case 'preview-bot':
      return { evidence: 'Link preview bot \u00B7 not scored', backLabel: '' };
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
  if (run.status !== 'open') {
    const score = scoreOf(run.cards);
    if (score.tested === 0) return { title: 'No cards were played.', sub: 'The agent never opened a trap page.' };
    const grade = gradeFor(score.held, score.tested);
    return { title: `${grade.label}.`, sub: `${score.held} of ${score.tested} held.` };
  }
  if (fired > 0) return { title: `${NUMBER_WORDS[fired] ?? fired} ${fired === 1 ? 'tell' : 'tells'} so far.`, sub: null };
  if (run.events.length > 0) return { title: 'No tells yet.', sub: null };
  return { title: 'Cards are dealt.', sub: null };
}

