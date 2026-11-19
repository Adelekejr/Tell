import type { HiddenReason } from './types.js';

export type Declarations = Map<string, string>;

/** Parses "a: b; c: d" into a map with lowercased property names. */
export function parseDeclarations(style: string): Declarations {
  const out: Declarations = new Map();
  for (const part of style.split(';')) {
    const i = part.indexOf(':');
    if (i < 0) continue;
    const prop = part.slice(0, i).trim().toLowerCase();
    const value = part
      .slice(i + 1)
      .replace(/!important/i, '')
      .trim()
      .toLowerCase();
    if (prop) out.set(prop, value);
  }
  return out;
}

export interface CssRule {
  /** Simple selector parts: tag, ids and classes (all lowercase). */
  tag: string | null;
  ids: string[];
  classes: string[];
  decls: Declarations;
}

/**
 * Reads a style sheet and keeps rules whose selectors are simple
 * (tag, .class, #id or a compound of those). Descendant, attribute and
 * pseudo selectors are skipped in v1.
 */
export function parseStyleSheet(css: string): CssRule[] {
  const rules: CssRule[] = [];
  const noComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const re = /([^{}@]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(noComments))) {
    const decls = parseDeclarations(m[2] ?? '');
    for (const raw of (m[1] ?? '').split(',')) {
      const sel = raw.trim().toLowerCase();
      if (!/^[a-z0-9_.#-]+$/.test(sel)) continue;
      const tagMatch = /^[a-z][a-z0-9-]*/.exec(sel);
      const ids = [...sel.matchAll(/#([a-z0-9_-]+)/g)].map((x) => x[1] ?? '');
      const classes = [...sel.matchAll(/\.([a-z0-9_-]+)/g)].map((x) => x[1] ?? '');
      rules.push({ tag: tagMatch ? tagMatch[0] : null, ids, classes, decls });
    }
  }
  return rules;
}

export function matches(rule: CssRule, tag: string, id: string | null, classes: string[]): boolean {
  if (rule.tag && rule.tag !== tag) return false;
  if (rule.ids.some((x) => x !== id)) return false;
  if (rule.classes.some((c) => !classes.includes(c))) return false;
  return Boolean(rule.tag || rule.ids.length || rule.classes.length);
}

// ---------- colours ----------

export type Rgba = [number, number, number, number];

const NAMED: Record<string, Rgba> = {
  white: [255, 255, 255, 1],
  black: [0, 0, 0, 1],
  transparent: [0, 0, 0, 0],
  snow: [255, 250, 250, 1],
  ivory: [255, 255, 240, 1],
  whitesmoke: [245, 245, 245, 1],
  red: [255, 0, 0, 1],
  blue: [0, 0, 255, 1],
  green: [0, 128, 0, 1],
  gray: [128, 128, 128, 1],
  grey: [128, 128, 128, 1],
};

export function parseColour(value: string | undefined): Rgba | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  if (v in NAMED) return NAMED[v] ?? null;
  const hex = /^#([0-9a-f]{3,8})\b/.exec(v);
  if (hex) {
    const h = hex[1] ?? '';
    if (h.length === 3 || h.length === 4) {
      const c = [...h].map((x) => parseInt(x + x, 16));
      return [c[0] ?? 0, c[1] ?? 0, c[2] ?? 0, h.length === 4 ? (c[3] ?? 255) / 255 : 1];
    }
    if (h.length === 6 || h.length === 8) {
      const c = [0, 2, 4, 6].map((i) => parseInt(h.slice(i, i + 2), 16));
      return [c[0] ?? 0, c[1] ?? 0, c[2] ?? 0, h.length === 8 ? (c[3] ?? 255) / 255 : 1];
    }
    return null;
  }
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)/.exec(v);
  if (rgb) {
    let a = 1;
    if (rgb[4] !== undefined) a = rgb[4].endsWith('%') ? parseFloat(rgb[4]) / 100 : parseFloat(rgb[4]);
    return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), a];
  }
  return null;
}

function close(a: Rgba, b: Rgba): boolean {
  return Math.abs(a[0] - b[0]) <= 10 && Math.abs(a[1] - b[1]) <= 10 && Math.abs(a[2] - b[2]) <= 10;
}

/** The background colour from `background` or `background-color`, if solid. */
export function backgroundOf(decls: Declarations): Rgba | null {
  const bg = decls.get('background-color') ?? decls.get('background');
  if (!bg) return null;
  const first = bg.split(/\s+(?![^(]*\))/)[0];
  const c = parseColour(first);
  return c && c[3] > 0.5 ? c : null;
}

function px(value: string | undefined): number | null {
  if (!value) return null;
  const m = /^(-?[\d.]+)(px|em|rem|%|pt|vw|vh)?$/.exec(value.trim());
  if (!m) return null;
  const n = parseFloat(m[1] ?? '');
  const unit = m[2] ?? 'px';
  if (unit === 'em' || unit === 'rem') return n * 16;
  if (unit === 'pt') return n * 1.333;
  if (unit === '%') return n === 0 ? 0 : null;
  return n;
}

/**
 * Works out whether a declaration block hides its text.
 * `inheritedBg` is the nearest known background behind the element.
 */
export function hiddenReason(decls: Declarations, inheritedBg: Rgba | null): HiddenReason | null {
  if (decls.get('display') === 'none') return 'display-none';
  const vis = decls.get('visibility');
  if (vis === 'hidden' || vis === 'collapse') return 'visibility-hidden';

  const clip = decls.get('clip') ?? '';
  const clipPath = decls.get('clip-path') ?? '';
  const w = px(decls.get('width'));
  const h = px(decls.get('height'));
  const tiny = (w !== null && w <= 1) || (h !== null && h <= 1);
  const clipped =
    /rect\(\s*0(px)?[\s,]+0(px)?[\s,]+0(px)?[\s,]+0(px)?\s*\)/.test(clip) ||
    /rect\(\s*1px[\s,]+1px[\s,]+1px[\s,]+1px\s*\)/.test(clip) ||
    /inset\(\s*(50|100)%\s*\)/.test(clipPath);
  if (clipped && tiny) return 'screen-reader-only';
  if (clipped) return 'clipped';

  const opacity = decls.get('opacity');
  if (opacity !== undefined && parseFloat(opacity) < 0.05) return 'transparent';

  const fontSize = px(decls.get('font-size'));
  if (fontSize !== null && fontSize <= 1) return 'zero-size';
  const overflowHidden = /hidden|clip/.test(decls.get('overflow') ?? '');
  if (overflowHidden && ((w !== null && w <= 1) || (h !== null && h <= 1))) return 'zero-size';
  if (overflowHidden && px(decls.get('max-height')) === 0) return 'zero-size';
  if (/scale\(\s*0(\.0\d*)?\s*\)/.test(decls.get('transform') ?? '')) return 'zero-size';

  const position = decls.get('position');
  if (position === 'absolute' || position === 'fixed') {
    for (const side of ['left', 'top', 'right', 'bottom']) {
      const v = px(decls.get(side));
      if (v !== null && v <= -999) return 'off-screen';
    }
  }
  const indent = px(decls.get('text-indent'));
  if (indent !== null && indent <= -999) return 'off-screen';
  if (/translate[xy]?\(\s*-\d{4,}px/.test(decls.get('transform') ?? '')) return 'off-screen';

  const colour = parseColour(decls.get('color'));
  if (colour && colour[3] < 0.05) return 'transparent';
  if (colour) {
    const bg = backgroundOf(decls) ?? inheritedBg ?? [255, 255, 255, 1];
    if (close(colour, bg)) return 'same-colour';
  }
  return null;
}
