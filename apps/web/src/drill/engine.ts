/** Which model the drill can use right now, and the line that explains it. */
import { isConfigured } from '../ai/config';
import type { DrillMode } from '../ai/modes';
import { PROBLEM_TEXT } from '../ai/modes';
import type { DeviceAvailability } from '../ai/source';

/** Cloud mode is available whenever the AI project is configured; verification is optional. */
export function cloudReady(): boolean {
  return isConfigured;
}

export const DEVICE_TEXT: Record<DeviceAvailability, { tag: string; line: string }> = {
  available: { tag: 'Ready', line: 'Gemini Nano runs here. Your prompt stays on this device.' },
  downloadable: { tag: 'Download needed', line: 'One-time download, then the drill runs on this device.' },
  downloading: { tag: 'Downloading', line: 'Getting Gemini Nano ready.' },
  unavailable: { tag: 'Not on this device', line: 'This device can\u2019t run on-device AI.' },
  unsupported: { tag: 'Not in this browser', line: 'On-device AI needs Chrome 139+ on a desktop computer.' },
};

export interface Engine {
  mode: DrillMode | null;
  /** Shown under the button: what will run, or why nothing can. */
  line: string;
}

export function pickEngine(
  allowCloud: boolean,
  device: DeviceAvailability | null,
  cloudOk = cloudReady(),
  configured = isConfigured,
): Engine {
  const deviceReady = device === 'available';
  if (!configured) return { mode: null, line: PROBLEM_TEXT['not-configured'] };
  if (allowCloud && cloudOk) {
    return deviceReady
      ? { mode: 'prefer', line: 'Runs on this device. Cloud only if it has to.' }
      : { mode: 'cloud', line: 'On-device isn\u2019t available on this device. Using Gemini in the cloud.' };
  }
  if (deviceReady) return { mode: 'device', line: 'Runs on this device. Nothing leaves it.' };
  if (!cloudOk) {
    return {
      mode: null,
      line:
        device === 'downloadable' || device === 'downloading'
          ? 'Enable on-device AI to run the drill. Cloud AI isn\u2019t set up for this copy of Tell.'
          : 'This device can\u2019t run on-device AI, and cloud AI isn\u2019t set up for this copy of Tell. Try Chrome on a desktop computer.',
    };
  }
  return { mode: null, line: 'On-device isn\u2019t available on this device. Turn on Allow cloud, or use Chrome desktop for on-device.' };
}
