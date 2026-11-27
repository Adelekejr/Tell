import { backgroundOf, hiddenReason, matches, parseDeclarations, parseStyleSheet } from './css.js';
import type { CssRule, Declarations, Rgba } from './css.js';
import type { HiddenReason } from './types.js';

export interface TextSegment {
  text: string;
  /** Null when people can see the text. */
  hidden: HiddenReason | null;
  /** Elements that hide text get an id so their text can be grouped. */
  hiddenBy: number | null;
}

export interface ParsedLink {
  attr: string;
  tag: string;
  url: string;
}

/** A text-bearing attribute: alt, title, aria-*, placeholder, meta content or data-*. */
export interface ParsedAttribute {
  tag: string;
  name: string;
  value: string;
}

export interface ParsedHtml {
  segments: TextSegment[];
  comments: string[];
  links: ParsedLink[];
  /** Text from alt, title, aria-*, placeholder, meta content and data-* attributes. */
  attributeText: string[];
  /** The same attributes, with where they came from. */
  attributes: ParsedAttribute[];
  /** Text people can see, with block breaks as newlines. */
  visibleText: string;
  /** Everything an AI reading the page could see. */
  allText: string;
}

const VOID = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr',
]);
const BLOCK = new Set([
  'address', 'article', 'aside', 'blockquote', 'br', 'dd', 'div', 'dl', 'dt', 'fieldset', 'figcaption', 'figure',
  'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'li', 'main', 'nav', 'ol', 'p', 'pre',
  'section', 'table', 'td', 'th', 'tr', 'ul', 'title',
]);
const NOT_RENDERED = new Set(['head', 'meta', 'link', 'script', 'iframe', 'object']);
/** Elements whose text is read by an agent but never drawn for people. */
const NEVER_DRAWN = new Set(['noscript', 'template']);
const SVG_TEXT = new Set(['title', 'desc']);
const SR_ONLY_CLASSES = new Set(['sr-only', 'visually-hidden', 'screen-reader-text', 'screenreader-only', 'a11y-hidden']);

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00A0', '#39': "'",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (all, body: string) => {
    if (body[0] === '#') {
      const cp = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (!Number.isFinite(cp) || cp < 0 || cp > 0x10ffff) return all;
      return String.fromCodePoint(cp);
    }
    return ENTITIES[body.toLowerCase()] ?? all;
  });
}

function parseAttributes(src: string): Map<string, string> {
  const attrs = new Map<string, string>();
  const re = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const name = (m[1] ?? '').toLowerCase();
    const value = m[2] ?? m[3] ?? m[4] ?? '';
    if (!attrs.has(name)) attrs.set(name, decodeEntities(value));
  }
  return attrs;
}

interface Frame {
  tag: string;
  hidden: HiddenReason | null;
  hiddenBy: number | null;
  bg: Rgba | null;
  /** A closed <details>: the group id its hidden children share. */
  closedDetails?: number;
}

const URL_ATTRS = new Set(['href', 'src', 'action', 'formaction', 'data', 'poster', 'cite']);
const TEXT_ATTRS = new Set(['alt', 'title', 'aria-label', 'aria-description', 'placeholder']);

/**
 * A small, forgiving HTML reader. It is not a browser: it understands inline
 * styles, simple selectors from <style> blocks, the hidden attribute and
 * comments, which covers how text is usually hidden from people.
 */
