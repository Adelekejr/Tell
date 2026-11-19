import { describe, expect, it } from 'vitest';
import { drillPayload, livePayload, testKey } from '../test/cards';
import { hashPrompt, mergeKeys, pickEngine, promptMatches, readPasted, verifyCard } from './verify';

const key = testKey('k1');
const keys = mergeKeys([key.info]);

describe('verifying a card in the browser', () => {
  it.each(['web-crypto', 'noble'] as const)('accepts a genuine card (%s)', async (engine) => {
    const card = key.signCard(livePayload());
    expect(await verifyCard(card, keys, engine)).toEqual({ status: 'valid', kid: 'k1', keySource: 'published', engine });
  });

  it.each(['web-crypto', 'noble'] as const)('rejects an edited card (%s)', async (engine) => {
    const card = key.signCard(livePayload([1]));
    const edited = { ...card, payload: { ...card.payload, agent: 'Someone Else' } };
    expect(await verifyCard(edited, keys, engine)).toMatchObject({ status: 'invalid', reason: 'signature' });
    const otherKey = testKey('k1').signCard(livePayload([1]));
    expect(await verifyCard(otherKey, keys, engine)).toMatchObject({ status: 'invalid', reason: 'signature' });
  });

  it('rejects unknown keys and malformed cards', async () => {
    const card = key.signCard(drillPayload());
    expect(await verifyCard({ ...card, kid: 'k2' }, keys)).toMatchObject({ status: 'invalid', reason: 'unknown-key' });
    expect(await verifyCard({ ...card, payload: { ...card.payload, witnessed: true } }, keys)).toMatchObject({ reason: 'malformed' });
    expect(await verifyCard('nope', keys)).toMatchObject({ reason: 'malformed', kid: null });
  });

  it('uses Web Crypto where the browser has Ed25519', async () => {
    expect(await pickEngine()).toBe('web-crypto');
  });

  it('checks an included prompt against the signed fingerprint', async () => {
    const hash = await hashPrompt('You are ShopBot.');
    expect(hash).toBe('sha256:' + (await import('node:crypto')).createHash('sha256').update('You are ShopBot.').digest('hex'));
    const card = key.signCard(livePayload([1], { promptHash: hash }));
    expect(await promptMatches(card, 'You are ShopBot.')).toBe(true);
    expect(await promptMatches(card, 'You are ShopBot!')).toBe(false);
    expect(await promptMatches(key.signCard(livePayload()), 'x')).toBeNull();
  });

  it('reads pasted links, ids and JSON', () => {
    expect(readPasted('https://tell.run/v/abcdefghijklmnop')).toEqual({ id: 'abcdefghijklmnop' });
    expect(readPasted('abcdefghijklmnop')).toEqual({ id: 'abcdefghijklmnop' });
    expect(readPasted('{"card":{"a":1}}')).toEqual({ card: { a: 1 } });
    expect(readPasted('{"a":1}')).toEqual({ card: { a: 1 } });
    expect(readPasted('not json')).toBeNull();
    expect(readPasted('  ')).toBeNull();
  });
});
