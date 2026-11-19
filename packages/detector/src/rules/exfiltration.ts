import { isInstructionLike } from '../instruction.js';
import type { Finding } from '../types.js';
import { excerpt, safeDecodeURIComponent } from '../util.js';
import { queryParams } from './url.js';

const PLACEHOLDER =
  /\{\{[^}]{1,60}\}\}|\{[A-Za-z_][^{}]{0,40}\}|\[[A-Z][A-Z0-9_ ]{2,40}\]|<[A-Za-z_][A-Za-z0-9_ ]{2,40}>|\$\{?[A-Z][A-Z0-9_]{2,}\}?/;
const SENSITIVE_PARAM =
  /^(?:data|msg|message|chat|history|conversation|convo|secret|leak|payload|exfil|content|prompt|context|memory|email|creds?|password|session)$/i;
const SIGNATURE_PARAM = /^(?:x-amz-[\w-]+|signature|sig|policy|key-pair-id|expires|se|sp|sv|sr|st|skoid|sktid|token|auth|hmac|hash|v|_)$/i;

export interface ImageRef {
  url: string;
  /** Text around the image (for markdown) used to spot instructions. */
  context: string;
}

/** Markdown images like ![alt](url) in free text. */
export function findMarkdownImages(text: string): ImageRef[] {
  const out: ImageRef[] = [];
  for (const m of text.matchAll(/!\[[^\]]{0,200}\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) {
    const at = m.index ?? 0;
    out.push({ url: m[1] ?? '', context: text.slice(Math.max(0, at - 300), at + m[0].length + 300) });
  }
  return out;
}

/** Trap 6, The Postcard: an image link built to carry data out. */
export function exfiltrationRule(images: readonly ImageRef[]): Finding[] {
  const findings: Finding[] = [];
  for (const img of images) {
    if (!/^https?:\/\//i.test(img.url)) continue;
    const decodedUrl = safeDecodeURIComponent(img.url);
    const params = queryParams(img.url);
    const afterHost = decodedUrl.replace(/^https?:\/\/[^/?#]+/i, '');
    const hasPlaceholder = PLACEHOLDER.test(afterHost);
    const sensitive = params.find((p) => SENSITIVE_PARAM.test(p.name) && p.value.length >= 12);
    const longValue = params.find((p) => !SIGNATURE_PARAM.test(p.name) && p.value.length >= 64);
    const ordered = isInstructionLike(img.context);

    if (hasPlaceholder || (ordered && (sensitive || longValue))) {
      findings.push({
        rule: 'image-exfiltration',
        trap: 'postcard',
        severity: 'high',
        strong: true,
        message: hasPlaceholder
          ? 'An image link has a fill-in-the-blank slot for data. If an AI fills it in and the image loads, that data leaves for another site.'
          : 'Text asks an AI to show an image whose link carries data out to another site.',
        evidence: excerpt(img.url, 140),
      });
    } else if (sensitive || longValue) {
      findings.push({
        rule: 'image-exfiltration',
        trap: 'postcard',
        severity: 'medium',
        strong: false,
        message: sensitive
          ? `An image link sends a "${sensitive.name}" value to another site when it loads.`
          : 'An image link carries a long piece of data to another site when it loads.',
        evidence: excerpt(img.url, 140),
      });
    }
  }
  return findings;
}
