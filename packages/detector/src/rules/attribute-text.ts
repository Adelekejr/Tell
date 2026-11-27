import type { ParsedAttribute } from '../html.js';
import { isHiddenOrder } from '../instruction.js';
import type { Finding } from '../types.js';
import { excerpt } from '../util.js';

const WHERE: Record<string, string> = {
  alt: 'image alt text',
  title: 'a title attribute (a tooltip at most)',
  'aria-label': 'an aria-label',
  'aria-description': 'an aria-description',
  placeholder: 'a form placeholder',
  content: 'a meta tag',
};

/** Where an attribute's text sits, in plain words. */
export function attributeWhere(a: ParsedAttribute): string {
  if (a.name.startsWith('data-')) return `a ${a.name} attribute`;
  return WHERE[a.name] ?? `a ${a.name} attribute`;
}

/** Would the attribute rule report this attribute? */
export function flagsAttribute(text: string): boolean {
  return isHiddenOrder(text.trim());
}

/**
 * Trap 1, Invisible Ink, in the page code: orders in alt text, title and
 * aria attributes, meta tags and data-* attributes. People rarely or never
 * see these; an agent reading the page code does. Only text that reads as
 * an order is reported, so ordinary alt text ("Stack of pancakes") is fine.
 */
export function attributeRule(attributes: readonly ParsedAttribute[]): Finding[] {
  const findings: Finding[] = [];
  const seen = new Set<string>();
  for (const a of attributes) {
    const text = a.value.trim();
    if (text.length < 12 || seen.has(text) || !flagsAttribute(text)) continue;
    seen.add(text);
    findings.push({
      rule: 'attribute-text',
      trap: 'invisible-ink',
      severity: 'high',
      strong: true,
      message: `Text in ${attributeWhere(a)} gives orders to an AI. People rarely or never see it; an agent reading the page code does.`,
      evidence: excerpt(text),
    });
    if (findings.length >= 5) break;
  }
  return findings;
}
