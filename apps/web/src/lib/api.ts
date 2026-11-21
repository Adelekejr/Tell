import type { BoardEntry, BoardRange, PublicKeyInfo, RunView, SignedCard, TrapId } from '@tell/shared';
import { trackWork } from './working';

/** The Vercel API (trap pages, canaries, runs). Empty means not configured. */
export const API_BASE = (import.meta.env.VITE_API_BASE ?? '').trim().replace(/\/+$/, '');

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const PLAIN: Record<string, string> = {
  'not-configured': 'Live tests aren\u2019t switched on yet. The run server still needs its Firebase key.',
  'rate-limited': 'That\u2019s a lot of runs for one hour. Try again a little later.',
  'app-check': 'This browser couldn\u2019t be verified. Reload the page and try again.',
  'not-found': 'That run doesn\u2019t exist or has been cleared away.',
  network: 'Couldn\u2019t reach the run server. Check your connection and retry.',
};

const APP_CHECK_TOKEN_TIMEOUT_MS = 1500;

/** An App Check token when App Check is set up; nothing otherwise. Never blocks for long. */
async function appCheckHeader(): Promise<Record<string, string>> {
  try {
    const { getFirebaseApp, getAppCheckInstance } = await import('../ai/firebase');
    getFirebaseApp();
    const instance = getAppCheckInstance();
    if (!instance) return {};
    const { getToken } = await import('firebase/app-check');
    let timer: ReturnType<typeof setTimeout> | undefined;
    const token = await Promise.race([
      getToken(instance, false).then((result) => result.token),
      new Promise<string>((resolve) => {
        timer = setTimeout(() => resolve(''), APP_CHECK_TOKEN_TIMEOUT_MS);
      }),
    ]).finally(() => {
      if (timer !== undefined) clearTimeout(timer);
    });
    return token ? { 'x-firebase-appcheck': token } : {};
  } catch {
    return {};
  }
}

type CallInit = RequestInit & { appCheck?: boolean; quiet?: boolean };

/** Every API call counts as work for the logo, except quiet background polls. */
function call<T>(path: string, init: CallInit = {}): Promise<T> {
  return init.quiet ? send<T>(path, init) : trackWork(() => send<T>(path, init));
}

async function send<T>(path: string, { quiet: _quiet, ...init }: CallInit): Promise<T> {
  if (!API_BASE) throw new ApiError('not-configured', PLAIN['not-configured'] as string, 503);
  const headers: Record<string, string> = { ...(init.body ? { 'content-type': 'application/json' } : {}) };
  if (init.appCheck) Object.assign(headers, await appCheckHeader());
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...init, headers, cache: 'no-store' });
  } catch (err) {
    if (init.signal?.aborted) throw err;
    throw new ApiError('network', PLAIN.network as string, 0);
  }
  const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
  if (!res.ok) {
    const code = body.error ?? 'server';
    throw new ApiError(code, body.message ?? PLAIN[code] ?? 'Something went wrong on our side. Retry in a moment.', res.status);
  }
  return body as T;
}

export function createRun(): Promise<RunView> {
  return call<RunView>('/api/run', { method: 'POST', appCheck: true });
}

export function getRun(id: string, signal?: AbortSignal): Promise<RunView> {
  // Polled every couple of seconds; the run page shows its own working state.
  return call<RunView>(`/api/run/${encodeURIComponent(id)}`, signal ? { signal, quiet: true } : { quiet: true });
}

export function finishRun(id: string): Promise<RunView> {
  return call<RunView>(`/api/run/${encodeURIComponent(id)}/finish`, { method: 'POST' });
}

export interface ReplyResult {
  matched: TrapId[];
  recorded: TrapId[];
  run: RunView;
}

export function checkReply(id: string, text: string): Promise<ReplyResult> {
  return call<ReplyResult>(`/api/run/${encodeURIComponent(id)}/reply`, {
    method: 'POST',
    body: JSON.stringify({ text }),
    appCheck: true,
  });
}

/** Remembers the latest run so /lab can show it again after a reload. */
const LAST_RUN = 'tell.lastRun';

export interface SavedRun {
  id: string;
  label: string;
  task: string;
  expiresAt: number;
}

export function saveLastRun(run: RunView): void {
  try {
    const saved: SavedRun = { id: run.id, label: run.label, task: run.task, expiresAt: run.expiresAt };
    localStorage.setItem(LAST_RUN, JSON.stringify(saved));
  } catch {
    // private mode: fine, nothing remembered
  }
}

export function loadLastRun(now = Date.now()): SavedRun | null {
  try {
    const raw = localStorage.getItem(LAST_RUN);
    if (!raw) return null;
    const saved = JSON.parse(raw) as SavedRun;
    return saved && typeof saved.id === 'string' && saved.expiresAt > now ? saved : null;
  } catch {
    return null;
  }
}

export function clearLastRun(): void {
  try {
    localStorage.removeItem(LAST_RUN);
  } catch {
    // ignore
  }
}

export interface FetchedPage {
  url: string;
  contentType: string;
  kind: 'html' | 'text';
  body: string;
  bytes: number;
  redirects: number;
  stylesheets: number;
}

/** Asks Tell's server to fetch a public page for the check. The link goes in the body, not the address. */
export function fetchPage(url: string): Promise<FetchedPage> {
  return call<FetchedPage>('/api/fetch', { method: 'POST', body: JSON.stringify({ url }), appCheck: true });
}

/** What the drill sends to be signed: the per-trap outcome only, never the replies. */
export interface DrillTrapReport {
  trapId: TrapId;
  state: 'fired' | 'held' | 'error';
  evidence: string | null;
  source: 'on-device' | 'cloud' | null;
}

export type SignRequest =
  | { kind: 'live'; runId: string; agent?: string; prompt?: string }
  | { kind: 'drill'; traps: DrillTrapReport[]; agent?: string; prompt?: string };

export interface SignResponse {
  card: SignedCard;
  created: boolean;
}

/** Asks the server to sign a card. `prompt` is sent only when the user opted in. */
export function signCard(body: SignRequest): Promise<SignResponse> {
  return call<SignResponse>('/api/sign', { method: 'POST', body: JSON.stringify(body), appCheck: true });
}

export interface CardRecord {
  card: SignedCard;
  prompt: string | null;
  listed: boolean;
}

export function getCard(id: string, signal?: AbortSignal): Promise<CardRecord> {
  return call<CardRecord>(`/api/card/${encodeURIComponent(id)}`, signal ? { signal } : {});
}

export interface BoardPage {
  entries: BoardEntry[];
  range: BoardRange;
  pokerFaceOnly: boolean;
  now: number;
}

export function getBoard(range: BoardRange, pokerFaceOnly: boolean, signal?: AbortSignal): Promise<BoardPage> {
  return call<BoardPage>(`/api/board?range=${range}${pokerFaceOnly ? '&poker=1' : ''}`, signal ? { signal } : {});
}

export function addToBoard(cardId: string, name: string): Promise<{ entry: BoardEntry; added: boolean }> {
  return call('/api/board', { method: 'POST', body: JSON.stringify({ cardId, name }), appCheck: true });
}

export function getPublishedKeys(): Promise<{ keys: PublicKeyInfo[] }> {
  return call('/keys.json');
}

/** Where a card's public page lives. Uses this site's own origin. */
export function cardPath(id: string): string {
  return `/card/${id}`;
}

export function verifyPath(id: string): string {
  return `/v/${id}`;
}
