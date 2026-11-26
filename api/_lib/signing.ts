import { createPrivateKey, createPublicKey, sign as edSign, verify as edVerify } from 'node:crypto';
import type { KeyObject } from 'node:crypto';
import type { AnyCardPayload, PublicKeyInfo, SignedCard } from './shared.js';
import { CARD_ALG, PINNED_KEYS, cardMessage, fromBase64Url, isSignedCard, toBase64Url } from './shared.js';

/**
 * Scorecard signing keys. Each private key lives only in a Vercel
 * environment variable, TELL_SIGNING_KEY_V<n> (base64 PKCS#8 DER, or PEM),
 * and gets the key id "k<n>". The highest version signs new cards; every
 * configured or pinned key still verifies, so a rotation never breaks old
 * cards. Private keys are never logged, returned or written anywhere.
 */
export interface SigningKey {
  kid: string;
  version: number;
  privateKey: KeyObject;
  publicKey: KeyObject;
  /** base64url raw 32-byte public key. */
  publicRaw: string;
}

const VAR = /^TELL_SIGNING_KEY_V([1-9][0-9]{0,2})$/;

function parsePrivate(value: string): KeyObject | null {
  const v = value.trim();
  if (!v) return null;
  try {
    const key = v.includes('-----BEGIN')
      ? createPrivateKey(v.replace(/\\n/g, '\n'))
      : createPrivateKey({ key: Buffer.from(v, 'base64'), format: 'der', type: 'pkcs8' });
    return key.asymmetricKeyType === 'ed25519' ? key : null;
  } catch {
    return null;
  }
}

export interface KeyRing {
  /** The key that signs new cards, or null when signing isn't set up. */
  active: SigningKey | null;
  /** Every public key that verifies cards: configured ones plus pinned ones. */
  published: PublicKeyInfo[];
  /** Variables that are set but don't hold a valid Ed25519 private key (names only). */
  invalid: string[];
}

export function loadKeyRing(env: NodeJS.ProcessEnv = process.env): KeyRing {
  const keys: SigningKey[] = [];
  const invalid: string[] = [];
  for (const [name, value] of Object.entries(env)) {
    const m = VAR.exec(name);
    if (!m || !value?.trim()) continue;
    const privateKey = parsePrivate(value);
    if (!privateKey) {
      invalid.push(name);
      continue;
    }
    const publicKey = createPublicKey(privateKey);
    const jwk = publicKey.export({ format: 'jwk' }) as { x?: string };
    const version = Number(m[1]);
    keys.push({ kid: `k${version}`, version, privateKey, publicKey, publicRaw: jwk.x ?? '' });
  }
  keys.sort((a, b) => b.version - a.version);
  const published = new Map<string, PublicKeyInfo>();
  for (const k of PINNED_KEYS) published.set(k.kid, k);
  for (const k of keys) published.set(k.kid, { kid: k.kid, alg: CARD_ALG, publicKey: k.publicRaw });
  return {
    active: keys[0] ?? null,
    published: [...published.values()].sort((a, b) => (a.kid < b.kid ? -1 : 1)),
    invalid,
  };
}

export function signPayload(payload: AnyCardPayload, key: SigningKey): SignedCard {
  const sig = edSign(null, Buffer.from(cardMessage(payload)), key.privateKey);
  return { payload, alg: CARD_ALG, kid: key.kid, sig: toBase64Url(new Uint8Array(sig)) };
}

/** Server-side check, used before a card may join the board. */
export function verifySigned(card: unknown, ring: KeyRing): card is SignedCard {
  if (!isSignedCard(card)) return false;
  const info = ring.published.find((k) => k.kid === card.kid);
  const raw = info ? fromBase64Url(info.publicKey) : null;
  const sig = fromBase64Url(card.sig);
  if (!raw || raw.length !== 32 || !sig || sig.length !== 64) return false;
  try {
    const key = createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: info!.publicKey }, format: 'jwk' });
    return edVerify(null, Buffer.from(cardMessage(card.payload)), key, Buffer.from(sig));
  } catch {
    return false;
  }
}
