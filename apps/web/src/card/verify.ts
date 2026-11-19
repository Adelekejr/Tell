/**
 * Checks a scorecard's Ed25519 signature in this browser. Uses Web Crypto
 * where the browser has Ed25519 (Chrome 137+, Safari 17+, Firefox 129+) and
 * the audited @noble/ed25519 library otherwise. Tell's server is only asked
 * for the public key, and not even that when the key is pinned in the code.
 */
import type { PublicKeyInfo, SignedCard } from '@tell/shared';
import { DEMO_KEY, PINNED_KEYS, SAMPLE_SLUG, cardMessage, fromBase64Url, isSignedCard, toHex, utf8Bytes } from '@tell/shared';

/** `sample`: the demo key that signed only the made-up sample card. */
export type KeySource = 'pinned' | 'published' | 'sample';
export type Engine = 'web-crypto' | 'noble';

export type Verdict =
  | { status: 'valid'; kid: string; keySource: KeySource; engine: Engine }
  | { status: 'invalid'; reason: 'malformed' | 'unknown-key' | 'signature'; kid: string | null };

export interface KeyedInfo extends PublicKeyInfo {
  source: KeySource;
}

/** Pinned keys win over published ones with the same id; the demo key can't be replaced. */
export function mergeKeys(published: readonly PublicKeyInfo[]): KeyedInfo[] {
  const out = new Map<string, KeyedInfo>();
  for (const k of published) if (k.alg === 'Ed25519') out.set(k.kid, { ...k, source: 'published' });
  for (const k of PINNED_KEYS) out.set(k.kid, { ...k, source: 'pinned' });
  out.set(DEMO_KEY.kid, { ...DEMO_KEY, source: 'sample' });
  return [...out.values()];
}

type Verify = (sig: Uint8Array, msg: Uint8Array, pub: Uint8Array) => Promise<boolean>;

/** Copies into a fresh ArrayBuffer so Web Crypto's BufferSource types are happy. */
const buf = (b: Uint8Array): ArrayBuffer => b.slice().buffer as ArrayBuffer;

export const webCryptoVerify: Verify = async (sig, msg, pub) => {
  const key = await crypto.subtle.importKey('raw', buf(pub), { name: 'Ed25519' }, false, ['verify']);
  return crypto.subtle.verify({ name: 'Ed25519' }, key, buf(sig), buf(msg));
};

export const nobleVerify: Verify = async (sig, msg, pub) => {
  const ed = await import('@noble/ed25519');
  // Strict RFC 8032 checks, the same as Web Crypto.
  return ed.verifyAsync(sig, msg, pub, { zip215: false });
};

/** Web Crypto when it supports Ed25519, else the library. Exposed for tests. */
export async function pickEngine(): Promise<Engine> {
  try {
    if (!globalThis.crypto?.subtle) return 'noble';
    const probe = new Uint8Array(32);
    probe[0] = 1;
    await crypto.subtle.importKey('raw', buf(probe), { name: 'Ed25519' }, false, ['verify']);
    return 'web-crypto';
  } catch {
    return 'noble';
  }
}

export async function verifyCard(card: unknown, keys: readonly KeyedInfo[], engine?: Engine): Promise<Verdict> {
  if (!isSignedCard(card)) {
    const kid = typeof (card as { kid?: unknown })?.kid === 'string' ? (card as { kid: string }).kid : null;
    return { status: 'invalid', reason: 'malformed', kid };
  }
  const key = keys.find((k) => k.kid === card.kid);
  const pub = key ? fromBase64Url(key.publicKey) : null;
  if (!key || !pub || pub.length !== 32) return { status: 'invalid', reason: 'unknown-key', kid: card.kid };
  const sig = fromBase64Url(card.sig)!;
  const use = engine ?? (await pickEngine());
  const ok = await (use === 'web-crypto' ? webCryptoVerify : nobleVerify)(sig, cardMessage(card.payload), pub).catch(() => false);
  return ok ? { status: 'valid', kid: card.kid, keySource: key.source, engine: use } : { status: 'invalid', reason: 'signature', kid: card.kid };
}

/** "sha256:<hex>" of the prompt, to match the hash signed into the card. */
export async function hashPrompt(prompt: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buf(utf8Bytes(prompt)));
  return `sha256:${toHex(new Uint8Array(digest))}`;
}

export async function promptMatches(card: SignedCard, prompt: string | null): Promise<boolean | null> {
  if (!card.payload.promptHash || prompt === null) return null;
  return (await hashPrompt(prompt)) === card.payload.promptHash;
}

/** Reads a pasted card: the JSON itself, or a verify link (returns the id). */
export function readPasted(text: string): { card: unknown } | { id: string } | null {
  const t = text.trim();
  if (!t) return null;
  if (new RegExp(`(?:/v/|/card/)${SAMPLE_SLUG}(?![\\w-])`).test(t) || t === SAMPLE_SLUG) return { id: SAMPLE_SLUG };
  const id = /(?:\/v\/|\/card\/)([a-z2-7]{16})\b/.exec(t)?.[1] ?? (/^[a-z2-7]{16}$/.test(t) ? t : null);
  if (id) return { id };
  try {
    const parsed = JSON.parse(t) as unknown;
    if (parsed && typeof parsed === 'object' && 'card' in parsed) return { card: (parsed as { card: unknown }).card };
    return { card: parsed };
  } catch {
    return null;
  }
}
