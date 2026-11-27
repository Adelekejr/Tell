import { isHiddenOrder, mentionsAI } from '../instruction.js';
import type { Finding } from '../types.js';
import { excerpt } from '../util.js';

/** Trap 2, The Whisper: instructions inside HTML comments. */
export function htmlCommentRule(comments: readonly string[]): Finding[] {
  const findings: Finding[] = [];
  for (const raw of comments) {
    const text = raw.trim();
    if (!text || /^\[if\b|^<!\[endif\]|^\[endif\]/i.test(text)) continue;
    if (isHiddenOrder(text)) {
      findings.push({
        rule: 'html-comment',
        trap: 'whisper',
        severity: 'high',
        strong: true,
        message: 'A comment in the page code gives orders to an AI. People never see comments; agents that read the code do.',
        evidence: excerpt(text),
      });
    } else if (mentionsAI(text) && text.length >= 20) {
      findings.push({
        rule: 'html-comment',
        trap: 'whisper',
        severity: 'low',
        strong: false,
        message: 'A comment in the page code talks about AI. It isn\u2019t a clear order, but people can\u2019t see it.',
        evidence: excerpt(text),
      });
    }
  }
  return findings;
}

/** Would the comment rule report this comment? */
export function flagsComment(text: string): boolean {
  return htmlCommentRule([text]).length > 0;
}
