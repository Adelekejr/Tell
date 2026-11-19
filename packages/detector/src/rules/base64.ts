import { isInstructionLike } from '../instruction.js';
import type { Finding } from '../types.js';
import { bytesToText, decodeBase64, excerpt, looksLikeProse } from '../util.js';

const CANDIDATE = /(?<![A-Za-z0-9+/=_-])(?:[A-Za-z0-9+/]{24,}={0,2}|[A-Za-z0-9_-]{24,}={0,2})(?![A-Za-z0-9+/=_-])/g;
const DECODE_HINT = /\b(?:decode|decoded|base64|b64|encoded|decipher)\b/i;

/** Trap 4, The Cipher: base64 text that decodes to an order. */
export function base64Rule(text: string): Finding[] {
  const findings: Finding[] = [];
  for (const m of text.matchAll(CANDIDATE)) {
    const token = m[0];
    const at = m.index ?? 0;
    const before = text.slice(Math.max(0, at - 120), at);
    if (/data:[\w/+.-]+;base64,$/i.test(before) || /base64,$/i.test(before)) continue;
    if (!/[A-Z]/.test(token) || !/[a-z]/.test(token)) continue;
    const bytes = decodeBase64(token);
    if (!bytes) continue;
    const decoded = bytesToText(bytes);
    if (!looksLikeProse(decoded)) continue;

    const after = text.slice(at + token.length, at + token.length + 120);
    const hinted = DECODE_HINT.test(before) || DECODE_HINT.test(after);
    const orders = isInstructionLike(decoded);
    if (orders || hinted) {
      findings.push({
        rule: 'base64-payload',
        trap: 'cipher',
        severity: 'high',
        strong: orders,
        message: orders
          ? 'Encoded text decodes to an order for an AI. People see only a jumble of letters.'
          : 'The page asks for encoded text to be decoded. It decodes to readable words.',
        evidence: excerpt(token, 80),
        revealed: excerpt(decoded, 240),
      });
    } else {
      findings.push({
        rule: 'base64-payload',
        trap: 'cipher',
        severity: 'low',
        strong: false,
        message: 'A jumble of letters decodes to readable text. It may be harmless.',
        evidence: excerpt(token, 80),
        revealed: excerpt(decoded, 240),
      });
    }
  }
  return findings;
}
