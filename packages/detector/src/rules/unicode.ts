/* Invisible joiners, selectors and modifiers are listed in character classes on
   purpose: each one is matched on its own, never as a sequence. */
/* eslint-disable no-misleading-character-class */
import { isInstructionLike } from '../instruction.js';
import type { Finding } from '../types.js';
import { excerpt, stripInvisible } from '../util.js';

const TAG_RUN = /[\u{E0000}-\u{E007F}]+/gu;
const VS_RUN = /[\u{E0100}-\u{E01EF}\uFE00-\uFE0F]{4,}/gu;
const ZW = /[\u200B\u200C\u200D\u2060-\u2064\uFEFF\u180E]/u;
const BIDI = /[\u202A-\u202E\u2066-\u2069]/gu;
const PICTO = /[\p{Extended_Pictographic}\p{Emoji_Modifier}\uFE0F\u20E3]/u;
/** Scripts that use ZWJ/ZWNJ in normal writing (Arabic, Persian, Indic and others). */
const JOINING_SCRIPT =
  /[\p{Script=Arabic}\p{Script=Syriac}\p{Script=Devanagari}\p{Script=Bengali}\p{Script=Gurmukhi}\p{Script=Gujarati}\p{Script=Oriya}\p{Script=Tamil}\p{Script=Telugu}\p{Script=Kannada}\p{Script=Malayalam}\p{Script=Sinhala}\p{Script=Mongolian}\p{Script=Khmer}\p{Script=Myanmar}]/u;

function decodeTags(run: string): string {
  let out = '';
  for (const ch of run) {
    const cp = (ch.codePointAt(0) ?? 0) - 0xe0000;
    if (cp >= 0x20 && cp < 0x7f) out += String.fromCharCode(cp);
  }
  return out;
}

function decodeVariationSelectors(run: string): string {
  const bytes: number[] = [];
  for (const ch of run) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp >= 0xfe00 && cp <= 0xfe0f) bytes.push(cp - 0xfe00);
    else bytes.push(cp - 0xe0100 + 16);
  }
  return new TextDecoder().decode(Uint8Array.from(bytes));
}

/** Context-aware: a zero-width character inside an emoji or a joining script is normal. */
function isSuspiciousZeroWidth(chars: string[], i: number): boolean {
  const ch = chars[i] ?? '';
  if (!ZW.test(ch)) return false;
  if (ch === '\uFEFF' && i === 0) return false;
  const prev = chars[i - 1] ?? '';
  const next = chars[i + 1] ?? '';
  if (ch === '\u200D' && (PICTO.test(prev) || PICTO.test(next))) return false;
  if ((ch === '\u200C' || ch === '\u200D') && (JOINING_SCRIPT.test(prev) || JOINING_SCRIPT.test(next))) return false;
  return true;
}

function decodeBinaryRun(run: string[]): string | null {
  const distinct = [...new Set(run)];
  if (distinct.length !== 2 || run.length < 16 || run.length % 8 !== 0) return null;
  for (const [zero, one] of [
    [distinct[0], distinct[1]],
    [distinct[1], distinct[0]],
  ]) {
    let text = '';
    for (let i = 0; i < run.length; i += 8) {
      let byte = 0;
      for (let b = 0; b < 8; b++) byte = (byte << 1) | (run[i + b] === one ? 1 : 0);
      text += String.fromCharCode(byte);
    }
    void zero;
    if (/^[\x20-\x7e]+$/.test(text) && /[a-z]{2}/i.test(text)) return text;
  }
  return null;
}

/** Trap 3, Ghost Letters: invisible Unicode that hides or splits text. */
export function unicodeRule(text: string): Finding[] {
  const findings: Finding[] = [];

  for (const m of text.matchAll(TAG_RUN)) {
    const run = m[0];
    const before = text.slice(Math.max(0, (m.index ?? 0) - 2), m.index);
    // Subdivision flags (England, Scotland, Wales) use a black flag + tag letters + cancel tag.
    if (before.includes('\u{1F3F4}') && run.endsWith('\u{E007F}') && [...run].length <= 7) continue;
    const decoded = decodeTags(run);
    findings.push({
      rule: 'unicode-tags',
      trap: 'ghost-letters',
      severity: 'high',
      strong: true,
      message: isInstructionLike(decoded)
        ? 'Invisible Unicode tag letters spell out an order to an AI. People see nothing at all.'
        : 'Invisible Unicode tag letters hide a message. People see nothing at all.',
      evidence: excerpt(run, 60),
      revealed: decoded,
    });
  }

  for (const m of text.matchAll(VS_RUN)) {
    const decoded = decodeVariationSelectors(m[0]);
    findings.push({
      rule: 'variation-selectors',
      trap: 'ghost-letters',
      severity: 'high',
      strong: true,
      message: 'A long run of invisible variation selectors carries hidden data. They have no normal use in a row like this.',
      evidence: excerpt(m[0], 60),
      revealed: decoded,
    });
  }

  const chars = [...text];
  let suspicious = 0;
  let insideWord = 0;
  let run: string[] = [];
  let longest: string[] = [];
  for (let i = 0; i <= chars.length; i++) {
    if (i < chars.length && isSuspiciousZeroWidth(chars, i)) {
      suspicious += 1;
      run.push(chars[i] ?? '');
      if (/\p{L}/u.test(chars[i - 1] ?? '') && /[\p{L}\u200B-\u200D\u2060]/u.test(chars[i + 1] ?? '')) insideWord += 1;
    } else {
      if (run.length > longest.length) longest = run;
      run = [];
    }
  }

  if (suspicious > 0) {
    const binary = decodeBinaryRun(longest);
    const cleaned = stripInvisible(text);
    const splitInstruction = insideWord > 0 && isInstructionLike(cleaned) && !isInstructionLike(text);
    if (binary) {
      findings.push({
        rule: 'zero-width',
        trap: 'ghost-letters',
        severity: 'high',
        strong: true,
        message: 'Zero-width characters encode a hidden message as ones and zeros.',
        evidence: `${longest.length} zero-width characters in a row`,
        revealed: binary,
      });
    } else if (splitInstruction) {
      findings.push({
        rule: 'split-words',
        trap: 'ghost-letters',
        severity: 'high',
        strong: true,
        message: 'Invisible characters split the words of an order to an AI, so simple filters miss it.',
        evidence: excerpt(text),
        revealed: excerpt(cleaned),
      });
    } else if (suspicious >= 3) {
      findings.push({
        rule: 'zero-width',
        trap: 'ghost-letters',
        severity: longest.length >= 8 ? 'medium' : 'low',
        strong: false,
        message: `The text contains ${suspicious} zero-width characters that people can't see.`,
        evidence: excerpt(text),
      });
    }
  }

  const bidi = text.match(BIDI) ?? [];
  if (bidi.length > 0) {
    findings.push({
      rule: 'bidi-controls',
      trap: 'ghost-letters',
      severity: 'medium',
      strong: false,
      message: 'Direction-override characters can make text read differently to people and to an AI.',
      evidence: excerpt(text),
    });
  }
  return findings;
}
