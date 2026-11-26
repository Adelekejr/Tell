import { getAdminApp, readServiceAccount } from './admin.js';

export type AppCheckResult = { ok: true; verified: boolean } | { ok: false; reason: string };

export type AppCheckMode = 'enforce' | 'monitor';

export function appCheckMode(env: NodeJS.ProcessEnv = process.env): AppCheckMode {
  return env.TELL_APPCHECK === 'enforce' ? 'enforce' : 'monitor';
}

/**
 * App Check for the endpoints that create, sign or fetch (run, reply, sign,
 * board POST, fetch). TELL_APPCHECK controls it:
 *   enforce  - a valid token is required; a missing or bad one is refused
 *   (unset)  - monitor (what production runs today): a token that is present
 *              must be valid; a missing one is allowed, so per-IP rate limits
 *              are the real protection
 * Without a service account there is nothing to verify with (local dev).
 */
export async function checkAppCheck(req: Request): Promise<AppCheckResult> {
  const mode = appCheckMode();
  const token = req.headers.get('x-firebase-appcheck')?.trim();
  const account = readServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT);
  if (!token) return mode === 'enforce' ? { ok: false, reason: 'missing' } : { ok: true, verified: false };
  if (!account) return mode === 'enforce' ? { ok: false, reason: 'not-configured' } : { ok: true, verified: false };
  try {
    const app = await getAdminApp(account);
    const { getAppCheck } = await import('firebase-admin/app-check');
    await getAppCheck(app).verifyToken(token);
    return { ok: true, verified: true };
  } catch {
    return { ok: false, reason: 'invalid' };
  }
}
