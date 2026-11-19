import type { AnswerSource } from '@tell/shared';

/**
 * Maps the SDK's `response.inferenceSource` ("on_device" | "in_cloud") to the
 * badge. Kept free of firebase imports so it can be unit-tested.
 */
export function toAnswerSource(inferenceSource: string | undefined, fallback: AnswerSource = 'cloud'): AnswerSource {
  if (inferenceSource === 'on_device') return 'on-device';
  if (inferenceSource === 'in_cloud') return 'cloud';
  return fallback;
}

export type DeviceAvailability = 'unsupported' | 'unavailable' | 'downloadable' | 'downloading' | 'available';

interface PromptApi {
  availability: (options?: unknown) => Promise<string>;
}

/**
 * Asks Chrome whether its built-in model can run here. This is only a
 * capability check; every AI request still goes through Firebase AI Logic.
 */
export async function checkDeviceAvailability(): Promise<DeviceAvailability> {
  const api = (globalThis as { LanguageModel?: PromptApi }).LanguageModel;
  if (!api || typeof api.availability !== 'function') return 'unsupported';
  try {
    const result = await api.availability({
      expectedInputs: [{ type: 'text', languages: ['en'] }],
      expectedOutputs: [{ type: 'text', languages: ['en'] }],
    });
    if (result === 'available' || result === 'downloadable' || result === 'downloading') return result;
    return 'unavailable';
  } catch {
    return 'unavailable';
  }
}
