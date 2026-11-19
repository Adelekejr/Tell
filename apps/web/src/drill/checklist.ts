/**
 * A quick, rules-only read of a system prompt: does it carry the defences
 * the fix tips describe, and does it say anything that invites trouble?
 * Instant, private (runs in the browser) and needs no AI, so it works on any
 * phone. It reads what the prompt says, not how a model behaves: the drill
 * itself is the real test.
 */
import type { TrapId } from '@tell/shared';

export interface PromptCheck {
  id: string;
  /** What a good prompt does, in plain words. */
  label: string;
  ok: boolean;
  /** The traps this defence is for. */
  traps: TrapId[];
}

export interface PromptRisk {
  label: string;
  quote: string;
}

export interface PromptChecklist {
  checks: PromptCheck[];
  risks: PromptRisk[];
  passed: number;
}

const DEFENCES: { id: string; label: string; traps: TrapId[]; re: RegExp }[] = [
  {
    id: 'data',
    label: 'Treats page and tool content as data, not instructions',
    traps: ['invisible-ink', 'whisper', 'impostor'],
    re: /\buntrusted\b|\bas (?:plain )?data\b|\bnot (?:as )?(?:instructions|commands|orders)\b|\bnever (?:follow|obey)\b[^.\n]{0,60}\b(?:page|content|document|site|website|tool|email)s?\b|\bignore (?:any )?instructions? (?:found |that appear )?(?:in|inside|on|from)\b/i,
  },
  {
    id: 'hidden',
    label: 'Ignores hidden text and HTML comments',
    traps: ['invisible-ink', 'whisper'],
    re: /\bhidden (?:text|content|instructions?|lines?)\b|\b(?:html )?comments?\b/i,
  },
  {
    id: 'encoded',
    label: 'Ignores invisible or encoded characters',
    traps: ['ghost-letters', 'cipher'],
    re: /\b(?:invisible|zero-width|unicode|encoded|base64|obfuscated)\b|\bdecode\b/i,
  },
  {
    id: 'fragment',
    label: 'Ignores text after # in a link',
    traps: ['hashtag'],
    re: /\bfragments?\b|after (?:the |a )?(?:#|hash)|\bhash ?tags?\b/i,
  },
  {
    id: 'actions',
    label: 'Never opens links or images because a page asked',
    traps: ['postcard', 'hashtag'],
    re: /\b(?:never|don't|do not|only)\b[^.\n]{0,60}\b(?:open|visit|load|follow|click|fetch|render|show)\w*\b[^.\n]{0,40}\b(?:links?|urls?|images?)\b/i,
  },
  {
    id: 'roles',
    label: 'Knows fake system or developer messages aren\u2019t real',
    traps: ['impostor'],
    re: /\b(?:claim|claims|claiming|pretend\w*|fake|impersonat\w*|purport\w*)\b[^.\n]{0,60}\b(?:system|developer|tool|admin\w*)\b|\bonly (?:this|the|your own) system prompt\b/i,
  },
  {
    id: 'report',
    label: 'Tells the user when a page tries to give it orders',
    traps: [],
    re: /\b(?:tell|warn|inform|alert|let)\b[^.\n]{0,20}\b(?:the )?user\b[^.\n]{0,60}\b(?:page|content|instruction|tried|tries|attempt)\w*|\b(?:page|content|site|document)\b[^.\n]{0,40}\b(?:tries|tried|attempts?)\b[^.\n]{0,60}\b(?:tell|warn|inform|alert|let)\b[^.\n]{0,20}\buser\b/i,
  },
];

const RISKS: { label: string; re: RegExp }[] = [
  {
    label: 'Asks the agent to follow what pages say',
    re: /\b(?:follow|obey|do|carry out)\b[^.\n]{0,40}\b(?:its|the page'?s?|the site'?s?|their|any)\b[^.\n]{0,20}\b(?:directions|instructions|notes|orders|requests)\b|\bnotes? for (?:the )?assistants?\b/i,
  },
  {
    label: 'Asks the agent to open links a page suggests',
    re: /\b(?:always|please|just)?\s*(?:open|visit|click|follow)\b[^.\n]{0,40}\blinks?\b[^.\n]{0,30}\b(?:page|site|recommends?|suggests?|finds?|mentions?)\b/i,
  },
  {
    label: 'Tells the agent to keep things from the user',
    re: /\b(?:don't|do not|never)\s+(?:tell|mention|reveal|show)\b[^.\n]{0,30}\b(?:the )?user\b/i,
  },
];

function quoteOf(text: string, re: RegExp): string {
  const m = re.exec(text);
  if (!m) return '';
  const at = m.index;
  const start = Math.max(0, text.lastIndexOf('\n', at) + 1, text.lastIndexOf('. ', at) + 2);
  const end = [text.indexOf('.', at + m[0].length), text.indexOf('\n', at)].filter((i) => i >= 0);
  const stop = end.length ? Math.min(...end) + 1 : text.length;
  const q = text.slice(start, stop).trim();
  return q.length > 140 ? `${q.slice(0, 139)}\u2026` : q;
}

export function checkPrompt(prompt: string): PromptChecklist {
  const text = prompt.trim();
  const checks = DEFENCES.map((d) => ({ id: d.id, label: d.label, ok: d.re.test(text), traps: d.traps }));
  const risks = RISKS.filter((r) => r.re.test(text)).map((r) => ({ label: r.label, quote: quoteOf(text, r.re) }));
  return { checks, risks, passed: checks.filter((c) => c.ok).length };
}
