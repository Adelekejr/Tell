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

export function judgeInstruction(text: string): InstructionVerdict {
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

const AI_RE = new RegExp(`\\b${AI_WORDS}\\b`, 'i');

export function mentionsAI(text: string): boolean {
  return AI_RE.test(text);
}
