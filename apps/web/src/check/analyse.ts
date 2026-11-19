/**
 * Turns a page or a piece of text into the two views of the check page:
 * what a person sees, and what an AI reads. Everything here is code (the
 * shared detector); no model decides what is hidden.
 */
import type { Finding, HiddenReason, ScanResult } from '@tell/detector';
import { flagsComment, flagsHiddenText, parseHtml, scan, stripInvisible } from '@tell/detector';

export type HiddenKind = HiddenReason | 'comment' | 'invisible-letters';

export interface Piece {
  text: string;
  /** Null when people can see it. */
  hidden: HiddenKind | null;
  /** True when a rule flagged this hidden text. Flagged pieces are highlighted and counted. */
  flagged: boolean;
  /** 1-based number of the flagged hidden line, for the reveal order. */
  n?: number;
}

export type Paragraph = Piece[];

export interface CheckView {
  source: 'link' | 'text' | 'example';
  url: string | null;
  title: string | null;
  /** Every paragraph as an AI reads it; visible pieces are what people see. */
  paragraphs: Paragraph[];
  hiddenLines: number;
  findings: Finding[];
  scan: ScanResult;
}

const TAG_RUN = /[\u{E0000}-\u{E007F}]+/gu;
/** Comment markers: private-use characters that never appear in normal pages. */
const C_OPEN = '\uE000';
const C_CLOSE = '\uE001';

function decodeTags(run: string): string {
  let out = '';
  for (const ch of run) {
    const cp = (ch.codePointAt(0) ?? 0) - 0xe0000;
    if (cp >= 0x20 && cp < 0x7f) out += String.fromCharCode(cp);
  }
  return out;
}

/** Splits visible text so invisible "tag letters" become their own hidden piece, decoded. */
function splitInvisible(text: string, hidden: HiddenKind | null, flagged: boolean): Piece[] {
  const out: Piece[] = [];
  let last = 0;
  for (const m of text.matchAll(TAG_RUN)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ text: stripInvisible(text.slice(last, at)), hidden, flagged });
    const decoded = decodeTags(m[0]);
    if (decoded.trim()) out.push({ text: decoded, hidden: 'invisible-letters', flagged: true });
    last = at + m[0].length;
  }
  if (last < text.length) out.push({ text: stripInvisible(text.slice(last)), hidden, flagged });
  return out;
}

const squeeze = (s: string) => s.replace(/[ \t\r\f\v\u00A0]+/g, ' ');

/** Merges neighbours of the same kind, trims, and drops empty paragraphs. */
function tidy(paragraphs: Paragraph[]): Paragraph[] {
  const out: Paragraph[] = [];
  for (const p of paragraphs) {
    const merged: Piece[] = [];
    for (const piece of p) {
      const text = squeeze(piece.text);
      if (!text) continue;
      const prev = merged[merged.length - 1];
      if (prev && prev.hidden === piece.hidden && prev.flagged === piece.flagged) prev.text += text;
      else merged.push({ ...piece, text });
    }
    if (merged.length) {
      (merged[0] as Piece).text = (merged[0] as Piece).text.replace(/^\s+/, '');
      const end = merged[merged.length - 1] as Piece;
      end.text = end.text.replace(/\s+$/, '');
      const kept = merged.filter((x) => x.text);
      if (kept.length) out.push(kept);
    }
  }
  return out;
}

function number(paragraphs: Paragraph[]): number {
  let n = 0;
  for (const p of paragraphs) for (const piece of p) if (piece.hidden && piece.flagged) piece.n = ++n;
  return n;
}

function titleOf(html: string): string | null {
  const t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1];
  const clean = t?.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  return clean ? clean.slice(0, 140) : null;
}

/** Does pasted text look like page code rather than prose? */
export function looksLikeHtml(text: string): boolean {
  const t = text.trim();
  return /^<(!doctype|html|head|body|div|p|section|article|main|span|!--)/i.test(t) || (t.match(/<\/?[a-z][a-z0-9]*[\s>]/gi)?.length ?? 0) >= 4;
}

