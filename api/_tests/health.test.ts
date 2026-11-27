import { generateKeyPairSync } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readServiceAccount } from '../_lib/admin.js';
import { GET } from '../health.js';
import { hashSaltStatus, ipKey, resetSaltWarningForTests, warnIfNoHashSalt } from '../_lib/limits.js';

afterEach(() => vi.unstubAllEnvs());

describe('GET /api/health', () => {
  it('reports not-configured without leaking anything', async () => {
    vi.stubEnv('FIREBASE_SERVICE_ACCOUNT', '');
    vi.stubEnv('TELL_SIGNING_KEY_V1', '');
    vi.stubEnv('TELL_HASH_SALT', '');
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = (await res.json()) as { ok: boolean; checks: Record<string, string> };
    expect(body.ok).toBe(true);
    expect(body.checks).toEqual({ firestore: 'not-configured', signingKey: 'not-configured', appCheck: 'monitor', hashSalt: 'not-configured' });
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

describe('TELL_HASH_SALT', () => {
  afterEach(() => {
    resetSaltWarningForTests();
    vi.restoreAllMocks();
  });

  it('reports ok when set, without ever returning the salt', async () => {
    vi.stubEnv('TELL_HASH_SALT', 'very-private-salt-value');
    const text = await (await GET()).text();
    expect(text).toContain('"hashSalt":"ok"');
    expect(text).not.toContain('very-private-salt-value');
  });

  it('on Vercel without a salt: warns once, never throws, and health says not-configured', async () => {
    vi.stubEnv('TELL_HASH_SALT', '');
    vi.stubEnv('VERCEL', '1');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => ipKey('9.9.9.9', Date.now())).not.toThrow();
    ipKey('8.8.8.8', Date.now());
    const body = (await (await GET()).json()) as { checks: Record<string, string> };
    expect(body.checks.hashSalt).toBe('not-configured');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).not.toMatch(/tell-dev-salt/);
  });

  it('does not warn off Vercel (local dev and tests)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(warnIfNoHashSalt({})).toBe(false);
    expect(hashSaltStatus({})).toBe('not-configured');
    expect(warn).not.toHaveBeenCalled();
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
