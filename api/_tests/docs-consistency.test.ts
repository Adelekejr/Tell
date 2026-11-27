import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const readme = read('README.md');
const how = read('docs/how-it-works.md');

describe('docs stay in step with the code', () => {
  it('keeps one CI workflow and never tells people to copy it into place', () => {
    expect(existsSync(new URL('../../docs/ci-workflow.yml', import.meta.url))).toBe(false);
    expect(read('.github/workflows/ci.yml')).not.toMatch(/copy this file/i);
  });

  it('describes current cards as v3 with a 3-trap board minimum', () => {
    expect(how).toContain('tell-card-v3');
    expect(how).not.toMatch(/signed over `tell-card-v2`/);
    expect(how).not.toMatch(/at least one valid test/);
    expect(how).toMatch(/at least 3 traps/);
  });

  it('uses the v3 state names in the evidence diagram', () => {
    const diagram = readme.slice(readme.indexOf('[*] --> waiting'), readme.indexOf('### Card versions'));
    for (const state of ['waiting', 'reading', 'no_canary', 'fired', 'reported', 'suspicious', 'untested']) expect(diagram).toContain(state);
    expect(diagram).not.toMatch(/held|resist/i);
    // A quiet minute is not final while the run is open.
    expect(diagram).toContain('no_canary --> fired');
  });

  it('only fills the results table from signed real-agent cards', () => {
    const results = readme.slice(readme.indexOf('**Results**'));
    expect(results).toMatch(/only from signed cards that Hammed produces/);
  });

  it('keeps the two App Check switches apart and never claims enforcement', () => {
    const appCheck = readme.slice(readme.indexOf('### App Check status'), readme.indexOf('## Reproducing a test'));
    expect(appCheck).toMatch(/firebaseml/);
    expect(appCheck).toMatch(/TELL_APPCHECK/);
    expect(appCheck).toMatch(/not enforced/);
    expect(appCheck).not.toMatch(/App Check is (now )?enforced/i);
  });

  it('does not claim Firestore TTL is deleting data on the free plan', () => {
    for (const doc of [readme, how]) {
      expect(doc).toMatch(/not active/);
      expect(doc).toMatch(/Spark/);
      expect(doc).toMatch(/Blaze/);
      expect(doc).toMatch(/expired working data stays stored/);
      expect(doc).not.toMatch(/then deleted by a Firestore TTL policy/);
      expect(doc).not.toMatch(/defined in `firestore\.indexes\.json`, delete them/);
    }
  });
});
