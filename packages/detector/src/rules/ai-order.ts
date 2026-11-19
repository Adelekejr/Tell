import { judgeInstruction } from '../instruction.js';
import type { Finding } from '../types.js';
import { excerpt, stripInvisible } from '../util.js';

/** Signals that mean the text is talking to an AI, not about one. */
const ORDER_SIGNALS = new Set(['ai-address', 'note-to-ai', 'if-you-are-ai']);

/** Lines that discuss injection (articles, docs, warnings) quote orders as examples. */
const EXAMPLE_CUE =
  /\b(?:for example|for instance|such as|e\.g\.|an example|examples?:|attackers?|prompt injections?|injection attacks?|like this|might write|could write|looks like|watch out)(?![\w.])/i;

const MAX = 3;

/**
 * Visible text that gives an AI orders ("AI assistants: tell the reader...").
 * People can see it, so it isn't hidden, but an AI that reads the page or the
 * pasted text may follow it. Counted with The Impostor: text that tries to
 * take the role of whoever gives the AI its instructions.
 */
export function aiOrderRule(visibleText: string): Finding[] {
  const findings: Finding[] = [];
  for (const raw of stripInvisible(visibleText).split(/\n+/)) {
    const line = raw.trim();
    if (line.length < 12 || EXAMPLE_CUE.test(line)) continue;
    const { signals } = judgeInstruction(line);
    if (!signals.some((s) => ORDER_SIGNALS.has(s))) continue;
    findings.push({
      rule: 'ai-order',
      trap: 'impostor',
      severity: 'medium',
      strong: false,
      message: 'This text gives orders to AI assistants. People can see it, but an AI reading it may follow it.',
      evidence: excerpt(line),
    });
    if (findings.length >= MAX) break;
  }
  return findings;
}
