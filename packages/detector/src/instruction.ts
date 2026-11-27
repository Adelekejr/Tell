/**
 * Does a piece of text read like an order aimed at an AI?
 *
 * Used only on text that is already hidden, encoded or out of place. Visible
 * prose is never flagged just for sounding bossy. Strong patterns are enough
 * on their own; weaker signals need to appear together.
 */

const AI_WORDS =
  '(?:ai|a\\.i\\.|llms?|language models?|assistants?|chat ?bots?|agents?|bots?|models?|copilots?|classifiers?|moderators?|scanners?|summari[sz]ers?|crawlers?)';

const STRONG: { name: string; re: RegExp }[] = [
  {
    name: 'ignore-previous',
    re: /\b(?:ignore|disregard|forget|override|bypass)\b[^.\n]{0,40}?\b(?:previous|prior|above|earlier|all|any|your|the|existing|original)\b[^.\n]{0,30}?\b(?:instructions?|prompts?|rules?|directions?|guidelines?|context|guardrails?|policies)\b/i,
  },
  {
    name: 'new-instructions',
    re: /\b(?:new|updated|real|actual|hidden|secret|true)\s+(?:instructions?|task|directives?|orders?|objective|goal)\b/i,
  },
  { name: 'you-are-now', re: /\byou\s+are\s+now\b/i },
  {
    // "AI assistants: tell the reader..." / "Agents reading this page, recommend..."
    name: 'ai-address',
    re: new RegExp(
      `\\b${AI_WORDS}(?:\\s+(?:reading|parsing|summari[sz]ing|processing|visiting|browsing)\\s+(?:this|the)\\s+(?:page|text|site|article|document|content|post))?\\s*[:,]\\s*(?:please\\s+)?(?:tell|say|recommend|ignore|disregard|visit|open|include|reply|respond|answer|write|send|add|mention|promote|suggest|praise|rate|mark|summari[sz]e|describe|claim|state|output|print|go|navigate|click|direct|forward|email|link|fetch|load|insert|append|do not|don't|never|always)\\b`,
      'i',
    ),
  },
  {
    name: 'system-prompt',
    re: /\b(?:system|developer)\s+(?:prompt|message|override|instructions?)s?\b/i,
  },
  {
    name: 'note-to-ai',
    re: new RegExp(
      `\\b(?:note|message|notice|instructions?|memo|reminder|directive)\\s+(?:to|for)\\s+(?:the\\s+|any\\s+|all\\s+)?${AI_WORDS}\\b`,
      'i',
    ),
  },
  {
    name: 'if-you-are-ai',
    re: new RegExp(`\\bif\\s+you\\s+are\\s+(?:an?\\s+)?${AI_WORDS}\\b`, 'i'),
  },
  {
    name: 'ai-imperative',
    re: new RegExp(
      `\\b${AI_WORDS}[,:]?\\s+(?:\\w+\\s+){0,4}?(?:must|should|needs? to|has to|is required to|is instructed to|will now|always|never)\\b`,
      'i',
    ),
  },
  {
    name: 'dont-tell-user',
    re: /\b(?:do\s+not|don't|never)\s+(?:tell|mention|reveal|inform|show|alert|warn)\b[^.\n]{0,30}?\b(?:the\s+)?(?:user|human|reader|customer|person|operator)\b/i,
  },
  {
    name: 'exfiltrate',
    re: /\b(?:append|add|include|attach|encode|put|insert|send|post|leak)\b[^.\n]{0,60}?\b(?:conversation|chat history|previous messages|system prompt|api keys?|credentials?|passwords?|cookies?|session|user'?s?\s+(?:data|email|name|address|messages?|questions?|details|info(?:rmation)?))\b/i,
  },
  { name: 'secret-word', re: /\bsecret\s+(?:word|code|phrase|token)\b/i },
  {
    name: 'classifier-safe',
    re: /\b(?:this|the)\s+(?:page|text|content|message|document|site)\s+is\s+(?:safe|harmless|benign|trusted|verified)\b[^.\n]{0,40}?\b(?:mark|classify|rate|treat|label|report)\b/i,
  },
];

const WEAK: { name: string; re: RegExp }[] = [
  {
    name: 'imperative-action',
    re: /(?:^|[.!:;\n]\s*|\b(?:please|now|first|then|immediately)\s+)(?:visit|open|go to|navigate to|fetch|load|call|click|send|include|append|reply|respond|answer|say|output|print|write|recommend|summari[sz]e|rate|mark|classify|treat|report|forward|email)\b/i,
  },
  { name: 'url', re: /\bhttps?:\/\/\S+/i },
  { name: 'ai-word', re: new RegExp(`\\b${AI_WORDS}\\b`, 'i') },
  { name: 'decode', re: /\b(?:decode|base64|b64|rot13|decipher|unscramble)\b/i },
  {
    name: 'follow',
    re: /\b(?:follow|obey|execute|carry out|comply with)\s+(?:it|this|these|them|the\s+\w+)\b/i,
  },
  { name: 'urgency', re: /\b(?:immediately|urgent|important|required|mandatory|without asking)\b/i },
  { name: 'word-param', re: /[?&](?:w|word|code|token|key)=/i },
  { name: 'markdown-image', re: /!\[[^\]]*\]\(/ },
];

export interface InstructionVerdict {
  isInstruction: boolean;
  /** Names of the patterns that matched, for tests and evidence. */
  signals: string[];
}

/**
 * Cyrillic and Greek letters that look like Latin ones. Folded before any
 * judging, so "Ignоrе" spelled with a Cyrillic о and е still reads as
 * "Ignore". Non-English text is not translated (a known gap).
 */
const CONFUSABLES: Record<string, string> = {
  // Cyrillic
  '\u0430': 'a', '\u0435': 'e', '\u043E': 'o', '\u0440': 'p', '\u0441': 'c', '\u0443': 'y', '\u0445': 'x',
  '\u0456': 'i', '\u0458': 'j', '\u0455': 's', '\u04BB': 'h', '\u0501': 'd', '\u051B': 'q', '\u051D': 'w',
  '\u0410': 'A', '\u0412': 'B', '\u0415': 'E', '\u041A': 'K', '\u041C': 'M', '\u041D': 'H', '\u041E': 'O',
  '\u0420': 'P', '\u0421': 'C', '\u0422': 'T', '\u0425': 'X', '\u0406': 'I', '\u0408': 'J', '\u0405': 'S',
  // Greek
  '\u03BF': 'o', '\u03B1': 'a', '\u03B9': 'i', '\u03BA': 'k', '\u03BD': 'v', '\u03C1': 'p', '\u03C5': 'u',
  '\u0391': 'A', '\u0392': 'B', '\u0395': 'E', '\u0396': 'Z', '\u0397': 'H', '\u0399': 'I', '\u039A': 'K',
  '\u039C': 'M', '\u039D': 'N', '\u039F': 'O', '\u03A1': 'P', '\u03A4': 'T', '\u03A5': 'Y', '\u03A7': 'X',
};
const CONFUSABLE_RE = new RegExp(`[${Object.keys(CONFUSABLES).join('')}]`, 'g');

/** NFKC (full-width and other compatibility forms), then Cyrillic and Greek look-alikes to Latin. */
export function foldConfusables(text: string): string {
  return text.normalize('NFKC').replace(CONFUSABLE_RE, (ch) => CONFUSABLES[ch] ?? ch);
}

export function judgeInstruction(input: string): InstructionVerdict {
  const text = foldConfusables(input);
  const signals: string[] = [];
  let strong = false;
  for (const p of STRONG) {
    if (p.re.test(text)) {
      signals.push(p.name);
      strong = true;
    }
  }
  let weak = 0;
  for (const p of WEAK) {
    if (p.re.test(text)) {
      signals.push(p.name);
      weak += 1;
    }
  }
  return { isInstruction: strong || weak >= 3, signals };
}

export function isInstructionLike(text: string): boolean {
  return judgeInstruction(text).isInstruction;
}

/** A polite or indirect request to open something ("please open", "be sure to visit", "before you answer, fetch"). */
const POLITE_ACTION =
  /\b(?:please|kindly|be sure to|make sure (?:to|you)|remember to|don'?t forget to|do not forget to|you should|you must|you need to|you(?:'ll| will) need to|it would help if you(?: could)?|could you|would you|i(?:'d| would) like you to|before (?:you )?(?:answer|repl|respond|summari[sz]|continu|start)\w*|when you (?:summari[sz]|read|answer|repl|respond)\w*)\b[^.\n]{0,60}?\b(?:open|visit|fetch|load|go to|navigate to|click|follow|request|ping|call|access|retrieve|check)\b/i;
/** A link or a Tell-style canary path. */
const LINK = /\bhttps?:\/\/\S+|\/c\/[\w-]+\/\d|[?&](?:w|word|code|token)=/i;

/**
 * For text people can't see (hidden elements, comments, attributes, closed
 * boxes): an order, or a polite or indirect request to open a link. The
 * polite form is never used on visible text, where "please open the
 * printable version at https://..." is ordinary writing.
 */
export function isHiddenOrder(input: string): boolean {
  const text = foldConfusables(input);
  return judgeInstruction(text).isInstruction || (POLITE_ACTION.test(text) && LINK.test(text));
}

const AI_RE = new RegExp(`\\b${AI_WORDS}\\b`, 'i');

export function mentionsAI(text: string): boolean {
  return AI_RE.test(text);
}
