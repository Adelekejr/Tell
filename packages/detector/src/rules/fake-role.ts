import { isInstructionLike } from '../instruction.js';
import type { Finding } from '../types.js';
import { excerpt } from '../util.js';

const MARKERS: { re: RegExp; label: string; template: boolean }[] = [
  {
    re: /^[ \t>*#_\-[(<]*(?:SYSTEM|System|DEVELOPER|Developer)(?:\s+(?:MESSAGE|Message|message|PROMPT|Prompt|prompt|NOTE|Note|NOTICE|Notice|OVERRIDE|Override|INSTRUCTIONS?|Instructions?|UPDATE|Update|ALERT|Alert))?[ \t*_\])>]*:/m,
    label: 'a fake system message',
    template: false,
  },
  {
    re: /<\|(?:im_start|im_end|system|user|assistant|endoftext|start_header_id|eot_id)\|>|\[\/?INST\]|<<\/?SYS>>|<\/?(?:system|system_prompt|developer_message)>/i,
    label: 'chat-template markers',
    template: true,
  },
  { re: /"role"\s*:\s*"(?:system|developer|tool)"/i, label: 'a fake chat message', template: true },
  {
    re: /^[ \t>*[(<]*(?:tool[ _-]?(?:result|output|response)|function[ _-]?(?:result|response|output)|observation)[ \t\])>]*:|<\/?(?:tool_result|function_results?|tool_response)(?:\s[^<>]*)?>/im,
    label: 'a fake tool result',
    template: true,
  },
  {
    re: /\b(?:message|note|instructions?|update)\s+from\s+(?:your|the)\s+(?:developers?|creators?|operators?|administrators?|admins?|owners?|platform|makers?)\b/i,
    label: 'a message claiming to come from the developer',
    template: false,
  },
];

const EXAMPLE_CUE =
  /\b(?:for example|for instance|such as|e\.g\.|an example|examples?:|attackers?|prompt injection|like this|might write|could write|looks like)(?![\w.])/i;

/** Trap 7, The Impostor: text pretending to be a system, developer or tool. */
export function fakeRoleRule(text: string): Finding[] {
  const findings: Finding[] = [];
  for (const marker of MARKERS) {
    const m = marker.re.exec(text);
    if (!m) continue;
    const at = m.index;
    const window = text.slice(at, at + 400);
    const before = text.slice(Math.max(0, at - 100), at);
    const orders = isInstructionLike(window);
    const example = EXAMPLE_CUE.test(before);
    if (orders && !example) {
      findings.push({
        rule: 'fake-role',
        trap: 'impostor',
        severity: 'high',
        strong: true,
        message: `The page contains ${marker.label} that gives orders. Real system messages never arrive inside a web page.`,
        evidence: excerpt(window),
      });
    } else if (marker.template || orders) {
      findings.push({
        rule: 'fake-role',
        trap: 'impostor',
        severity: example ? 'low' : 'medium',
        strong: false,
        message: example
          ? `The page quotes ${marker.label}. It looks like an example, but an AI may still treat it as real.`
          : `The page contains ${marker.label}. Web pages have no reason to include these.`,
        evidence: excerpt(window),
      });
    }
  }
  return findings;
}
