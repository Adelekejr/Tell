import { withCors } from './_lib/cors.js';
import { loadKeyRing } from './_lib/signing.js';

/**
 * GET /keys.json
 * Tell's public signing keys. Anyone can use them to check a card. Retired
 * keys stay listed (pinned in the code) so old cards keep verifying.
 */
export function GET(req: Request): Response {
  const ring = loadKeyRing();
  const body = { alg: 'Ed25519', format: 'base64url raw 32-byte public key', signs: 'the text tell-card-v1, a newline, then the payload as canonical JSON (keys sorted)', keys: ring.published };
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
