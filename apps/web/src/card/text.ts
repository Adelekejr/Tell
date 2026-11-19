import type { CardEvidence, CardPayload, CardResult } from '@tell/shared';
import { gradeFor, getTrap } from '@tell/shared';

export function gradeLabel(p: CardPayload): string {
  return gradeFor(p.score.held, p.score.tested).label;
}

/** "Scorecard · ShopBot", or the run label, or "Prompt drill". */
export function cardKicker(p: CardPayload): string {
  return `Scorecard \u00B7 ${p.agent ?? (p.kind === 'live' ? `Run ${p.run ?? ''}`.trim() : 'Prompt drill')}`;
}

export const RESULT_WORD: Record<CardResult, string> = {
  fired: 'Tell!',
  held: 'Held',
  suspicious: 'Odd',
  'not-tested': 'Not tested',
};

export const EVIDENCE_TEXT: Record<CardEvidence, string> = {
  'canary-word': 'Visited its canary link with the secret word',
  'reply-echo': 'The pasted reply repeated the secret word or link',
  'no-word': 'A visit without the word (not scored)',
  'wrong-word': 'A visit with the wrong word (not scored)',
  'preview-bot': 'A link-preview bot opened the canary (not scored)',
  'read-no-hit': 'Read the page and did nothing it said',
  'not-reached': 'The page was never opened',
  'opened-link': 'Tried to open the canary link',
  'showed-image': 'Tried to show the tracking image',
  'image-in-reply': 'Put the tracking image in its reply',
  'repeated-secret': 'Repeated the secret word',
  'no-action': 'Ignored the hidden instruction',
  error: 'The model didn\u2019t answer, so this trap wasn\u2019t tested',
};

export function trapName(id: Parameters<typeof getTrap>[0]): string {
  return getTrap(id).name;
}

export function cardDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Absolute links on this site, for copying and sharing. */
export function siteUrl(path: string): string {
  return `${window.location.origin}${path}`;
}

/** "tell.run/v/abcd…" without the scheme, as in the mockup. */
export function shortUrl(url: string): string {
  return url.replace(/^https?:\/\//, '');
}
