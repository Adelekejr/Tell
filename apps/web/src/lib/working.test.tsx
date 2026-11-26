import { afterEach, describe, expect, it } from 'vitest';
import { beginWork, isWorking, trackWork } from './working';

afterEach(() => {
  // nothing to clean: beginWork/trackWork are counted in and out inside each test
});

describe('working signal', () => {
  it('counts work in and out, once per task, even when it fails', async () => {
    const end = beginWork();
    expect(isWorking()).toBe(true);
    end();
    end();
    expect(isWorking()).toBe(false);
    await expect(trackWork(() => Promise.reject(new Error('x')))).rejects.toThrow('x');
    expect(isWorking()).toBe(false);
  });
});
