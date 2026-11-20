import { useEffect, useReducer, useRef, useState } from 'react';
import type { TrapId } from '@tell/shared';
import { FIX_TIPS, SAMPLE_STRONG_PROMPT, SAMPLE_WEAK_PROMPT, TRAPS, getTrap } from '@tell/shared';
import { isConfigured } from '../ai/config';
import type { AiProblem, DrillMode } from '../ai/modes';
import { PROBLEM_TEXT, classifyAiError } from '../ai/modes';
import { checkPrompt } from '../drill/checklist';
import { DEVICE_TEXT, cloudReady, pickEngine } from '../drill/engine';
import { checkDeviceAvailability } from '../ai/source';
import type * as Hybrid from '../ai/hybrid';
import { buildHardenPrompt, MAX_SYSTEM_PROMPT } from '../drill/prompt';
import type { DrillResult, DrillTrapResult } from '../drill/run';
import { ASK_TIMEOUT_MS, parseHarden, runDrill, scoreDrill, withTimeout } from '../drill/run';
import type { DrillTrapReport } from '../lib/api';
import { API_BASE } from '../lib/api';
import { InferenceBadge } from './Badge';
import { Button } from './Button';
import { DrillSheet } from './DrillSheet';
import { Textarea } from './Field';
import { Notice } from './Notice';
import { PromptChecklist } from './PromptChecklist';
import { SignCard } from './SignCard';
import {
  adoptStageReducer,
  compareStageReducer,
  drillStageReducer,
  hardenStageReducer,
  initialAdoptStage,
  initialCompareStage,
  initialDrillStage,
  initialHardenStage,
  initialModelState,
  modelReducer,
} from './prompt-drill-state';

type HybridModule = typeof Hybrid;

/** Trap pages link to the live trap host; the drill never calls it. */
const DRILL_BASE = API_BASE || 'https://tell.run';

const loadHybrid = (() => {
  let p: Promise<HybridModule> | null = null;
  return () => (p ??= import('../ai/hybrid'));
})();

export type SampleId = 'weak' | 'strong';

const SAMPLES: Record<SampleId, { label: string; prompt: string }> = {
  weak: { label: 'Weak prompt', prompt: SAMPLE_WEAK_PROMPT },
  strong: { label: 'Strong prompt', prompt: SAMPLE_STRONG_PROMPT },
};

/** Only the outcome of each trap goes to be signed: never the replies, the prompt (unless opted in) or the secrets. */
function reportOf(results: readonly DrillTrapResult[]): DrillTrapReport[] {
  return TRAPS.map((t) => {
    const r = results.find((x) => x.trapId === t.id);
    if (!r || r.state === 'error' || !r.source || r.source === 'rules') return { trapId: t.id, state: 'error', evidence: null, source: null };
    return { trapId: t.id, state: r.state, evidence: r.state === 'fired' ? r.evidence : null, source: r.source };
  });
}

function FixTips({ fallen }: { fallen: readonly TrapId[] }) {
  if (!fallen.length) return null;
  return (
    <div className="fix-tips">
      <p className="label">Fix tips</p>
      {fallen.map((id) => (
        <div key={id} className="fix-tip">
          <h3 className="h4">{getTrap(id).name}</h3>
          <p className="small muted">{FIX_TIPS[id]}</p>
        </div>
      ))}
    </div>
  );
}

/**
 * The prompt drill: Gemini plays the builder's agent against the seven traps,
 * entirely in the browser. Code decides held or fired. Nothing is stored and
 * the prompt never reaches Tell's servers.
 */
