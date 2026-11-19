import { isInstructionLike } from '../instruction.js';
import type { Finding } from '../types.js';
import { excerpt, safeDecodeURIComponent } from '../util.js';

/** Trap 5, The Hashtag: an order hidden after the # in a link. */
export function fragmentRule(urls: readonly string[]): Finding[] {
  const findings: Finding[] = [];
  for (const url of urls) {
    const hash = url.indexOf('#');
    if (hash < 0) continue;
    const raw = url.slice(hash + 1);
    if (raw.length <= 3) continue;
    if (/^[\w.:-]+$/.test(raw)) continue; // ordinary anchor: #section-2
    if (/^!?\/[\w\-/.~%]*$/.test(raw)) continue; // app route: #/products/12
    const decoded = safeDecodeURIComponent(raw);
    const words = decoded.split(/\s+/).filter((w) => /\p{L}{2,}/u.test(w)).length;
    if (isInstructionLike(decoded)) {
      findings.push({
        rule: 'url-fragment',
        trap: 'hashtag',
        severity: 'high',
        strong: true,
        message: 'The part of the link after # carries an order for an AI. Websites never receive this part, so only the agent sees it.',
        evidence: excerpt(url, 120),
        revealed: excerpt(decoded, 240),
      });
    } else if (words >= 6 && !raw.startsWith(':~:text=')) {
      findings.push({
        rule: 'url-fragment',
        trap: 'hashtag',
        severity: 'low',
        strong: false,
        message: 'The part of the link after # holds a full sentence. That is unusual for a normal link.',
        evidence: excerpt(url, 120),
        revealed: excerpt(decoded, 240),
      });
    }
  }
  return findings;
}
