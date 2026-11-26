# Signing scorecards

**The problem:** a screenshot of a scorecard proves nothing. Anyone could edit the result or invent a run.

**The fix:** every scorecard is signed with Ed25519 on the server. Anyone can check a card in their own browser at `/verify`, using the public keys at `/keys.json`. Change one character and the check fails.

## What gets signed

The signed message is the text `tell-card-v3`, a newline, then the card payload as canonical JSON (keys sorted, no spaces). The payload holds the per-trap results (`fired`, `no-canary`, `suspicious`, `reported` or `not-tested`), each with its evidence `basis` (`server-witnessed`, `reply-reported`, `browser-reported` or `none`), the counts (`observed`, `fired`, `noCanary`, `suspicious`, `reported`) and an `outcome` (`tell`, `no-tell`, or `null` when nothing was observed). There is no grade: a fetched page with no canary is inconclusive, never resistance. The payload also holds the date, the optional agent name and, if the owner opted in, a SHA-256 fingerprint of their prompt. It never holds a run id, an IP address or anything else about the person.

- **Live cards** (`live: true`) are built by the server from its own records of a closed run. `witnessed: true` means every result came from the server's records; a live card with any reply-reported trap has `witnessed: false`.
- **Only live, witnessed cards with at least 3 traps observed can join the board.** The API checks this when a card is added, and on every board read it re-verifies the signature and rebuilds the entry from the signed card.
- **Drill cards** carry what a browser reported from a prompt drill. They are labelled "Browser-reported" and never ranked.

## What a signature proves

That Tell issued exactly this payload and nothing changed since. Not which agent or model ran (the agent name is typed by the tester), not that the agent would behave the same again, and nothing Tell didn't observe.

## Signing contexts and old cards

| `payload.v` | Context | Scoring |
|---|---|---|
| 3 | `tell-card-v3` | Counts and an outcome; no grade |
| 2 | `tell-card-v2` | `held`/`tested` grade (`held` = fetched, no canary); replies reported separately |
| 1 | `tell-card-v1` | `held`/`tested` grade; replies could count as fired |

All three verify with the same keys, each over its own context; `/keys.json` lists them under `contexts`. v1 and v2 cards are never silently re-scored: the site shows their grade exactly as signed, labelled "Scoring v1" or "Scoring v2", with a note that *held* meant a page fetch with no canary. Their per-trap rows are re-read under today's rules (a pasted-reply hit becomes *Reported*, *held* becomes *No canary*), and board eligibility is always recomputed.

## Keys

`TELL_SIGNING_KEY_V<n>` holds a private key (base64 PKCS#8 DER, or PEM). Its key id is `k<n>`. The highest version signs new cards; every configured version is still published, so old cards keep verifying after a rotation.

### Add the first key

1. On your own computer, in the repo: `pnpm signing-key`. It writes `.secrets/tell-signing-key-v1.env` (gitignored, readable only by you) and prints nothing secret.
2. Open that file. Copy the value after `TELL_SIGNING_KEY_V1=`.
3. In Vercel: Project → Settings → Environment Variables → add `TELL_SIGNING_KEY_V1`, for Production and Preview, marked Sensitive. Or from the repo: `grep '^TELL_SIGNING_KEY_V1=' .secrets/tell-signing-key-v1.env | cut -d= -f2- | vercel env add TELL_SIGNING_KEY_V1 production`.
4. Redeploy. Check `/api/health` shows `"signingKey": "ok (k1)"` and `/keys.json` lists `k1`.
5. Delete the file once the key is in Vercel. Never paste the private key into a chat, issue or commit.

### No computer? (phone only)

The key must be made on a machine you control, but it doesn't have to be yours to hold. Whoever runs your build machine can do it there, with your go-ahead, without the key ever appearing on a screen or in a chat:

1. On that machine, in the repo: `pnpm signing-key --value-file`. Besides the `.env` file it writes `.secrets/tell-signing-key-v1.value`, holding only the value.
2. Add it to Vercel straight from that file: `vercel env add TELL_SIGNING_KEY_V1 production --sensitive < .secrets/tell-signing-key-v1.value` (and again for `preview`), or with a tool that uploads a variable's value from a file path. Nobody reads or types the key.
3. Redeploy, check `/api/health` and `/keys.json` from your phone's browser, then delete the `.secrets` folder on that machine.

The Firestore rules and the board index can also be set from a phone: in the Firebase console, open Firestore → Rules, paste the contents of `firestore.rules` and publish; then Firestore → Indexes → add a composite index on the `board` collection with `hidden` ascending and `at` descending.

The public key (in the file's comments and at `/keys.json`) is safe to share. It can be pinned in `PINNED_KEYS` in `packages/shared/src/scorecard.ts`, so the verify page trusts it even if `/keys.json` were changed.

### Rotate

Run `pnpm signing-key` again (it writes `v2`), add `TELL_SIGNING_KEY_V2` the same way, keep `V1` configured, and redeploy. New cards are signed with `k2`; `k1` cards still verify.

## The sample card

The "Try it" section shows a made-up sample card at `/card/sample`. It is signed with a separate demo key (`kid: demo`) whose private half was thrown away the moment the card was signed (`scripts/make-sample-card.mjs`), so it can never sign anything else. The demo public key ships in the app, not in `/keys.json`; the server doesn't know it, so the sample can't be stored, served by the API or added to the board. The verify page calls it a sample, never a test result.

## Board storage

Cards and board entries live in Firestore and are written only by the API. The Firestore rules block all client reads and writes, so the browser reads them through `/api/card/:id` and `/api/board`. Deploy rules and indexes with `firebase deploy --only firestore`.