export function PromptDrill({ sample }: { sample?: SampleId | null } = {}) {
  const [prompt, setPrompt] = useState(() => (sample ? SAMPLES[sample].prompt : ''));
  const [allowCloud, setAllowCloud] = useState(false);
  const [model, dispatchModel] = useReducer(modelReducer, initialModelState);
  const [drillStage, dispatchDrill] = useReducer(drillStageReducer, initialDrillStage);
  const [result, setResult] = useState<DrillResult | null>(null);
  const [before, setBefore] = useState<DrillResult | null>(null);
  const [view, setView] = useState<'after' | 'before'>('after');
  const [hardenStage, dispatchHarden] = useReducer(hardenStageReducer, initialHardenStage);
  const [compareStage, dispatchCompare] = useReducer(compareStageReducer, initialCompareStage);
  const [compareView, setCompareView] = useState<'device' | 'cloud'>('device');
  const [problem, setProblem] = useState<AiProblem | null>(null);
  const abort = useRef<AbortController | null>(null);
  const downloadRequest = useRef(0);
  const operationId = useRef(0);
  const drillRequestId = useRef(0);
  const [adoptStage, dispatchAdopt] = useReducer(adoptStageReducer, initialAdoptStage);

  useEffect(() => {
    let live = true;
    void checkDeviceAvailability().then((d) => live && dispatchModel({ type: 'availability-observed', requestId: 0, availability: d }));
    if (isConfigured) void loadHybrid();
    return () => {
      live = false;
      operationId.current += 1;
      abort.current?.abort();
    };
  }, []);

  const cloudOk = cloudReady();
  const device = model.availability;
  const progress = model.download.kind === 'running' ? model.download.progress : null;
  const engine = pickEngine(allowCloud, device, cloudOk);
  const harden = hardenStage.kind === 'succeeded' ? hardenStage.suggestion : null;
  const compare = compareStage.kind === 'succeeded' ? compareStage.compare : compareStage.previous;
  const hardening = hardenStage.kind === 'running';
  const drillRunning = drillStage.kind === 'running';
  const busy = drillRunning || hardening;
  const trimmed = prompt.trim();
  const checklist = trimmed.length >= 20 ? checkPrompt(trimmed) : null;
  const sampleOn = (Object.keys(SAMPLES) as SampleId[]).find((id) => SAMPLES[id].prompt === prompt) ?? null;
  const canRun = engine.mode !== null && trimmed.length >= 20 && !busy;
  const canCompare = device === 'available' && cloudOk && allowCloud;
  const deviceCanEnable = isConfigured && (device === 'downloadable' || device === 'downloading');

  async function enableDevice() {
    const requestId = ++downloadRequest.current;
    setProblem(null);
    dispatchModel({ type: 'download-started', requestId });
    try {
      const m = await loadHybrid();
      await m.enableDrillOnDevice((v) => dispatchModel({ type: 'download-progress', requestId, progress: v }));
      const observed = await checkDeviceAvailability();
      dispatchModel({ type: 'download-succeeded', requestId, availability: observed });
    } catch (e) {
      dispatchModel({ type: 'download-failed', requestId });
      setProblem(classifyAiError(e));
    }
  }

  async function drill(
    systemPrompt: string,
    mode: DrillMode,
    label: string,
    ownerId: number,
    completeStage = true,
  ): Promise<DrillResult | null> {
    const m = await loadHybrid();
    if (ownerId !== operationId.current) return null;
    const requestId = ++drillRequestId.current;
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    const partial: DrillTrapResult[] = [];
    dispatchDrill({ type: 'drill-started', requestId, label });
    try {
      const r = await runDrill({
        systemPrompt,
        mode,
        ask: m.askAgent,
        base: DRILL_BASE,
        signal: ctrl.signal,
        onResult: (row) => {
          if (ownerId !== operationId.current) return;
          partial.push(row);
          dispatchDrill({ type: 'drill-progress', requestId, partial: [...partial] });
        },
      });
      if (ownerId !== operationId.current) return null;
      if (completeStage) dispatchDrill({ type: 'drill-succeeded', requestId, result: r });
      return r;
    } catch (e) {
      if (ownerId === operationId.current) {
        dispatchDrill({ type: 'drill-failed', requestId, problem: classifyAiError(e) });
      }
      throw e;
    }
  }

  async function run(
    systemPrompt = trimmed,
    keepBefore = false,
    ownerId = ++operationId.current,
    throwErrors = false,
  ): Promise<DrillResult | null> {
    if (!engine.mode) {
      if (throwErrors) throw new Error('No drill engine is available.');
      return null;
    }
    if (adoptStage.kind === 'running' && adoptStage.requestId !== ownerId) dispatchAdopt({ type: 'adopt-reset' });
    abort.current?.abort();
    setProblem(null);
    dispatchCompare({ type: 'compare-reset' });
    try {
      const r = await drill(systemPrompt, engine.mode, 'Prompt drill', ownerId);
      if (!r || ownerId !== operationId.current) return null;
      setBefore(keepBefore ? (before ?? result) : null);
      setView('after');
      setResult(r);
      setProblem(r.problem);
      if (!keepBefore) dispatchHarden({ type: 'harden-reset' });
      return r;
    } catch (e) {
      if (ownerId === operationId.current) setProblem(classifyAiError(e));
      if (throwErrors) throw e;
      return null;
    }
  }

  async function suggest() {
    if (!engine.mode || !result) return;
    const requestId = ++operationId.current;
    if (adoptStage.kind === 'running') dispatchAdopt({ type: 'adopt-reset' });
    dispatchCompare({ type: 'compare-cancel' });
    abort.current?.abort();
    setProblem(null);
    dispatchHarden({ type: 'harden-started', requestId });
    try {
      const m = await loadHybrid();
      const answer = await withTimeout(
        m.askHarden(buildHardenPrompt(trimmed, scoreDrill(result.results).fallen), engine.mode),
        ASK_TIMEOUT_MS,
      );
      if (requestId !== operationId.current) return;
      const s = parseHarden(answer.text, answer.source);
      if (s) {
        dispatchHarden({ type: 'harden-succeeded', requestId, suggestion: s });
      } else {
        dispatchHarden({ type: 'harden-failed', requestId, problem: 'bad-output' });
        setProblem('bad-output');
      }
    } catch (e) {
      if (requestId !== operationId.current) return;
      const failure = classifyAiError(e);
      dispatchHarden({ type: 'harden-failed', requestId, problem: failure });
      setProblem(failure);
    }
  }

  async function adoptHardened() {
    if (!harden || adoptStage.kind === 'running') return;
    const requestId = ++operationId.current;
    abort.current?.abort();
    dispatchAdopt({ type: 'adopt-started', requestId });
    setPrompt(harden.prompt);
    try {
      const completed = await run(harden.prompt, true, requestId, true);
      if (requestId !== operationId.current || !completed) return;
      dispatchAdopt({ type: 'adopt-succeeded', requestId });
    } catch (e) {
      if (requestId !== operationId.current) return;
      const failure = classifyAiError(e);
      dispatchAdopt({ type: 'adopt-failed', requestId, problem: failure });
      setProblem(failure);
    }
  }

  async function runCompare() {
    const requestId = ++operationId.current;
    if (adoptStage.kind === 'running') dispatchAdopt({ type: 'adopt-reset' });
    abort.current?.abort();
    dispatchCompare({ type: 'compare-started', requestId });
    setProblem(null);
    try {
      const d = await drill(trimmed, 'device', 'On-device', requestId, false);
      if (!d || requestId !== operationId.current) return;
      const c = await drill(trimmed, 'cloud', 'Cloud', requestId, true);
      if (!c || requestId !== operationId.current) return;
      dispatchCompare({ type: 'compare-succeeded', requestId, compare: { device: d, cloud: c } });
      setCompareView('device');
    } catch (e) {
      if (requestId !== operationId.current) return;
      const failure = classifyAiError(e);
      dispatchCompare({ type: 'compare-failed', requestId, problem: failure });
      setProblem(failure);
    }
  }

  const shown = view === 'before' && before ? before : result;
  const score = result ? scoreDrill(result.results) : null;
  const deviceText = device ? DEVICE_TEXT[device] : null;

  return (
    <div className="lab-drill">
      <div>
        <h2 className="h3">Drill a system prompt</h2>
        <p className="small muted">
          Gemini plays your agent against all 7 traps. Results are marked <em>browser-reported</em>: Tell didn{'\u2019'}t
          watch a real agent.
        </p>
      </div>

      <div className="drill-samples" role="group" aria-label="Sample prompts">
        <span className="small muted">No prompt handy? Try a made-up one:</span>
        {(Object.keys(SAMPLES) as SampleId[]).map((id) => (
          <button key={id} type="button" className="chip" aria-pressed={sampleOn === id} disabled={busy} onClick={() => setPrompt(SAMPLES[id].prompt)}>
            {SAMPLES[id].label}
          </button>
        ))}
      </div>

      <Textarea
        label={'Your agent\u2019s system prompt'}
        mono
        rows={7}
        value={prompt}
        maxLength={MAX_SYSTEM_PROMPT}
        placeholder={'You are ShopBot, a helpful shopping assistant\u2026'}
        onChange={(e) => setPrompt(e.target.value)}
        hint={`${prompt.length} / ${MAX_SYSTEM_PROMPT} \u00B7 Stays in this browser. Tell never stores or receives it.`}
        disabled={busy}
      />

      {checklist ? <PromptChecklist list={checklist} /> : null}

      <div className="drill-engines">
        <div className="drill-engine">
          <div className="drill-engine-top">
            <span className="h4">On-device AI</span>
            {deviceText ? <span className="tag tag-line">{progress !== null ? 'Downloading' : deviceText.tag}</span> : null}
          </div>
          <p className="small muted">{deviceText ? deviceText.line : 'Checking this device\u2026'}</p>
          {progress !== null ? (
            <>
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
              <p className="mono small muted">
                {Math.round(progress * 100)}%{allowCloud && cloudOk ? ' \u00B7 Cloud until ready' : ''}
              </p>
            </>
          ) : deviceCanEnable ? (
            <Button variant="ghost" size="sm" onClick={() => void enableDevice()} disabled={busy}>
              Enable on-device AI
            </Button>
          ) : null}
        </div>

        <label className={`drill-switch${cloudOk ? '' : ' is-disabled'}`}>
          <input
            type="checkbox"
            role="switch"
            checked={allowCloud && cloudOk}
            disabled={!cloudOk || busy}
            onChange={(e) => setAllowCloud(e.target.checked)}
          />
          <span className="drill-switch-track" aria-hidden="true" />
          <span>
            <span className="h4">Allow cloud</span>
            <span className="small muted">
              {cloudOk
                ? 'Sends your prompt and the trap pages to Gemini in the cloud through Firebase. Off by default.'
                : 'Unavailable: App Check isn\u2019t set up for this copy of Tell yet, so the cloud would refuse.'}
            </span>
          </span>
        </label>
      </div>

      <div className="drill-go">
        <Button
          variant="accent"
          arrow
          onClick={() => void run()}
          disabled={!canRun}
          loading={drillRunning}
          loadingLabel={drillStage.kind === 'running' ? `Drilling ${Math.min(drillStage.partial.length + 1, 7)}/7` : undefined}
        >
          Run the drill
        </Button>
        <p className="small muted" aria-live="polite">
          {trimmed.length > 0 && trimmed.length < 20 ? 'Paste the full prompt (20 characters or more).' : engine.line}
        </p>
      </div>

      {problem ? (
        <Notice role="alert">
          <strong>{problem === 'app-check' ? 'Cloud blocked.' : 'The drill stopped.'}</strong> {PROBLEM_TEXT[problem]}
        </Notice>
      ) : null}

      {drillStage.kind === 'running' ? (
        <DrillSheet results={drillStage.partial} title={drillStage.label} pending={7 - drillStage.partial.length} />
      ) : null}

      {drillStage.kind !== 'running' && shown ? (
        <div className="drill-result">
          {before ? (
            <div className="seg seg-sm" role="group" aria-label="Which prompt">
              {(['before', 'after'] as const).map((v) => (
                <button key={v} type="button" className="seg-btn" aria-pressed={view === v} onClick={() => setView(v)}>
                  {v === 'before' ? 'Before' : 'After'} {'\u00B7'} {scoreDrill((v === 'before' ? before : result)?.results ?? []).held}/7
                </button>
              ))}
            </div>
          ) : null}
          <DrillSheet results={shown.results} title={view === 'before' && before ? 'Before hardening' : before ? 'After hardening' : 'Prompt drill'} />
          {view === 'after' && score ? <FixTips fallen={score.fallen} /> : null}
          {view === 'after' && score && score.tested > 0 && result ? (
            <SignCard
              key={result.finishedAt}
              kind="drill"
              defaultPrompt={trimmed}
              disabled={busy}
              build={(extras) => ({ kind: 'drill', traps: reportOf(result.results), ...extras })}
            />
          ) : null}

          {view === 'after' && score && score.tested > 0 && !harden ? (
            <Button variant="ghost" arrow onClick={() => void suggest()} loading={hardening} loadingLabel="Hardening" disabled={busy}>
              Harden my prompt
            </Button>
          ) : null}

          {harden && view === 'after' ? (
            <div className="harden">
              <div className="harden-top">
                <p className="label">Suggested prompt</p>
                <InferenceBadge source={harden.source} />
              </div>
              {harden.changes.length ? (
                <ul className="small harden-changes">
                  {harden.changes.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              ) : null}
              <pre className="mono harden-text">{harden.prompt}</pre>
              {prompt.trim() !== harden.prompt ? (
                <Button variant="primary" arrow onClick={() => void adoptHardened()} disabled={busy}>
                  Use it and re-run
                </Button>
              ) : null}
            </div>
          ) : null}

          {canCompare ? (
            <Button variant="ghost" size="sm" onClick={() => void runCompare()} disabled={busy}>
              Compare Nano vs Cloud
            </Button>
          ) : null}
        </div>
      ) : null}

      {compare && drillStage.kind !== 'running' ? (
        <div className="drill-compare">
          <p className="label">Same prompt, two models</p>
          <div className="seg seg-sm drill-compare-seg" role="group" aria-label="Which model">
            {(['device', 'cloud'] as const).map((v) => (
              <button key={v} type="button" className="seg-btn" aria-pressed={compareView === v} onClick={() => setCompareView(v)}>
                {v === 'device' ? 'Nano' : 'Cloud'} {'\u00B7'} {scoreDrill(compare[v].results).held}/7
              </button>
            ))}
          </div>
          <div className="drill-compare-cols" data-show={compareView}>
            <div className="drill-col is-device">
              <DrillSheet results={compare.device.results} title="On-device only" compact={false} />
            </div>
            <div className="drill-col is-cloud">
              <DrillSheet results={compare.cloud.results} title="Cloud only" compact={false} />
            </div>
          </div>
        </div>
      ) : null}

      <p className="small muted drill-note">
        Simulated with Gemini, not your production model. Drill results never go on the board; only a witnessed live test can.
      </p>
    </div>
  );
}
