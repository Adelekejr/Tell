import type { Severity } from './types.js';

const SEVERITY_RANK: Record<Severity, number> = { info: 0, low: 1, medium: 2, high: 3 };

export function severityRank(s: Severity): number {
  return SEVERITY_RANK[s];
}

/** Characters that render as nothing. Shown as <U+XXXX> in evidence. */
const INVISIBLE_RE =
  /[\u00AD\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF\u{E0000}-\u{E007F}\u{E0100}-\u{E01EF}\uFE00-\uFE0F]/gu;

export function revealInvisible(text: string): string {
  return text.replace(INVISIBLE_RE, (ch) => {
    const cp = ch.codePointAt(0) ?? 0;
    return `<U+${cp.toString(16).toUpperCase().padStart(4, '0')}>`;
  });
}

export function stripInvisible(text: string): string {
  return text.replace(INVISIBLE_RE, '');
}

/** Collapse whitespace, reveal invisible characters and cap the length. */
export function excerpt(text: string, max = 160): string {
  const flat = revealInvisible(text.replace(/\s+/g, ' ').trim());
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max - 1)}\u2026`;
}

export function safeDecodeURIComponent(s: string): string {
  try {
    return decodeURIComponent(s.replace(/\+/g, ' '));
  } catch {
    return s.replace(/\+/g, ' ');
  }
}

const B64_STD = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Decodes standard or URL-safe base64. Returns null on malformed input. */
export function decodeBase64(input: string): Uint8Array | null {
  const clean = input.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  if (clean.length % 4 === 1) return null;
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of clean) {
    const v = B64_STD.indexOf(ch);
    if (v < 0) return null;
    buffer = (buffer << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
    }
  }
  return Uint8Array.from(out);
}

const utf8 = new TextDecoder('utf-8', { fatal: false });

export function bytesToText(bytes: Uint8Array): string {
  return utf8.decode(bytes);
}

/** Share of characters that are ordinary readable text. */
export function readableRatio(text: string): number {
  if (text.length === 0) return 0;
  let ok = 0;
  for (const ch of text) {
    if (/[\p{L}\p{N}\p{P}\p{Zs}\n\r\t$+<=>^`|~]/u.test(ch)) ok += 1;
  }
  return ok / [...text].length;
}

/** Looks like human language: readable, has words and spaces. */
export function looksLikeProse(text: string): boolean {
  if (text.length < 12) return false;
  if (readableRatio(text) < 0.92) return false;
  const spaces = (text.match(/\s/g) ?? []).length;
  const words = text.match(/\p{L}{3,}/gu) ?? [];
  return spaces >= 2 && words.length >= 3;
}
