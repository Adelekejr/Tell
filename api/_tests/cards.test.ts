import { generateKeyPairSync } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { drillPayload, promptHash, readExtras } from '../_lib/cards.js';
import { loadKeyRing, signPayload, verifySigned } from '../_lib/signing.js';
import type { BoardEntry, RunView, SignedCard } from '../_lib/shared.js';
import { RUN_TTL_MS, TRAP_IDS, canonicalJson, isSignedCard } from '../_lib/shared.js';
import { getStore, resetStoreForTests } from '../_lib/store.js';
import { GET as boardGet, POST as boardPost } from '../board.js';
import { GET as cardGet } from '../card.js';
import { GET as keysGet } from '../keys.js';
import { GET as canary } from '../canary.js';
import { POST as createRunRoute } from '../run.js';
import { POST as finishRoute } from '../run-finish.js';
import { POST as signRoute } from '../sign.js';
import { GET as trapRoute } from '../trap.js';

const BASE = 'http://tell.test';
const CHROME = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
const newKey = () => generateKeyPairSync('ed25519').privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');

const drillTraps = (fired: number[] = [1]) =>
  TRAP_IDS.map((trapId, i) =>
    fired.includes(i)
      ? { trapId, state: 'fired', evidence: 'opened-link', source: 'cloud' }
      : { trapId, state: 'held', evidence: null, source: 'on-device' },
  );

describe('key ring', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('signs with the newest version and publishes every key', () => {
    const ring = loadKeyRing({ TELL_SIGNING_KEY_V1: newKey(), TELL_SIGNING_KEY_V2: newKey(), OTHER: 'x' });
    expect(ring.active?.kid).toBe('k2');
    expect(ring.published.map((k) => k.kid)).toEqual(['k1', 'k2']);
    expect(ring.published.every((k) => /^[A-Za-z0-9_-]{43}$/.test(k.publicKey))).toBe(true);
  });

  it('reports a broken key by name only and accepts PEM', () => {
    const pem = generateKeyPairSync('ed25519').privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
    const ring = loadKeyRing({ TELL_SIGNING_KEY_V1: 'junk', TELL_SIGNING_KEY_V3: pem.replace(/\n/g, '\\n') });
    expect(ring.invalid).toEqual(['TELL_SIGNING_KEY_V1']);
    expect(ring.active?.kid).toBe('k3');
  });

  it('refuses keys that are not Ed25519', () => {
    const rsa = generateKeyPairSync('rsa', { modulusLength: 1024 }).privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');
    expect(loadKeyRing({ TELL_SIGNING_KEY_V1: rsa }).active).toBeNull();
  });
});

describe('signing round trip', () => {
  const ring = loadKeyRing({ TELL_SIGNING_KEY_V1: newKey() });
  const card = signPayload(drillPayload(drillTraps([1, 4]), { agent: 'ShopBot', prompt: null }, 1_700_000_000_000), ring.active!);

  it('produces a well-formed card that verifies', () => {
    expect(isSignedCard(card)).toBe(true);
    expect(card.payload).toMatchObject({ kind: 'drill', witnessed: false, score: { held: 5, tested: 7, grade: 'steady' } });
    expect(verifySigned(card, ring)).toBe(true);
  });

  it('fails when any byte of the payload changes', () => {
    const edited = structuredClone(card);
    edited.payload.traps[1] = { trap: TRAP_IDS[1]!, result: 'held', evidence: 'no-action', source: 'cloud' };
    edited.payload.score = { held: 6, tested: 7, fired: 1, grade: 'steady' };
    expect(isSignedCard(edited)).toBe(true); // still a valid shape...
    expect(verifySigned(edited, ring)).toBe(false); // ...but not what was signed
    expect(verifySigned({ ...card, payload: { ...card.payload, agent: 'Other Bot' } }, ring)).toBe(false);
  });

  it('a drill card can never claim to be witnessed', () => {
    expect(isSignedCard({ ...card, payload: { ...card.payload, witnessed: true } })).toBe(false);
  });

  it('a score that disagrees with the traps is rejected', () => {
    expect(isSignedCard({ ...card, payload: { ...card.payload, score: { ...card.payload.score, grade: 'poker-face' } } })).toBe(false);
  });

  it('old key ids still verify after a rotation; unknown ids do not', () => {
    const k1 = newKey();
    const old = signPayload(card.payload, loadKeyRing({ TELL_SIGNING_KEY_V1: k1 }).active!);
    const rotated = loadKeyRing({ TELL_SIGNING_KEY_V1: k1, TELL_SIGNING_KEY_V2: newKey() });
    expect(rotated.active?.kid).toBe('k2');
    expect(verifySigned(old, rotated)).toBe(true);
    expect(verifySigned({ ...old, kid: 'k9' }, rotated)).toBe(false);
  });

  it('canonical JSON sorts keys at every level', () => {
    expect(canonicalJson({ b: 1, a: { d: [2, { z: 1, y: 2 }], c: null } })).toBe('{"a":{"c":null,"d":[2,{"y":2,"z":1}]},"b":1}');
    expect(() => canonicalJson({ n: Number.NaN })).toThrow();
  });
});

