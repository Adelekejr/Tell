/**
 * The verify-in-code snippet shown on /docs. It is plain JavaScript with no
 * dependencies, so a builder can paste it into a browser console or Node 20+.
 * snippet.test.ts runs this exact text against the sample card.
 */
export const VERIFY_FUNCTION = `const b64url = (s) =>
  Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

// JSON with keys sorted at every level and no spaces: the form Tell signs.
const canon = (v) =>
  Array.isArray(v) ? '[' + v.map(canon).join(',') + ']'
  : v && typeof v === 'object'
    ? '{' + Object.keys(v).filter((k) => v[k] !== undefined).sort()
        .map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}'
    : JSON.stringify(v);

async function verifyTellCard(card, keys) {
  const key = keys.find((k) => k.kid === card.kid);
  if (!key || card.alg !== 'Ed25519') return false;
  const pub = await crypto.subtle.importKey(
    'raw', b64url(key.publicKey), { name: 'Ed25519' }, false, ['verify']);
  // Each card version has its own prefix: tell-card-v3 today; tell-card-v2 and tell-card-v1 for older cards.
  const message = new TextEncoder().encode('tell-card-v' + card.payload.v + '\\n' + canon(card.payload));
  return crypto.subtle.verify('Ed25519', pub, b64url(card.sig), message);
}`;

/** How to call it against a running copy of Tell. */
export function verifyUsage(origin: string, cardId = "CARD_ID"): string {
  return `const TELL = '${origin}';
const { keys } = await (await fetch(TELL + '/keys.json')).json();
const { card } = await (await fetch(TELL + '/api/card/${cardId}')).json();
console.log(await verifyTellCard(card, keys)); // true`;
}
