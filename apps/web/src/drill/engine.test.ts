import { describe, expect, it } from 'vitest';
import { pickEngine } from './engine';

describe('pickEngine', () => {
  it('needs Firebase settings', () => {
    expect(pickEngine(true, 'available', true, false).mode).toBeNull();
  });
  it('uses the device only, unless the cloud is allowed', () => {
    expect(pickEngine(false, 'available', true, true).mode).toBe('device');
    expect(pickEngine(true, 'available', true, true).mode).toBe('prefer');
  });
  it('falls back to the cloud with the plain line', () => {
    const e = pickEngine(true, 'unsupported', true, true);
    expect(e.mode).toBe('cloud');
    expect(e.line).toBe('On-device isn\u2019t available on this device. Using Gemini in the cloud.');
  });
  it('explains when nothing can run', () => {
    expect(pickEngine(false, 'unsupported', true, true).line).toMatch(/Turn on Allow cloud, or use Chrome desktop/);
    expect(pickEngine(true, 'unsupported', true, true).mode).toBe('cloud');
    expect(pickEngine(true, 'unsupported', false, true).line).toMatch(/cloud AI/);
    expect(pickEngine(false, 'downloadable', false, true).line).toMatch(/Enable on-device AI/);
  });
});
