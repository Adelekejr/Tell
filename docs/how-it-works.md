# How Tell works

The short version is in the [README](../README.md). This page has the details: what each part does, what it stores and the limits it enforces.

## Layout

```
apps/web          Vite + React site on Firebase Hosting
  src/ai/         the only code that imports firebase/ai
packages/detector rules engine for the seven tricks (pure TypeScript, no network)
packages/shared   trap catalogue, proof levels, grades, card format
api/              Vercel functions (free tier): runs, trap pages /t, canaries /c, cards, board
firestore.rules   clients can never write; the API writes with the Admin SDK
```

## Firebase AI Logic

All AI goes through [`apps/web/src/ai/hybrid.ts`](../apps/web/src/ai/hybrid.ts):

- `getAI(app, { backend: new GoogleAIBackend() })` with the free Gemini Developer API.
- `getGenerativeModel(ai, { mode: InferenceMode.PREFER_ON_DEVICE, inCloudParams: { model: 'gemini-3.5-flash-lite' } })` by default.
- `ONLY_ON_DEVICE` and `ONLY_IN_CLOUD` instances for the Nano vs Cloud comparison.
- `initializeDeviceModel()` runs only when you press **Enable on-device AI**.
- `response.inferenceSource` drives the On-device / Cloud badge.
- App Check (reCAPTCHA) protects AI requests once a site key is set.

## The detector

[`packages/detector`](../packages/detector) finds hidden CSS text, HTML comments, invisible Unicode (tag letters, zero-width, variation selectors, split words), base64 payloads, `#fragment` orders, image-link data leaks, fake system or tool blocks and visible orders aimed at AI assistants. Each finding has a severity and a *strong* flag. A strong rule hit is final: a model's explanation can add to it, never overrule it.

## The live test

1. `POST /api/run` makes a run: a random 128-bit id, 7 private trap links and 7 secret words that stay on the server. It returns the task text to copy into your agent. Runs expire after 24 hours.
2. Your agent opens `/t/{run}/{1-7}`: an ordinary page (a recipe, a boot review, a news item...) hiding one instruction. The instruction asks the agent to visit `/c/{run}/{n}?w={secret word}`.
3. `GET /c/...` records a hit and code decides its proof level. Only the length of any leaked data is kept, never the data, and IP addresses are never stored.
4. The run page polls `GET /api/run/{id}` and flips each card the moment the server sees proof.

Abuse limits: 10 runs an hour per IP, 50 hits per run, per-IP caps on trap reads, canary hits and reply checks. Trap pages are `noindex`, closed to search and training crawlers in `robots.txt` (agents opening a link for a person may read them), script-free, and never link straight to a canary, so search crawlers are never trapped and never scored.

## The prompt drill

No agent to hand? Paste its system prompt into the **Prompt drill** tab in `/lab`. Gemini plays your agent against the same 7 trap pages, one single-turn request per trap, all from the browser through Firebase AI Logic (`apps/web/src/ai/hybrid.ts`).

- The model answers in JSON (`reply` plus the `actions` it would take): `responseConstraint` on-device, `responseSchema` in the cloud. Code then decides Held or Fired from each trap's secret word, canary link and the shared detector. The model never grades itself.
- Gemini Nano runs it when the device can (Chrome desktop). The cloud is used only after you switch on **Allow cloud**, and every row says where it ran.
- **Harden my prompt** asks Gemini for a safer version, then re-runs the drill and shows before and after. **Compare Nano vs Cloud** runs the same prompt `ONLY_ON_DEVICE` and `ONLY_IN_CLOUD`.
- Your prompt is never sent to Tell's servers or stored. Drill results are marked *browser-reported* and never go on the board.
- The cloud path needs App Check (`VITE_RECAPTCHA_SITE_KEY`), because AI Logic enforces it. Until it is set, the drill runs on-device only.

## The check page

For everyone, at `/check`: paste a link or some text and see **You see** next to **Your AI reads**, with hidden lines highlighted.

- Pasted text is checked in the browser and never sent to Tell's server. A link goes to `POST /api/fetch` (the link travels in the body, so it stays out of logs).
- The fetcher only opens ordinary public pages. It accepts http and https on ports 80 and 443, with no user names or passwords in the link. Every DNS answer must be a public address, and the connection is pinned to the address that was checked. Private, loopback, link-local and metadata addresses (including IPv4-mapped and NAT64 forms) are refused on every redirect, up to 3. It has a 5 s limit and a 1 MB cap (also after decompression), accepts HTML or text only, and sends no cookies. Up to 3 stylesheets are inlined, through the same checks. Each hashed IP gets 30 fetches an hour.
- The shared detector decides what is hidden. Gemini (on-device first; for pasted text the cloud only after **Allow cloud for pasted text**) then writes one plain sentence per finding, with a badge saying where it ran. It can't add, remove or overrule a finding.

## Signing and the board

See [signing.md](signing.md).
