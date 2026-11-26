import { appCheckMode } from './_lib/appcheck.js';
import { getAdminApp, readServiceAccount } from './_lib/admin.js';
import { json } from './_lib/http.js';
import { loadKeyRing } from './_lib/signing.js';

type Check = 'ok' | 'not-configured' | 'error';

/**
 * GET /api/health
 * Says whether the API is up and which server settings are present. With a
 * service account it also proves Firestore is reachable through the Admin
 * SDK. Values are never echoed, only whether they exist.
 */
export async function GET(): Promise<Response> {
  const account = readServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT);
  let firestore: Check = 'not-configured';
  if (account) {
    try {
      const app = await getAdminApp(account);
      const { getFirestore } = await import('firebase-admin/firestore');
      await getFirestore(app).collection('health').doc('ping').get();
      firestore = 'ok';
    } catch {
      firestore = 'error';
    }
  }
  return json({
    ok: true,
    service: 'tell-api',
    time: new Date().toISOString(),
    checks: {
      firestore,
      signingKey: signingCheck(),
      // monitor = a missing App Check token is allowed (rate limits protect the API); enforce = required.
      appCheck: appCheckMode(),
    },
  });
}

/** Never the key itself: only whether one is usable, and its id. */
function signingCheck(): string {
  const ring = loadKeyRing();
  if (ring.active) return `ok (${ring.active.kid})`;
  return ring.invalid.length ? 'invalid' : 'not-configured';
}
