/** Test helpers: real Ed25519 cards signed with a throwaway key (Node crypto, tests only). */
import { generateKeyPairSync, sign } from 'node:crypto';
import type { AnyCardPayload, CardPayload, CardTrap, LegacyCardPayload, LegacyCardTrap, PublicKeyInfo, SignedCard, V2CardPayload, V2CardTrap } from '@tell/shared';
import { TRAP_IDS, cardMessage, cardTrap, legacyScoreTraps, scoreTraps, toBase64Url, v2ScoreTraps, witnessedOf } from '@tell/shared';

export function testKey(kid = 'k1') {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const info: PublicKeyInfo = { kid, alg: 'Ed25519', publicKey: (publicKey.export({ format: 'jwk' }) as { x: string }).x };
  const signCard = (payload: AnyCardPayload): SignedCard => ({
    payload,
    alg: 'Ed25519',
    kid,
    sig: toBase64Url(new Uint8Array(sign(null, Buffer.from(cardMessage(payload)), privateKey))),
  });
  return { info, signCard };
}

export function livePayload(fired: number[] = [1, 4, 6], over: Partial<CardPayload> = {}): CardPayload {
  const traps: CardTrap[] = TRAP_IDS.map((trap, i) => cardTrap(trap, fired.includes(i) ? 'canary-word' : 'read-no-hit', 'server'));
  return {
    v: 3,
    id: 'abcdefghijklmnop',
    kind: 'live',
    witnessed: true,
    agent: 'ShopBot',
    issuedAt: Date.UTC(2026, 10, 24, 12),
    run: 'R-AAAA',
    traps,
    score: scoreTraps(traps),
    promptHash: null,
    ...over,
  };
}

export function drillPayload(): CardPayload {
  const traps: CardTrap[] = TRAP_IDS.map((trap, i) => (i === 2 ? cardTrap(trap, 'opened-link', 'cloud') : cardTrap(trap, 'no-action', 'on-device')));
  return { ...livePayload(), id: 'qrstuvwxyzabcdef', kind: 'drill', witnessed: false, run: null, agent: null, traps, score: scoreTraps(traps) };
}

/** A live card where one trap was found only in a pasted reply. */
export function reportedPayload(): CardPayload {
  const traps: CardTrap[] = TRAP_IDS.map((trap, i) => cardTrap(trap, i === 3 ? 'reply-echo' : i === 1 ? 'canary-word' : 'read-no-hit', 'server'));
  return { ...livePayload(), id: 'reportedcardaaaa', traps, witnessed: witnessedOf('live', traps), score: scoreTraps(traps) };
}

/** A live card with evidence but no valid observation: outcome null. */
export function noGradePayload(): CardPayload {
  const traps: CardTrap[] = TRAP_IDS.map((trap, i) => cardTrap(trap, i === 0 ? 'no-word' : i === 1 ? 'preview-bot' : 'not-reached', 'server'));
  return { ...livePayload(), id: 'nogradecardaaaaa', traps, witnessed: true, score: scoreTraps(traps) };
}

/** A card signed under the old v1 rules: suspicious counted as held, a reply echo as fired. */
export function legacyPayload(): LegacyCardPayload {
  const traps: LegacyCardTrap[] = TRAP_IDS.map((trap, i) =>
    i === 0
      ? { trap, result: 'suspicious', evidence: 'no-word', source: 'server' }
      : i === 1
        ? { trap, result: 'fired', evidence: 'reply-echo', source: 'server' }
        : { trap, result: 'held', evidence: 'read-no-hit', source: 'server' },
  );
  return { v: 1, id: 'legacycardaaaaaa', kind: 'live', witnessed: true, agent: 'Old Bot', issuedAt: Date.UTC(2026, 10, 20, 12), run: 'R-AAAA', traps, score: legacyScoreTraps(traps), promptHash: null };
}

/** A card signed under the v2 rules: a page fetch with no canary was called "held" and graded. */
export function v2Payload(): V2CardPayload {
  const traps: V2CardTrap[] = TRAP_IDS.map((trap, i) => {
    const t = cardTrap(trap, i === 1 ? 'canary-word' : 'read-no-hit', 'server');
    return { ...t, result: t.result === 'no-canary' ? 'held' : t.result } as V2CardTrap;
  });
  return { v: 2, id: 'v2cardaaaaaaaaaa', kind: 'live', witnessed: true, agent: 'Mid Bot', issuedAt: Date.UTC(2026, 10, 22, 12), run: 'R-BBBB', traps, score: v2ScoreTraps(traps), promptHash: null };
}
