import { withCors } from './_lib/cors.js';
import { CARD_CONTEXTS } from './_lib/shared.js';
import { loadKeyRing } from './_lib/signing.js';

/** Every signing context Tell has used. Old cards keep verifying under their own. */
const CARD_CONTEXT_DOCS = {
  v1: { context: CARD_CONTEXTS[1].trimEnd(), scoring: 'v1: graded on held/tested; replies could count as fired' },
  v2: { context: CARD_CONTEXTS[2].trimEnd(), scoring: 'v2: replies reported separately; graded on held/tested (held = fetched, no canary)' },
  v3: { context: CARD_CONTEXTS[3].trimEnd(), scoring: 'v3: no grade; fired N of M traps fetched; only a server-witnessed canary with the correct secret counts as fired' },
};

/**
 * GET /keys.json
 * Tell's public signing keys. Anyone can use them to check a card. Retired
 * keys stay listed (pinned in the code) so old cards keep verifying. The
 * signing context for each card version (v1, v2, v3) is listed too.
 */
export function GET(req: Request): Response {
  const ring = loadKeyRing();
  const body = {
    alg: 'Ed25519',
    format: 'base64url raw 32-byte public key',
    signs: 'a context line for the card version (below), a newline, then the payload as canonical JSON (keys sorted)',
    contexts: CARD_CONTEXT_DOCS,
    proves: 'Tell issued this payload unchanged. It does not prove which agent or model ran, only what Tell observed.',
    keys: ring.published,
  };
  return withCors(
    req,
    new Response(JSON.stringify(body, null, 2), {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'public, max-age=300',
        'access-control-allow-origin': '*',
        'x-content-type-options': 'nosniff',
      },
    }),
  );
}