describe('card input validation', () => {
  it('checks names and the opt-in prompt', () => {
    expect(readExtras({})).toEqual({ agent: null, prompt: null });
    expect(readExtras({ agent: '  Shop  Bot ', prompt: ' be careful ' })).toEqual({ agent: 'Shop Bot', prompt: 'be careful' });
    expect(() => readExtras({ agent: 'me@example.com' })).toThrow(/email/);
    expect(() => readExtras({ agent: 'call 0803 123 4567' })).toThrow(/phone/);
    expect(() => readExtras({ agent: 'x' })).toThrow();
    expect(() => readExtras({ prompt: 'x'.repeat(6001) })).toThrow();
    expect(promptHash('abc')).toBe('sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('rejects drill reports that are out of order, inconsistent or empty', () => {
    const extras = { agent: null, prompt: null };
    expect(() => drillPayload(drillTraps().reverse(), extras, 1)).toThrow();
    expect(() => drillPayload(drillTraps().slice(0, 6), extras, 1)).toThrow();
    const noEvidence = drillTraps();
    noEvidence[1] = { trapId: TRAP_IDS[1]!, state: 'fired', evidence: null as unknown as string, source: 'cloud' };
    expect(() => drillPayload(noEvidence, extras, 1)).toThrow();
    const allErrors = TRAP_IDS.map((trapId) => ({ trapId, state: 'error', evidence: null, source: null }));
    expect(() => drillPayload(allErrors, extras, 1)).toThrow(/nothing to sign/);
  });
});

describe('sign, card, keys and board endpoints (dev store)', () => {
  let ip = 100;
  const req = (path: string, init: RequestInit = {}) =>
    new Request(`${BASE}${path}`, { ...init, headers: { 'x-forwarded-for': `10.1.0.${ip}`, 'user-agent': CHROME, ...(init.headers as Record<string, string>) } });
  const post = (path: string, body: unknown) => req(path, { method: 'POST', body: JSON.stringify(body) });
  const newRun = async () => (await (await createRunRoute(req('/api/run', { method: 'POST' }))).json()) as RunView;

  beforeEach(() => {
    ip += 1;
    vi.stubEnv('TELL_DEV_STORE', 'memory');
    vi.stubEnv('FIREBASE_SERVICE_ACCOUNT', '');
    vi.stubEnv('TELL_SIGNING_KEY_V1', newKey());
    resetStoreForTests();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  /** A run where trap 1 was read and trap 2 fired, then finished. */
  const playedRun = async () => {
    const run = await newRun();
    await trapRoute(req(`/t/${run.id}/1`));
    await trapRoute(req(`/t/${run.id}/2`));
    const words = await (await getStore())!.getWords(run.id);
    await canary(req(`/c/${run.id}/2?w=${words!.whisper}`));
    return run;
  };

  it('answers 503 without a signing key', async () => {
    vi.stubEnv('TELL_SIGNING_KEY_V1', '');
    const res = await signRoute(post('/api/sign', { kind: 'drill', traps: drillTraps() }));
    expect(res.status).toBe(503);
  });

  it('signs a live card from the server records, once per run', async () => {
    const run = await playedRun();
    expect((await signRoute(post('/api/sign', { kind: 'live', runId: run.id }))).status).toBe(409); // still open
    await finishRoute(req(`/api/run/${run.id}/finish`, { method: 'POST' }));
    const res = await signRoute(post('/api/sign', { kind: 'live', runId: run.id, agent: 'ShopBot' }));
    expect(res.status).toBe(201);
    const { card } = (await res.json()) as { card: SignedCard };
    expect(card.payload).toMatchObject({ kind: 'live', witnessed: true, agent: 'ShopBot', run: run.label, promptHash: null });
    expect(card.payload.traps.map((t) => t.result)).toEqual(['held', 'fired', 'not-tested', 'not-tested', 'not-tested', 'not-tested', 'not-tested']);
    expect(card.payload.score).toEqual({ held: 1, tested: 2, fired: 1, grade: 'twitchy' });
    expect(JSON.stringify(card)).not.toContain(run.id);
    // Signing again returns the same card, whatever the browser sends.
    const again = await signRoute(post('/api/sign', { kind: 'live', runId: run.id, agent: 'Liar Bot' }));
    expect(again.status).toBe(200);
    expect(((await again.json()) as { card: SignedCard }).card.payload.id).toBe(card.payload.id);
  });

  it('an expired run can be signed; an untested one cannot', async () => {
    const run = await newRun();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(run.createdAt + RUN_TTL_MS + 1);
    const res = await signRoute(post('/api/sign', { kind: 'live', runId: run.id }));
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe('nothing-tested');
  });

  it('stores the prompt only when it is sent, and hashes it into the card', async () => {
    const plain = (await (await signRoute(post('/api/sign', { kind: 'drill', traps: drillTraps() }))).json()) as { card: SignedCard };
    const read = (await (await cardGet(req(`/api/card/${plain.card.payload.id}`))).json()) as { prompt: string | null };
    expect(read.prompt).toBeNull();
    const withPrompt = (await (await signRoute(post('/api/sign', { kind: 'drill', traps: drillTraps(), prompt: 'You are ShopBot.' }))).json()) as {
      card: SignedCard;
    };
    expect(withPrompt.card.payload.promptHash).toBe(promptHash('You are ShopBot.'));
    const back = (await (await cardGet(req(`/api/card/${withPrompt.card.payload.id}`))).json()) as { card: SignedCard; prompt: string };
    expect(back.prompt).toBe('You are ShopBot.');
    expect(back.card).toEqual(withPrompt.card);
  });

  it('validates sign requests', async () => {
    expect((await signRoute(post('/api/sign', { kind: 'nope' }))).status).toBe(400);
    expect((await signRoute(post('/api/sign', { kind: 'live', runId: '../x' }))).status).toBe(400);
    expect((await signRoute(post('/api/sign', { kind: 'live', runId: 'a'.repeat(26) }))).status).toBe(404);
    expect((await signRoute(post('/api/sign', { kind: 'drill', traps: drillTraps(), agent: 'visit www.spam.com' }))).status).toBe(400);
    expect((await signRoute(req('/api/sign', { method: 'POST', body: 'x'.repeat(30_000) }))).status).toBe(413);
    expect((await cardGet(req('/api/card/NOT-AN-ID'))).status).toBe(404);
    expect((await cardGet(req('/api/card/aaaaaaaaaaaaaaaa'))).status).toBe(404);
  });

  it('rate-limits signing to 20 an hour per IP', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 21; i += 1) codes.push((await signRoute(post('/api/sign', { kind: 'drill', traps: drillTraps() }))).status);
    expect(codes.slice(0, 20).every((c) => c === 201)).toBe(true);
    expect(codes[20]).toBe(429);
  });

  it('publishes the public key only', async () => {
    const secret = process.env.TELL_SIGNING_KEY_V1!;
    const res = keysGet(req('/keys.json'));
    const text = await res.text();
    expect(res.headers.get('cache-control')).toContain('public');
    expect(text).not.toContain(secret);
    const body = JSON.parse(text) as { keys: { kid: string; publicKey: string }[] };
    expect(body.keys).toEqual([{ kid: 'k1', alg: 'Ed25519', publicKey: loadKeyRing().active!.publicRaw }]);
  });

  it('only live, witnessed, correctly signed cards join the board, once', async () => {
    const run = await playedRun();
    await finishRoute(req(`/api/run/${run.id}/finish`, { method: 'POST' }));
    const live = ((await (await signRoute(post('/api/sign', { kind: 'live', runId: run.id }))).json()) as { card: SignedCard }).card;
    const drill = ((await (await signRoute(post('/api/sign', { kind: 'drill', traps: drillTraps([]) }))).json()) as { card: SignedCard }).card;

    expect((await boardPost(post('/api/board', { cardId: drill.payload.id, name: 'Drill Bot' }))).status).toBe(403);
    expect((await boardPost(post('/api/board', { cardId: live.payload.id, name: 'me@x.com' }))).status).toBe(400);
    expect((await boardPost(post('/api/board', { cardId: 'aaaaaaaaaaaaaaaa', name: 'Ghost Bot' }))).status).toBe(404);
    const added = await boardPost(post('/api/board', { cardId: live.payload.id, name: 'ShopBot' }));
    expect(added.status).toBe(201);
    expect((await boardPost(post('/api/board', { cardId: live.payload.id, name: 'ShopBot' }))).status).toBe(200);

    const board = (await (await boardGet(req('/api/board?range=week'))).json()) as { entries: BoardEntry[] };
    expect(board.entries).toEqual([
      { cardId: live.payload.id, name: 'ShopBot', held: 1, tested: 2, grade: 'twitchy', cells: ['h', 'f', 'w', 'w', 'w', 'w', 'w'], at: live.payload.issuedAt },
    ]);
    expect(((await (await boardGet(req('/api/board?poker=1'))).json()) as { entries: BoardEntry[] }).entries).toEqual([]);
    const card = (await (await cardGet(req(`/api/card/${live.payload.id}`))).json()) as { listed: boolean };
    expect(card.listed).toBe(true);
  });

  it('a card signed with a key that has since been removed cannot join the board', async () => {
    const run = await playedRun();
    await finishRoute(req(`/api/run/${run.id}/finish`, { method: 'POST' }));
    const live = ((await (await signRoute(post('/api/sign', { kind: 'live', runId: run.id }))).json()) as { card: SignedCard }).card;
    vi.stubEnv('TELL_SIGNING_KEY_V1', newKey()); // a different key with the same id
    expect((await boardPost(post('/api/board', { cardId: live.payload.id, name: 'ShopBot' }))).status).toBe(409);
  });
});
