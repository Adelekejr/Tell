import { generateKeyPairSync } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readServiceAccount } from '../_lib/admin.js';
import { GET } from '../health.js';

afterEach(() => vi.unstubAllEnvs());

describe('GET /api/health', () => {
  it('reports not-configured without leaking anything', async () => {
    vi.stubEnv('FIREBASE_SERVICE_ACCOUNT', '');
    vi.stubEnv('TELL_SIGNING_KEY_V1', '');
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = (await res.json()) as { ok: boolean; checks: Record<string, string> };
    expect(body.ok).toBe(true);
    expect(body.checks).toEqual({ firestore: 'not-configured', signingKey: 'not-configured', appCheck: 'monitor' });
  });

  it('says a signing key works without returning it', async () => {
    const secret = generateKeyPairSync('ed25519').privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');
    vi.stubEnv('TELL_SIGNING_KEY_V1', secret);
    const text = await (await GET()).text();
    expect(text).toContain('"signingKey":"ok (k1)"');
    expect(text).not.toContain(secret);
  });

  it('flags a junk signing key without echoing it', async () => {
    vi.stubEnv('TELL_SIGNING_KEY_V1', 'super-secret-value');
    const text = await (await GET()).text();
    expect(text).toContain('"signingKey":"invalid"');
    expect(text).not.toContain('super-secret-value');
  });
});

describe('readServiceAccount', () => {
  const sa = { project_id: 'p', client_email: 'e@p.iam.gserviceaccount.com', private_key: 'k' };
  it('accepts raw JSON and base64', () => {
    expect(readServiceAccount(JSON.stringify(sa))).toEqual(sa);
    expect(readServiceAccount(Buffer.from(JSON.stringify(sa)).toString('base64'))).toEqual(sa);
  });
  it('rejects junk and partial accounts', () => {
    expect(readServiceAccount(undefined)).toBeNull();
    expect(readServiceAccount('nope')).toBeNull();
    expect(readServiceAccount('{"project_id":"p"}')).toBeNull();
  });
});