export function analyseHtml(html: string, opts: { url?: string | null; source?: CheckView['source'] } = {}): CheckView {
  // Mark each comment's position, so it shows where it sits in the page.
  const comments: string[] = [];
  // The title is shown as the heading, so it isn't repeated as a paragraph.
  const marked = html.replace(/<title[^>]*>[\s\S]*?<\/title\s*>/i, '').replace(/<!--([\s\S]*?)-->/g, (_all, body: string) => {
    comments.push(body);
    return `${C_OPEN}${comments.length - 1}${C_CLOSE}`;
  });
  const parsed = parseHtml(marked);
  const placed = new Set<number>();

  // Which hidden groups did the hidden-text rule flag?
  const groups = new Map<number, { text: string; reason: HiddenReason }>();
  for (const s of parsed.segments) {
    if (s.hidden === null || s.hiddenBy === null) continue;
    const g = groups.get(s.hiddenBy);
    if (g) g.text += s.text;
    else groups.set(s.hiddenBy, { text: s.text, reason: s.hidden });
  }
  const flaggedGroups = new Set<number>();
  for (const [id, g] of groups) {
    const text = g.text.replace(new RegExp(`${C_OPEN}\\d+${C_CLOSE}`, 'g'), '');
    if (flagsHiddenText(text, g.reason)) flaggedGroups.add(id);
  }

  const paragraphs: Paragraph[] = [[]];
  const add = (piece: Piece) => (paragraphs[paragraphs.length - 1] as Paragraph).push(piece);
  for (const s of parsed.segments) {
    const flagged = s.hiddenBy !== null && flaggedGroups.has(s.hiddenBy);
    const lines = s.text.split('\n');
    lines.forEach((line, i) => {
      if (i > 0) paragraphs.push([]);
      const parts = line.split(new RegExp(`${C_OPEN}(\\d+)${C_CLOSE}`));
      parts.forEach((part, j) => {
        if (j % 2 === 1) {
          const idx = Number(part);
          placed.add(idx);
          const body = (comments[idx] ?? '').trim();
          if (body && flagsComment(body)) add({ text: ` <!-- ${body} --> `, hidden: 'comment', flagged: true });
          return;
        }
        for (const piece of splitInvisible(part, s.hidden, flagged)) add(piece);
      });
    });
  }
  // Comments in the page head or outside the body still count.
  const loose = comments.map((c, i) => ({ c: c.trim(), i })).filter(({ c, i }) => !placed.has(i) && c && flagsComment(c));
  if (loose.length) paragraphs.push(loose.map(({ c }) => ({ text: `<!-- ${c} --> `, hidden: 'comment' as const, flagged: true })));

  const tidied = tidy(paragraphs);
  const hiddenLines = number(tidied);
  let title = titleOf(html);
  const first = tidied[0]?.map((x) => x.text).join('').trim();
  // Most pages repeat their title as the main heading; show it once.
  if (title && first && (first === title || title.startsWith(first))) title = null;
  const result = scan({ html, ...(opts.url ? { url: opts.url } : {}) });
  return {
    source: opts.source ?? 'link',
    url: opts.url ?? null,
    title,
    paragraphs: tidied,
    hiddenLines,
    findings: result.findings,
    scan: result,
  };
}

export function analyseText(text: string): CheckView {
  if (looksLikeHtml(text)) return analyseHtml(text, { source: 'text' });
  const paragraphs = tidy(text.split(/\n/).map((line) => splitInvisible(line, null, false)));
  const hiddenLines = number(paragraphs);
  const result = scan({ text });
  return { source: 'text', url: null, title: null, paragraphs, hiddenLines, findings: result.findings, scan: result };
}

/** What people see: only the visible pieces. Paragraphs that are all hidden disappear. */
export function seenParagraphs(view: CheckView): Paragraph[] {
  return view.paragraphs.map((p) => p.filter((x) => x.hidden === null)).filter((p) => p.some((x) => x.text.trim()));
}

/**
 * Long pages are trimmed to the parts that matter: paragraphs with flagged
 * hidden text and one paragraph either side. Short pages show in full.
 */
export function focus(paragraphs: Paragraph[], keep = 14): { paragraphs: (Paragraph | 'gap')[]; trimmed: boolean } {
  if (paragraphs.length <= keep) return { paragraphs, trimmed: false };
  const hot = new Set<number>();
  paragraphs.forEach((p, i) => {
    if (p.some((x) => x.flagged && x.hidden)) for (const j of [i - 1, i, i + 1]) if (j >= 0 && j < paragraphs.length) hot.add(j);
  });
  if (!hot.size) for (let i = 0; i < Math.min(keep, 8); i += 1) hot.add(i);
  const out: (Paragraph | 'gap')[] = [];
  let prev = -1;
  for (const i of [...hot].sort((a, b) => a - b)) {
    if (i !== prev + 1) out.push('gap');
    out.push(paragraphs[i] as Paragraph);
    prev = i;
  }
  if (prev < paragraphs.length - 1) out.push('gap');
  return { paragraphs: out, trimmed: true };
}
