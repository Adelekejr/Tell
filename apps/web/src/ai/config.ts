import { CLOUD_MODEL } from '@tell/shared';

/**
 * Firebase settings come only from VITE_FIREBASE_* environment variables.
 * Nothing is hard-coded, so a fresh clone runs in a clear "not configured"
 * mode until a project is connected. See .env.example.
 */
export interface FirebaseSettings {
  apiKey: string;
  authDomain?: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId: string;
}

export type AppCheckProviderKind = 'recaptcha-v3' | 'recaptcha-enterprise';

export interface TellConfig {
  firebase: FirebaseSettings | null;
  /** Names of the required variables that are missing. */
  missing: string[];
  appCheck: { provider: AppCheckProviderKind; siteKey: string | null; debugToken: string | null };
  cloudModel: string;
}

type Env = Partial<Record<keyof ImportMetaEnv, string | undefined>>;

const REQUIRED = ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_APP_ID'] as const;

function clean(v: string | undefined): string | undefined {
  const t = v?.trim();
  return t ? t : undefined;
}

export function readConfig(env: Env, isDev: boolean): TellConfig {
  const missing = REQUIRED.filter((k) => !clean(env[k]));
  const firebase: FirebaseSettings | null =
    missing.length === 0
      ? {
          apiKey: clean(env.VITE_FIREBASE_API_KEY) as string,
          authDomain: clean(env.VITE_FIREBASE_AUTH_DOMAIN),
          projectId: clean(env.VITE_FIREBASE_PROJECT_ID) as string,
          storageBucket: clean(env.VITE_FIREBASE_STORAGE_BUCKET),
          messagingSenderId: clean(env.VITE_FIREBASE_MESSAGING_SENDER_ID),
          appId: clean(env.VITE_FIREBASE_APP_ID) as string,
        }
      : null;
  const provider: AppCheckProviderKind =
    clean(env.VITE_APPCHECK_PROVIDER) === 'recaptcha-enterprise' ? 'recaptcha-enterprise' : 'recaptcha-v3';
  return {
    firebase,
    missing: [...missing],
    appCheck: {
      provider,
      siteKey: clean(env.VITE_RECAPTCHA_SITE_KEY) ?? null,
      // Debug tokens are honoured only in local development builds.
      debugToken: isDev ? (clean(env.VITE_APPCHECK_DEBUG_TOKEN) ?? null) : null,
    },
    cloudModel: clean(env.VITE_CLOUD_MODEL) ?? CLOUD_MODEL,
  };
}

export const config: TellConfig = readConfig(import.meta.env, import.meta.env.DEV);

export const isConfigured = config.firebase !== null;
