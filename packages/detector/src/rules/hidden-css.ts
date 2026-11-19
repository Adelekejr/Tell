import { hiddenBlocks } from '../html.js';
import type { ParsedHtml } from '../html.js';
import { judgeInstruction } from '../instruction.js';
import type { Finding, HiddenReason } from '../types.js';
import { excerpt } from '../util.js';

const HOW: Record<HiddenReason, string> = {
  'display-none': 'switched off with display: none',
  'visibility-hidden': 'made invisible with visibility: hidden',
  'hidden-attribute': 'hidden with the hidden attribute',
  transparent: 'made fully transparent',
  'zero-size': 'shrunk to zero size',
  'off-screen': 'pushed off the screen',
  'same-colour': 'coloured the same as its background',
  clipped: 'clipped away',
  'screen-reader-only': 'shown only to screen readers',
};

/** Tricks with no everyday reason to hide a long run of text. */
const DECEPTIVE: ReadonlySet<HiddenReason> = new Set(['transparent', 'zero-size', 'off-screen']);

/** Trap 1, Invisible Ink: text people can't see but an AI can read. */
export function hiddenCssRule(parsed: ParsedHtml): Finding[] {
  const findings: Finding[] = [];
  for (const block of hiddenBlocks(parsed)) {
    const text = block.text.trim();
    const verdict = judgeInstruction(text);
    if (verdict.isInstruction) {
      findings.push({
        rule: 'hidden-css',
        trap: 'invisible-ink',
        severity: 'high',
        strong: true,
        message: `Hidden text gives orders to an AI. It is ${HOW[block.reason]}, so people never see it.`,
        evidence: excerpt(text),
        hiddenBy: block.reason,
      });
    } else if (DECEPTIVE.has(block.reason) && text.length >= 40) {
      findings.push({
        rule: 'hidden-css',
        trap: 'invisible-ink',
        severity: 'low',
        strong: false,
        message: `A block of text is ${HOW[block.reason]}. People can't see it, but an AI reading the page can.`,
        evidence: excerpt(text),
        hiddenBy: block.reason,
      });
    }
  }
  return findings;
}
