import { useEffect, useReducer, useRef, useState } from 'react';
import { CLOUD_MODEL } from '@tell/shared';
import { InferenceBadge } from '../components/Badge';
import { Button } from '../components/Button';
import { Notice } from '../components/Notice';
import { config, isConfigured } from '../ai/config';
import { checkDeviceAvailability } from '../ai/source';
import type { DeviceAvailability } from '../ai/source';
import type * as Hybrid from '../ai/hybrid';
import type { Answer } from '../ai/hybrid';
import { usePageTitle } from '../lib/title';
import { initialModelState, modelReducer } from '../components/prompt-drill-state';

type HybridModule = typeof Hybrid;

const AVAILABILITY_TEXT: Record<DeviceAvailability, string> = {
  available: 'Ready. Gemini Nano is on this device.',
  downloadable: 'Supported. The model needs a one-time download (about 22 GB of free disk is required).',
  downloading: 'Downloading the model now.',
  unavailable: 'This device can\u2019t run on-device AI. Tell will use Gemini in the cloud.',
  unsupported:
    'This browser has no on-device AI. It needs Chrome 139 or later on a desktop computer. Tell will use Gemini in the cloud.',
};

/**
 * "Can this computer run Tell on-device?" Also the first real Firebase AI
 * Logic call in the app: enable on-device AI, then ask one short question
 * and show which side answered.
 */
export function Device() {
  usePageTitle('Device check');
  const [model, dispatchModel] = useReducer(modelReducer, initialModelState);
  const [enabling, setEnabling] = useState(false);
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hybrid = useRef<HybridModule | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    void checkDeviceAvailability().then((availability) => dispatchModel({ type: 'availability-observed', requestId: 0, availability }));
    // Load the AI module early so the button click keeps its user activation.
    if (isConfigured) {
      void import('../ai/hybrid').then((m) => {
        hybrid.current = m;
      });
    }
  }, []);

  const availability = model.availability;
  const progress = model.download.kind === 'running' ? model.download.progress : null;
  const canEnable = isConfigured && model.download.kind !== 'running' && (availability === 'downloadable' || availability === 'downloading' || availability === 'available');

  async function enable() {
    const id = ++requestId.current;
    setError(null);
    dispatchModel({ type: 'download-started', requestId: id });
    setEnabling(true);
    try {
      const m = hybrid.current ?? (await import('../ai/hybrid'));
      await m.enableOnDevice((v) => dispatchModel({ type: 'download-progress', requestId: id, progress: v }));
      const observed = await checkDeviceAvailability();
      dispatchModel({ type: 'download-succeeded', requestId: id, availability: observed });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn\u2019t start on-device AI.');
      dispatchModel({ type: 'download-failed', requestId: id });
    } finally {
      setEnabling(false);
    }
  }

  async function ask() {
    setError(null);
    setAsking(true);
    try {
      const m = hybrid.current ?? (await import('../ai/hybrid'));
      setAnswer(await m.generate('In one short sentence, what is a "tell" in poker?'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The request failed.');
    } finally {
      setAsking(false);
    }
  }

  return (
    <section className="stub">
      <p className="label">Device check</p>
      <h1 className="h1">Can this computer run Tell on-device?</h1>
      <p className="lede muted">
        On-device AI keeps private text on your computer. Phones and other browsers use Gemini in the cloud, and every
        answer says which one ran.
      </p>

      <div className="stub-body">
        {!isConfigured ? (
          <Notice>
            <strong>Not connected to Firebase yet.</strong> This copy of Tell has no Firebase settings, so AI is off.
            Missing: <span className="mono">{config.missing.join(', ')}</span>. See <span className="mono">.env.example</span>.
          </Notice>
        ) : null}

        <div className="device-result">
          <p className="label">This device</p>
          <p className="h3" aria-live="polite">
            {availability ? AVAILABILITY_TEXT[availability] : 'Checking\u2026'}
          </p>
          <p className="small muted">
            Needs Chrome 139+ on Windows 10/11, macOS 13+, Linux or Chromebook Plus, 22 GB free disk, and either a GPU
            with more than 4 GB of memory or 16 GB of RAM with 4+ CPU cores.
          </p>
        </div>

        {progress !== null && progress < 1 ? (
          <div>
            <div
              className="progress"
              role="progressbar"
              aria-label="On-device model download"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress * 100)}
            >
              <span style={{ transform: `scaleX(${progress})` }} />
            </div>
            <p className="small muted" style={{ marginTop: 8 }}>
              Downloading {Math.round(progress * 100)}% {'\u00B7'} Cloud until ready
            </p>
          </div>
        ) : null}

        <div className="stub-actions">
          <Button
            variant="accent"
            arrow
            onClick={enable}
            loading={enabling}
            disabled={!canEnable}
            sub={canEnable ? 'One-time download, then it works offline' : 'Not available on this device'}
          >
            Enable on-device AI
          </Button>
          <Button variant="ghost" arrow onClick={ask} loading={asking} disabled={!isConfigured} sub="One short question">
            Try a test answer
          </Button>
        </div>

        {answer ? (
          <div className="device-answer" aria-live="polite">
            <InferenceBadge source={answer.source} model={answer.source === 'cloud' ? config.cloudModel || CLOUD_MODEL : undefined} />
            <p>{answer.text}</p>
            <p className="mono muted">{answer.ms} ms</p>
          </div>
        ) : null}

        {error ? <Notice role="alert">{error}</Notice> : null}
      </div>
    </section>
  );
}
