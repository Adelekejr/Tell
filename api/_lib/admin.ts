import type { App } from 'firebase-admin/app';

/**
 * Firebase Admin is optional until Hammed adds the service account to
 * Vercel. FIREBASE_SERVICE_ACCOUNT holds the service-account JSON, either as
 * raw JSON or base64. It is never logged or returned.
 */
export interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

export function readServiceAccount(raw: string | undefined): ServiceAccount | null {
  const value = raw?.trim();
  if (!value) return null;
  const text = value.startsWith('{') ? value : Buffer.from(value, 'base64').toString('utf8');
  try {
    const parsed = JSON.parse(text) as Partial<ServiceAccount>;
    if (parsed.project_id && parsed.client_email && parsed.private_key) {
      return { project_id: parsed.project_id, client_email: parsed.client_email, private_key: parsed.private_key };
    }
  } catch {
    // fall through: treated as not configured
  }
  return null;
}

let app: App | null = null;

export async function getAdminApp(account: ServiceAccount): Promise<App> {
  if (app) return app;
  const { cert, getApps, initializeApp } = await import('firebase-admin/app');
  app =
    getApps()[0] ??
    initializeApp({
      credential: cert({
        projectId: account.project_id,
        clientEmail: account.client_email,
        privateKey: account.private_key.replace(/\\n/g, '\n'),
      }),
      projectId: account.project_id,
    });
  return app;
}
