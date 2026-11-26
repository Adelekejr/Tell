import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fb = vi.hoisted(() => ({
  apps: [] as object[],
  initializeApp: vi.fn(),
  initializeAppCheck: vi.fn(),
}));

vi.mock('firebase/app', () => ({
  getApps: () => fb.apps,
  getApp: () => fb.apps[0],
  initializeApp: (cfg: object) => {
    fb.initializeApp(cfg);
    const app = { name: '[DEFAULT]', cfg };
    fb.apps.push(app);
    return app;
  },
}));
vi.mock('firebase/app-check', () => ({
  initializeAppCheck: (app: object, opts: object) => {
    fb.initializeAppCheck(app, opts);
    return { app };
  },
  ReCaptchaEnterpriseProvider: class {},
  ReCaptchaV3Provider: class {},
}));
vi.mock('./config', () => ({
  config: { firebase: { projectId: 'p', apiKey: 'k', appId: 'a' }, appCheck: { siteKey: 'site', provider: 'recaptcha-v3', debugToken: null } },
}));

beforeEach(() => {
  vi.resetModules();
  fb.apps.length = 0;
  fb.initializeApp.mockClear();
  fb.initializeAppCheck.mockClear();
});
afterEach(() => vi.clearAllMocks());

describe('getFirebaseApp', () => {
  it('creates the app and starts App Check once', async () => {
    const { getFirebaseApp, getAppCheckInstance } = await import('./firebase');
    const a = getFirebaseApp();
    const b = getFirebaseApp();
    expect(a).toBe(b);
    expect(fb.initializeApp).toHaveBeenCalledTimes(1);
    expect(fb.initializeAppCheck).toHaveBeenCalledTimes(1);
    expect(getAppCheckInstance()).not.toBeNull();
  });

  it('still starts App Check when the default app already exists', async () => {
    fb.apps.push({ name: '[DEFAULT]', existing: true });
    const { getFirebaseApp, getAppCheckInstance } = await import('./firebase');
    const app = getFirebaseApp();
    expect(app).toEqual({ name: '[DEFAULT]', existing: true });
    expect(fb.initializeApp).not.toHaveBeenCalled();
    expect(fb.initializeAppCheck).toHaveBeenCalledTimes(1);
    expect(fb.initializeAppCheck.mock.calls[0]?.[0]).toBe(app);
    expect(getAppCheckInstance()).not.toBeNull();
  });

  it('carries on if App Check was already set up elsewhere', async () => {
    fb.apps.push({ name: '[DEFAULT]' });
    fb.initializeAppCheck.mockImplementationOnce(() => {
      throw new Error('appCheck/already-initialized');
    });
    const { getFirebaseApp } = await import('./firebase');
    expect(() => getFirebaseApp()).not.toThrow();
    expect(() => getFirebaseApp()).not.toThrow();
    expect(fb.initializeAppCheck).toHaveBeenCalledTimes(1);
  });
});
