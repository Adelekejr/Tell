import { getApp, getApps, initializeApp } from 'firebase/app';
import type { FirebaseApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider, ReCaptchaV3Provider } from 'firebase/app-check';
import type { AppCheck } from 'firebase/app-check';
import { config } from './config';

declare global {
  var FIREBASE_APPCHECK_DEBUG_TOKEN: boolean | string | undefined;
}

let appCheck: AppCheck | null = null;
let appCheckStarted = false;

/**
 * Starts Firebase and App Check once. Returns null when the project isn't
 * configured, so callers can show the "not configured" state instead of
 * crashing. If something else already created the default app (a hot
 * reload, another module), App Check is still started on it exactly once,
 * so AI Logic calls never go out without it.
 */
export function getFirebaseApp(): FirebaseApp | null {
  if (!config.firebase) return null;
  const app = getApps().length ? getApp() : initializeApp(config.firebase);
  if (!appCheckStarted) {
    appCheckStarted = true;
    try {
      startAppCheck(app);
    } catch (err) {
      // initializeAppCheck throws if App Check was already set up on this app
      // with other options; that instance keeps working, so carry on.
      if (import.meta.env.DEV) console.warn('[Tell] App Check was already initialised on this app.', err);
    }
  }
  return app;
}

function startAppCheck(app: FirebaseApp): void {
  const { siteKey, provider, debugToken } = config.appCheck;
  if (debugToken) {
    // Local development only (readConfig drops it in production builds).
    // The token itself stays in .env.local and is never committed.
    globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken === 'true' ? true : debugToken;
  }
  if (!siteKey) {
    if (import.meta.env.DEV) {
      console.warn('[Tell] VITE_RECAPTCHA_SITE_KEY is not set, so App Check is off. AI Logic calls will fail if App Check is enforced.');
    }
    return;
  }
  appCheck = initializeAppCheck(app, {
    provider: provider === 'recaptcha-enterprise' ? new ReCaptchaEnterpriseProvider(siteKey) : new ReCaptchaV3Provider(siteKey),
    isTokenAutoRefreshEnabled: true,
  });
}

export function getAppCheckInstance(): AppCheck | null {
  return appCheck;
}
