import { parseHtml } from './html.js';
import { base64Rule } from './rules/base64.js';
import { exfiltrationRule, findMarkdownImages } from './rules/exfiltration.js';
import type { ImageRef } from './rules/exfiltration.js';
import { aiOrderRule } from './rules/ai-order.js';
import { fakeRoleRule } from './rules/fake-role.js';
import { fragmentRule } from './rules/fragment.js';
import { hiddenCssRule } from './rules/hidden-css.js';
import { htmlCommentRule } from './rules/html-comment.js';
import { unicodeRule } from './rules/unicode.js';
import { findUrls } from './rules/url.js';
import type { Finding, ScanInput, ScanResult } from './types.js';
import { severityRank } from './util.js';

export type { Finding, HiddenReason, RuleId, ScanInput, ScanResult, Severity } from './types.js';
export { parseHtml, hiddenBlocks, decodeEntities } from './html.js';
export type { ParsedHtml, TextSegment } from './html.js';
export { judgeInstruction, isInstructionLike } from './instruction.js';
export { revealInvisible, stripInvisible } from './util.js';
export { flagsHiddenText } from './rules/hidden-css.js';
export { flagsComment } from './rules/html-comment.js';

/**
 * Runs every rule over a page, a piece of text, or both. Pure and
 * synchronous: no network, no model. The result is the rules floor that a
 * model explanation can add to but never overrule.
 */
export function scan(input: ScanInput | string): ScanResult {
  const { html, text, url } = typeof input === 'string' ? { text: input, html: undefined, url: undefined } : input;
  const findings: Finding[] = [];
  const corpus: string[] = [];
  const visible: string[] = [];
  const urls: string[] = [];
  const images: ImageRef[] = [];

  if (html) {
    const parsed = parseHtml(html);
    findings.push(...hiddenCssRule(parsed));
    findings.push(...htmlCommentRule(parsed.comments));
    corpus.push(parsed.allText);
    visible.push(parsed.visibleText);
    for (const link of parsed.links) {
      if (/^https?:\/\//i.test(link.url)) urls.push(link.url);
      if (link.tag === 'img' && link.attr === 'src') {
        images.push({ url: link.url, context: '' });
      }
    }
  }
  if (text) {
    corpus.push(text);
    visible.push(text);
  }
  if (url) urls.push(url);

  const all = corpus.join('\n');
  urls.push(...findUrls(all));
  images.push(...findMarkdownImages(all));

  findings.push(...unicodeRule(all));
  findings.push(...base64Rule(all));
  findings.push(...fragmentRule([...new Set(urls)]));
  findings.push(...exfiltrationRule(dedupeImages(images)));
  findings.push(...fakeRoleRule(all));
  findings.push(...aiOrderRule(visible.join('\n')));

  const unique = dedupe(findings).sort(
    (a, b) => Number(b.strong) - Number(a.strong) || severityRank(b.severity) - severityRank(a.severity),
  );
  const highest = unique.length ? (unique[0]?.severity ?? null) : null;
  return {
    findings: unique,
    strong: unique.some((f) => f.strong),
    highest: unique.reduce<ScanResult['highest']>(
      (h, f) => (h === null || severityRank(f.severity) > severityRank(h) ? f.severity : h),
      highest,
    ),
  };
}

function dedupe(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  return findings.filter((f) => {
    const key = `${f.rule}|${f.evidence}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeImages(images: ImageRef[]): ImageRef[] {
  const byUrl = new Map<string, ImageRef>();
  for (const img of images) {
    const prev = byUrl.get(img.url);
    if (!prev || img.context.length > prev.context.length) byUrl.set(img.url, img);
  }
  return [...byUrl.values()];
}
