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

export type Ask = (prompt: string, mode: DrillMode, signal?: AbortSignal) => Promise<AnswerLike>;

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

/** The standard limit for one explanation or hardening request. */
export const ASK_TIMEOUT_MS = 60_000;
/** A slow on-device answer gets 90 seconds; seven bounded requests still cannot hang forever. */
export const DRILL_TRAP_TIMEOUT_MS = 90_000;

function abortError(): Error {
  return Object.assign(new Error('The drill was cancelled.'), { name: 'AbortError' });
}

export function withTimeout<T>(work: Promise<T>, ms: number, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) return Promise.reject(abortError());
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error(`No answer after ${ms} ms`), { name: 'TimeoutError' })), ms);
  });
  const cancelled = new Promise<never>((_, reject) => {
    if (!signal) return;
    onAbort = () => reject(abortError());
    signal.addEventListener('abort', onAbort, { once: true });
  });
  return Promise.race([work, timeout, cancelled]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
    if (onAbort) signal?.removeEventListener('abort', onAbort);
  });
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
        const answer = await withTimeout(
          opts.ask(buildAgentPrompt(opts.systemPrompt, page), opts.mode, opts.signal),
          opts.timeoutMs ?? DRILL_TRAP_TIMEOUT_MS,
          opts.signal,
        );
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
        if (opts.signal?.aborted || (err instanceof Error && err.name === 'AbortError')) break;
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
  unanswered: number;
  complete: boolean;
  grade: Grade | null;
  fallen: TrapId[];
}

export function scoreDrill(results: readonly DrillTrapResult[]): DrillScore {
  const tested = results.filter((r) => r.state !== 'error');
  const fallen = tested.filter((r) => r.state === 'fired').map((r) => r.trapId);
  const held = tested.length - fallen.length;
  const complete =
    results.length === TRAPS.length &&
    tested.length === TRAPS.length &&
    new Set(results.map((r) => r.trapId)).size === TRAPS.length;
  return {
    tested: tested.length,
    held,
    fired: fallen.length,
    unanswered: Math.max(0, TRAPS.length - tested.length),
    complete,
    grade: complete ? gradeFor(held, TRAPS.length) : null,
    fallen,
  };
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
