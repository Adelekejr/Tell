import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const indexes = JSON.parse(readFileSync(new URL('../../firestore.indexes.json', import.meta.url), 'utf8')) as {
  fieldOverrides: { collectionGroup: string; fieldPath: string; ttl?: boolean; indexes: unknown[] }[];
};
const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');

describe('Firestore TTL and rules', () => {
  it('expires runs, hits, run secrets and rate-limit counters on expireAt', () => {
    const ttl = indexes.fieldOverrides.filter((o) => o.ttl === true);
    expect(ttl.map((o) => o.collectionGroup).sort()).toEqual(['hits', 'limits', 'runSecrets', 'runs']);
    for (const o of ttl) expect(o.fieldPath).toBe('expireAt');
  });

  it('never expires signed cards or board entries', () => {
    expect(indexes.fieldOverrides.some((o) => o.collectionGroup === 'cards' || o.collectionGroup === 'board')).toBe(false);
  });

  it('denies every client read and write', () => {
    expect(rules).not.toMatch(/allow\s+[^;]*:\s*if\s+(?!false)/);
    expect(rules).toMatch(/match \/\{document=\*\*\} \{\s*allow read, write: if false;/);
  });
});
