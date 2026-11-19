import { describe, expect, it } from 'vitest';
import { readConfig } from './config';
import { toAnswerSource } from './source';

describe('readConfig', () => {
  it('runs in not-configured mode with no env', () => {
    const c = readConfig({}, true);
    expect(c.firebase).toBeNull();
    expect(c.missing).toEqual(['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_APP_ID']);
    expect(c.cloudModel).toBe('gemini-3.5-flash-lite');
  });

  it('reads a full config and trims values', () => {
    const c = readConfig(
      {
        VITE_FIREBASE_API_KEY: ' key ',
        VITE_FIREBASE_PROJECT_ID: 'tell-demo',
        VITE_FIREBASE_APP_ID: '1:2:web:3',
        VITE_RECAPTCHA_SITE_KEY: 'site',
        VITE_APPCHECK_PROVIDER: 'recaptcha-enterprise',
      },
      false,
    );
    expect(c.firebase?.apiKey).toBe('key');
    expect(c.appCheck).toEqual({ provider: 'recaptcha-enterprise', siteKey: 'site', debugToken: null });
  });

  it('only honours the App Check debug token in development', () => {
    expect(readConfig({ VITE_APPCHECK_DEBUG_TOKEN: 'abc' }, true).appCheck.debugToken).toBe('abc');
    expect(readConfig({ VITE_APPCHECK_DEBUG_TOKEN: 'abc' }, false).appCheck.debugToken).toBeNull();
  });
});

describe('toAnswerSource', () => {
  it('maps the SDK inference source to the badge', () => {
    expect(toAnswerSource('on_device')).toBe('on-device');
    expect(toAnswerSource('in_cloud')).toBe('cloud');
    expect(toAnswerSource(undefined)).toBe('cloud');
    expect(toAnswerSource(undefined, 'on-device')).toBe('on-device');
  });
});