export function parseHtml(html: string): ParsedHtml {
  // Style sheets are collected first so rules apply to elements before them.
  const sheet: CssRule[] = [];
  for (const m of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)) {
    sheet.push(...parseStyleSheet(m[1] ?? ''));
  }

  const segments: TextSegment[] = [];
  const comments: string[] = [];
  const links: ParsedLink[] = [];
  const attributeText: string[] = [];
  const attributes: ParsedAttribute[] = [];
  const stack: Frame[] = [{ tag: '#root', hidden: null, hiddenBy: null, bg: null }];
  let nextHideId = 1;

  const top = (): Frame => stack[stack.length - 1] as Frame;
  const pushText = (text: string): void => {
    if (!text) return;
    const f = top();
    if (NOT_RENDERED.has(f.tag) && f.hidden === null) return;
    // Loose text straight inside a closed <details> is collapsed too.
    if (f.hidden === null && f.closedDetails !== undefined && text.trim()) {
      segments.push({ text, hidden: 'collapsed', hiddenBy: f.closedDetails });
      return;
    }
    segments.push({ text, hidden: f.hidden, hiddenBy: f.hiddenBy });
  };

  const re = /<!--([\s\S]*?)(?:-->|$)|<!\[CDATA\[[\s\S]*?\]\]>|<![^>]*>|<\?[^>]*>|<\/\s*([a-zA-Z][\w:-]*)\s*>|<([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m.index > last) pushText(decodeEntities(html.slice(last, m.index)));
    last = re.lastIndex;

    if (m[1] !== undefined) {
      comments.push(m[1]);
      continue;
    }
    if (m[2] !== undefined) {
      const name = m[2].toLowerCase();
      const at = stack.map((f) => f.tag).lastIndexOf(name);
      if (at > 0) stack.length = at;
      if (BLOCK.has(name)) pushText('\n');
      continue;
    }
    if (m[3] === undefined) continue;

    const tag = m[3].toLowerCase();
    const rawAttrs = m[4] ?? '';
    const attrs = parseAttributes(rawAttrs);

    for (const [name, value] of attrs) {
      if (URL_ATTRS.has(name) && value) links.push({ attr: name, tag, url: value.trim() });
      if ((TEXT_ATTRS.has(name) || name.startsWith('data-')) && value.trim()) {
        attributeText.push(value);
        attributes.push({ tag, name, value });
      }
    }
    if (tag === 'meta' && attrs.get('content')) {
      attributeText.push(attrs.get('content') ?? '');
      attributes.push({ tag, name: 'content', value: attrs.get('content') ?? '' });
    }
    if (BLOCK.has(tag)) pushText('\n');

    // Raw-text elements: skip their bodies (style is already parsed).
    if (tag === 'script' || tag === 'style') {
      const end = new RegExp(`</${tag}\\s*>`, 'ig');
      end.lastIndex = re.lastIndex;
      const close = end.exec(html);
      const body = html.slice(re.lastIndex, close ? close.index : html.length);
      const type = (attrs.get('type') ?? '').toLowerCase();
      // Data blocks are text an agent may read; ordinary JavaScript is skipped.
      if (tag === 'script' && /json|text\/plain|text\/markdown/.test(type) && body.trim()) {
        segments.push({ text: body, hidden: 'display-none', hiddenBy: nextHideId++ });
      }
      re.lastIndex = close ? end.lastIndex : html.length;
      last = re.lastIndex;
      continue;
    }

    const parent = top();
    const id = attrs.get('id')?.toLowerCase() ?? null;
    const classes = (attrs.get('class') ?? '').toLowerCase().split(/\s+/).filter(Boolean);
    const decls: Declarations = new Map();
    for (const rule of sheet) {
      if (matches(rule, tag, id, classes)) for (const [k, v] of rule.decls) decls.set(k, v);
    }
    for (const [k, v] of parseDeclarations(attrs.get('style') ?? '')) decls.set(k, v);

    const inSvg = stack.some((f) => f.tag === 'svg');
    const reason: HiddenReason | null = attrs.has('hidden')
      ? 'hidden-attribute'
      : NEVER_DRAWN.has(tag) || (inSvg && SVG_TEXT.has(tag))
        ? 'not-rendered'
        : classes.some((c) => SR_ONLY_CLASSES.has(c))
          ? 'screen-reader-only'
          : hiddenReason(decls, parent.bg);

    const frame: Frame = {
      tag,
      hidden: parent.hidden,
      hiddenBy: parent.hiddenBy,
      bg: backgroundOf(decls) ?? parent.bg,
    };
    if (parent.hidden === null && reason !== null) {
      frame.hidden = reason;
      frame.hiddenBy = nextHideId++;
    } else if (parent.hidden === null && parent.closedDetails !== undefined && tag !== 'summary') {
      // Everything in a closed <details> but its <summary> is collapsed.
      frame.hidden = 'collapsed';
      frame.hiddenBy = parent.closedDetails;
    }
    if (tag === 'details' && !attrs.has('open') && frame.hidden === null) frame.closedDetails = nextHideId++;

    if (tag === 'img') {
      const alt = attrs.get('alt');
      if (alt) pushText(` ${alt} `);
    }
    const selfClosing = /\/\s*$/.test(rawAttrs);
    if (!VOID.has(tag) && !selfClosing) stack.push(frame);
  }
  if (last < html.length) pushText(decodeEntities(html.slice(last)));

  const tidy = (s: string): string =>
    s
      .replace(/[ \t\f\r]+/g, ' ')
      .replace(/ *\n */g, '\n')
      .replace(/\n{2,}/g, '\n')
      .trim();
  const visibleText = tidy(segments.filter((s) => s.hidden === null).map((s) => s.text).join(''));
  const allText = tidy(
    [segments.map((s) => s.text).join(''), ...comments, ...attributeText, ...links.map((l) => l.url)].join('\n'),
  );
  return { segments, comments, links, attributeText, attributes, visibleText, allText };
}

/** Groups hidden segments by the element that hid them. */
export function hiddenBlocks(parsed: ParsedHtml): { text: string; reason: HiddenReason }[] {
  const groups = new Map<number, { text: string; reason: HiddenReason }>();
  for (const s of parsed.segments) {
    if (s.hidden === null || s.hiddenBy === null) continue;
    const g = groups.get(s.hiddenBy);
    if (g) g.text += s.text;
    else groups.set(s.hiddenBy, { text: s.text, reason: s.hidden });
  }
  return [...groups.values()].filter((g) => g.text.trim().length > 0);
}
