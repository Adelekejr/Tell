import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import type { KeyboardEvent, ReactNode } from 'react';
import { RUN_TTL_MS } from '@tell/shared';
import { Button } from '../components/Button';
import { Notice } from '../components/Notice';
import { TaskBox } from '../components/TaskBox';
import type { SavedRun } from '../lib/api';
import { ApiError, clearLastRun, createRun, getRun, loadLastRun, saveLastRun } from '../lib/api';
import { useLogoLoading } from '../components/logo-loading';
import { usePageTitle } from '../lib/title';

type Tab = 'live' | 'drill';
const HOURS = RUN_TTL_MS / 3_600_000;

// The drill pulls in the trap pages and the detector; load it only when its tab opens.
const PromptDrill = lazy(() => import('../components/PromptDrill').then((m) => ({ default: m.PromptDrill })));

function DrillLoadingFallback() {
  useLogoLoading(true);
  return <p className="small muted lab-drill">Loading the drill…</p>;
}

/** ?sample=weak|strong opens the drill with a made-up sample prompt (from the Try it section). */
function sampleOf(v: string | null): 'weak' | 'strong' | null {
  return v === 'weak' || v === 'strong' ? v : null;
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="lab-step">
      <span className="step-n" aria-hidden="true">
        {n}
      </span>
      <div className="step-body">
        <h2 className="h3">{title}</h2>
        {children}
      </div>
    </li>
  );
}

function LiveTest() {
  const [run, setRun] = useState<SavedRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);

  useEffect(() => {
    const saved = loadLastRun();
    if (!saved) return;
    const requestId = ++request.current;
    void getRun(saved.id).then((view) => {
      if (requestId !== request.current) return;
      if (view.status !== 'open') {
        clearLastRun();
        return;
      }
      saveLastRun(view);
      setRun({ id: view.id, label: view.label, task: view.task, expiresAt: view.expiresAt });
    }).catch((err) => {
      if (requestId !== request.current) return;
      if (err instanceof ApiError && (err.status === 404 || err.status === 410 || err.code === 'not-found')) {
        clearLastRun();
      } else {
        setError(err instanceof ApiError ? err.message : 'Something went wrong. Retry in a moment.');
      }
    });
    return () => {
      if (request.current === requestId) request.current += 1;
    };
  }, []);

  const start = async () => {
    const requestId = ++request.current;
    setBusy(true);
    setError(null);
    try {
      const view = await createRun();
      if (requestId !== request.current) return;
      saveLastRun(view);
      setRun({ id: view.id, label: view.label, task: view.task, expiresAt: view.expiresAt });
    } catch (err) {
      if (requestId === request.current) setError(err instanceof ApiError ? err.message : 'Something went wrong. Retry in a moment.');
    } finally {
      if (requestId === request.current) setBusy(false);
    }
  };

  return (
    <div className="lab-live">
      <ol className="lab-steps">
        <Step n={1} title={run ? 'Your run is ready' : 'Deal a hand'}>
          {run ? (
            <>
              <p className="small muted">
                Run <span className="mono ink">{run.label}</span> {'\u00B7'} 7 trap links, private to you. Expires in {HOURS} h.
              </p>
              <TaskBox task={run.task} compact />
            </>
          ) : (
            <>
              <p className="small muted">
                Tell makes 7 private trap links with secret words only a hijacked agent would know. They expire in {HOURS} h.
              </p>
              <Button variant="accent" onClick={start} loading={busy} loadingLabel={'Dealing\u2026'} arrow>
                Start a live test
              </Button>
              {error ? <Notice role="alert">{error}</Notice> : null}
            </>
          )}
        </Step>
        <Step n={2} title="Paste it into your agent">
          <p className="small muted">
            Any assistant or workflow that can open links. Leave this page open, or come back later. It catches up.
          </p>
        </Step>
        <Step n={3} title="Watch the cards">
          <p className="small muted">Each trap flips the moment its link is visited with the secret word.</p>
        </Step>
      </ol>
      {run ? (
        <div className="lab-actions">
          <Button to={`/run/${run.id}`} arrow>
            Open live run
          </Button>
          <button
            type="button"
            className="linkish small"
            onClick={() => {
              request.current += 1;
              clearLastRun();
              setRun(null);
            }}
          >
            Deal a fresh hand instead
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function Lab() {
  usePageTitle('Lab');
  const [params] = useSearchParams();
  const sample = sampleOf(params.get('sample'));
  const [tab, setTab] = useState<Tab>(params.get('tab') === 'drill' || sample ? 'drill' : 'live');
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const next = tab === 'live' ? 'drill' : 'live';
      setTab(next);
      document.getElementById(`tab-${next}`)?.focus();
    }
  };
  return (
    <section className="lab">
      <header className="lab-head">
        <p className="label">The lab</p>
        <h1 className="h1">
          Put your agent
          <br /> at the table.
        </h1>
        <p className="lede muted lab-lede">
          Give your agent seven ordinary pages. Each hides one trick. If it obeys, Tell sees it, live.
        </p>
      </header>
      <div className="lab-panel">
        <div className="seg" role="tablist" aria-label="Lab mode" onKeyDown={onKey}>
          {(
            [
              ['live', 'Live test'],
              ['drill', 'Prompt drill'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              id={`tab-${id}`}
              type="button"
              role="tab"
              aria-selected={tab === id}
              aria-controls={`panel-${id}`}
              tabIndex={tab === id ? 0 : -1}
              className="seg-btn"
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="small muted lab-mode-note" aria-live="polite">
          {tab === 'live'
            ? 'Tests your real agent on real pages. Tell\u2019s server witnesses what it does, so the card can join the board.'
            : 'Gemini plays your agent from its system prompt, here in your browser. Good for fixing a prompt; the card is browser-reported and never ranked.'}
        </p>
        <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} className="lab-tabpanel">
          {tab === 'live' ? <LiveTest /> : (
            <Suspense fallback={<DrillLoadingFallback />}>
              <PromptDrill sample={sample} />
            </Suspense>
          )}
        </div>
      </div>
    </section>
  );
}
