/**
 * Runs a prompt drill: seven single-turn calls, one per trap, one at a time
 * (on-device models run one session at a time, and it spares the cloud quota).
 */
import type { AnswerSource, TrapId } from '@tell/shared';
import { TRAPS, gradeFor } from '@tell/shared';
import type { Grade } from '@tell/shared';
import type { AiProblem, DrillMode } from '../ai/modes';
import { classifyAiError } from '../ai/modes';
import type { DrillEvidence } from './judge';
import { judge, parseAgentOutput } from './judge';
import type { DrillSecrets } from './prompt';
import { buildAgentPrompt, drillPage, newDrillSecrets } from './prompt';

export interface AnswerLike {
  text: string;
  source: AnswerSource;
  ms: number;
}

export type Ask = (prompt: string, mode: DrillMode) => Promise<AnswerLike>;

export interface DrillTrapResult {
  trapId: TrapId;
  state: 'fired' | 'held' | 'error';
  evidence: DrillEvidence | null;
  source: AnswerSource | null;
  ms: number;
  /** First 280 characters of the simulated reply, shown on request. */
  excerpt: string;
  leakLength: number;
  problem?: AiProblem;
}

export interface DrillResult {
  mode: DrillMode;
  results: DrillTrapResult[];
  /** The first problem that stopped the drill, if any. */
  problem: AiProblem | null;
  finishedAt: number;
}

/** Problems that would fail every trap the same way: stop early instead of retrying 7 times. */
const FATAL: AiProblem[] = ['not-configured', 'app-check', 'quota', 'device-unavailable', 'timeout'];

/** One answer may take a while on-device, but a stuck request (say, App Check never loading) must not hang the page. */
export const ASK_TIMEOUT_MS = 60_000;

export function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error(`No answer after ${ms} ms`), { name: 'TimeoutError' })), ms);
  });
  return Promise.race([work, late]).finally(() => clearTimeout(timer));
}

export async function runDrill(opts: {
  systemPrompt: string;
  mode: DrillMode;
  ask: Ask;
  base: string;
  secrets?: DrillSecrets;
  onResult?: (r: DrillTrapResult, done: number) => void;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<DrillResult> {
  const secrets = opts.secrets ?? newDrillSecrets();
  const results: DrillTrapResult[] = [];
  let problem: AiProblem | null = null;
  for (const trap of TRAPS) {
    if (opts.signal?.aborted) break;
    let r: DrillTrapResult;
    if (problem) {
      r = { trapId: trap.id, state: 'error', evidence: null, source: null, ms: 0, excerpt: '', leakLength: 0, problem };
    } else {
      try {
        const page = drillPage(trap.id, secrets, opts.base);
        const answer = await withTimeout(opts.ask(buildAgentPrompt(opts.systemPrompt, page), opts.mode), opts.timeoutMs ?? ASK_TIMEOUT_MS);
        const output = parseAgentOutput(answer.text);
        const verdict = judge(output, { runId: secrets.runId, trapId: trap.id, word: secrets.words[trap.id] });
        r = {
          trapId: trap.id,
          state: verdict.fired ? 'fired' : 'held',
          evidence: verdict.evidence,
          source: answer.source,
          ms: answer.ms,
          excerpt: output.reply.slice(0, 280),
          leakLength: verdict.leakLength,
        };
      } catch (err) {
        const kind = classifyAiError(err);
        if (FATAL.includes(kind)) problem = kind;
        r = { trapId: trap.id, state: 'error', evidence: null, source: null, ms: 0, excerpt: '', leakLength: 0, problem: kind };
      }
    }
    results.push(r);
    opts.onResult?.(r, results.length);
  }
  return { mode: opts.mode, results, problem, finishedAt: Date.now() };
}

export interface DrillScore {
  tested: number;
  held: number;
  fired: number;
  grade: Grade | null;
  fallen: TrapId[];
}

export function scoreDrill(results: readonly DrillTrapResult[]): DrillScore {
  const tested = results.filter((r) => r.state !== 'error');
  const fallen = tested.filter((r) => r.state === 'fired').map((r) => r.trapId);
  const held = tested.length - fallen.length;
  return { tested: tested.length, held, fired: fallen.length, grade: tested.length ? gradeFor(held, tested.length) : null, fallen };
}

export interface HardenSuggestion {
  prompt: string;
  changes: string[];
  source: AnswerSource;
}

export function parseHarden(text: string, source: AnswerSource): HardenSuggestion | null {
  try {
    const data = JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')) as { prompt?: unknown; changes?: unknown };
    if (typeof data.prompt !== 'string' || data.prompt.trim().length < 20) return null;
    const changes = Array.isArray(data.changes) ? data.changes.filter((c): c is string => typeof c === 'string').slice(0, 5) : [];
    return { prompt: data.prompt.trim(), changes, source };
  } catch {
    return null;
  }
}
