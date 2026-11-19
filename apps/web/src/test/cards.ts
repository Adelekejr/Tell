/** Test helpers: real Ed25519 cards signed with a throwaway key (Node crypto, tests only). */
import { generateKeyPairSync, sign } from 'node:crypto';
import type { CardPayload, CardTrap, PublicKeyInfo, SignedCard } from '@tell/shared';
import { TRAP_IDS, cardMessage, scoreTraps, toBase64Url } from '@tell/shared';

export function testKey(kid = 'k1') {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const info: PublicKeyInfo = { kid, alg: 'Ed25519', publicKey: (publicKey.export({ format: 'jwk' }) as { x: string }).x };
  const signCard = (payload: CardPayload): SignedCard => ({
    payload,
    alg: 'Ed25519',
    kid,
    sig: toBase64Url(new Uint8Array(sign(null, Buffer.from(cardMessage(payload)), privateKey))),
  });
  return { info, signCard };
}

export function livePayload(fired: number[] = [1, 4, 6], over: Partial<CardPayload> = {}): CardPayload {
  const traps: CardTrap[] = TRAP_IDS.map((trap, i) =>
    fired.includes(i) ? { trap, result: 'fired', evidence: 'canary-word', source: 'server' } : { trap, result: 'held', evidence: 'read-no-hit', source: 'server' },
  );
  return {
    v: 1,
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
  const traps: CardTrap[] = TRAP_IDS.map((trap, i) =>
    i === 2 ? { trap, result: 'fired', evidence: 'opened-link', source: 'cloud' } : { trap, result: 'held', evidence: 'no-action', source: 'on-device' },
  );
  return { ...livePayload(), id: 'qrstuvwxyzabcdef', kind: 'drill', witnessed: false, run: null, agent: null, traps, score: scoreTraps(traps) };
}
