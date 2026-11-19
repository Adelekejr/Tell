# Signing scorecards

Every scorecard is signed with Ed25519 on the server. Anyone can check a card in their own browser at `/verify`, using the public keys at `/keys.json`.

## What gets signed

The signed message is the text `tell-card-v1`, a newline, then the card payload as canonical JSON (keys sorted, no spaces). The payload holds the per-trap results, the score, the date, the optional agent name and, if the owner opted in, a SHA-256 fingerprint of their prompt. It never holds a run id, an IP address or anything else about the person.

- **Live cards** (`witnessed: true`) are built by the server from its own records of a closed run. Only these can join the board.
- **Drill cards** (`witnessed: false`) carry what a browser reported from a prompt drill. They are labelled "Browser-reported" and never ranked.

## Keys

`TELL_SIGNING_KEY_V<n>` holds a private key (base64 PKCS#8 DER, or PEM). Its key id is `k<n>`. The highest version signs new cards; every configured version is still published, so old cards keep verifying after a rotation.

### Add the first key

1. On your own computer, in the repo: `pnpm signing-key`. It writes `.secrets/tell-signing-key-v1.env` (gitignored, readable only by you) and prints nothing secret.
2. Open that file. Copy the value after `TELL_SIGNING_KEY_V1=`.
3. In Vercel: Project → Settings → Environment Variables → add `TELL_SIGNING_KEY_V1`, for Production and Preview, marked Sensitive. Or from the repo: `grep '^TELL_SIGNING_KEY_V1=' .secrets/tell-signing-key-v1.env | cut -d= -f2- | vercel env add TELL_SIGNING_KEY_V1 production`.
4. Redeploy. Check `/api/health` shows `"signingKey": "ok (k1)"` and `/keys.json` lists `k1`.
5. Delete the file once the key is in Vercel. Never paste the private key into a chat, issue or commit.

The public key (in the file's comments and at `/keys.json`) is safe to share. It can be pinned in `PINNED_KEYS` in `packages/shared/src/scorecard.ts`, so the verify page trusts it even if `/keys.json` were changed.

### Rotate

Run `pnpm signing-key` again (it writes `v2`), add `TELL_SIGNING_KEY_V2` the same way, keep `V1` configured, and redeploy. New cards are signed with `k2`; `k1` cards still verify.

## Board storage

Cards and board entries live in Firestore and are written only by the API. The Firestore rules block all client reads and writes, so the browser reads them through `/api/card/:id` and `/api/board`. Deploy rules and indexes with `firebase deploy --only firestore`.
