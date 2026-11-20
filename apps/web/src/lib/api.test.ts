import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const check = vi.hoisted(() => ({
  instance: null as object | null,
  getToken: vi.fn(),
}));
vi.mock('../ai/firebase', () => ({
  getFirebaseApp: vi.fn(),
  getAppCheckInstance: () => check.instance,
}));
vi.mock('firebase/app-check', () => ({ getToken: (...args: unknown[]) => check.getToken(...args) }));

let fetchMock: ReturnType<typeof vi.fn>;

async function api() {
  return import('./api');
}

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('VITE_API_BASE', 'https://api.test');
  check.instance = null;
  check.getToken.mockReset();
  fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('API request verification', () => {
  it('sends the API request when there is no verification instance or token', async () => {
    const { createRun } = await api();
    await expect(createRun()).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.test/api/run');
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ cache: 'no-store', headers: {} });
    expect(check.getToken).not.toHaveBeenCalled();
  });

  it('includes a configured verification token when available', async () => {
    check.instance = {};
    check.getToken.mockResolvedValue({ token: 'available-token' });
    const { createRun } = await api();
    await createRun();
    expect(check.getToken).toHaveBeenCalledWith(check.instance, false);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ headers: { 'x-firebase-appcheck': 'available-token' } });
  });

  it('continues without a token when token retrieval never resolves', async () => {
    vi.useFakeTimers();
    check.instance = {};
    check.getToken.mockReturnValue(new Promise(() => {}));
    const { createRun } = await api();
    const pending = createRun();
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
    await vi.advanceTimersByTimeAsync(1500);
    await expect(pending).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]).not.toMatchObject({ headers: { 'x-firebase-appcheck': expect.any(String) } });
  });

  it('preserves a cancelled GET so polling can ignore it instead of backing off', async () => {
    const controller = new AbortController();
    const abort = new DOMException('The request was aborted.', 'AbortError');
    fetchMock.mockImplementation((_url: string, init: RequestInit) =>
      new Promise((_, reject) => init.signal?.addEventListener('abort', () => reject(abort), { once: true })),
    );
    const { getRun } = await api();
    const pending = getRun('run-id', controller.signal);
    controller.abort();
    await expect(pending).rejects.toBe(abort);
  });
});
