/**
 * How a drill may run. Kept free of firebase imports so UI and tests can use it.
 * - prefer: Gemini Nano when ready, otherwise the cloud (needs "Allow cloud")
 * - device: Gemini Nano only (ONLY_ON_DEVICE); pasted text never leaves the device
 * - cloud:  the cloud only (ONLY_IN_CLOUD), used by the Nano vs Cloud compare
 */
export type DrillMode = 'prefer' | 'device' | 'cloud';

export type AiProblem = 'not-configured' | 'app-check' | 'quota' | 'device-unavailable' | 'network' | 'timeout' | 'bad-output' | 'other';

/** Sorts an AI Logic error into something the page can explain plainly. */
export function classifyAiError(err: unknown): AiProblem {
  const e = err as { name?: string; code?: string; message?: string } | null;
  const text = `${e?.name ?? ''} ${e?.code ?? ''} ${e?.message ?? ''}`;
  if (/TimeoutError/.test(e?.name ?? '')) return 'timeout';
  if (/NotConfigured|no-api-key|no-app-id|no-project-id/i.test(text)) return 'not-configured';
  if (/app.?check|attestation|\b401\b|unauthenticated/i.test(text)) return 'app-check';
  if (/\b429\b|quota|resource.?exhausted|rate.?limit/i.test(text)) return 'quota';
  if (/on.?device|LanguageModel|unsupported|not available|unavailable/i.test(text)) return 'device-unavailable';
  if (/fetch-error|network|failed to fetch|offline/i.test(text)) return 'network';
  if (/parse|json/i.test(text)) return 'bad-output';
  return 'other';
}

export const PROBLEM_TEXT: Record<AiProblem, string> = {
  'not-configured': 'AI isn\u2019t connected in this copy of Tell yet, so the drill can\u2019t run.',
  'app-check': 'The cloud refused the request because App Check isn\u2019t set up yet. On-device still works on Chrome desktop.',
  quota: 'Today\u2019s free cloud budget is used up. On-device and the live test still work.',
  'device-unavailable': 'On-device AI isn\u2019t ready on this device. Turn on Allow cloud, or use Chrome desktop for on-device.',
  network: 'Couldn\u2019t reach Gemini. Check your connection and run it again.',
  timeout: 'The model didn\u2019t answer in time, so the drill stopped. Run it again, or change where it runs.',
  'bad-output': 'The model answered in a shape Tell couldn\u2019t read.',
  other: 'The model request failed. Run it again in a moment.',
};
