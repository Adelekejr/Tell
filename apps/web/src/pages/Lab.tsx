import { useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { RUN_TTL_MS } from '@tell/shared';
import { Button } from '../components/Button';
import { Notice } from '../components/Notice';
import { TaskBox } from '../components/TaskBox';
import type { SavedRun } from '../lib/api';
import { ApiError, clearLastRun, createRun, loadLastRun, saveLastRun } from '../lib/api';
import { usePageTitle } from '../lib/title';

type Tab = 'live' | 'drill';
const HOURS = RUN_TTL_MS / 3_600_000;

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
  const [run, setRun] = useState<SavedRun | null>(() => loadLastRun());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const view = await createRun();
      saveLastRun(view);
      setRun({ id: view.id, label: view.label, task: view.task, expiresAt: view.expiresAt });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Retry in a moment.');
    } finally {
      setBusy(false);
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

function Drill() {
  return (
    <div className="lab-drill">
      <h2 className="h3">Drill a system prompt</h2>
      <p className="small muted">
        Paste your agent{'\u2019'}s system prompt and Gemini plays your agent against all 7 traps, on this device when it can. Results are
        marked <em>browser-reported</em>.
      </p>
      <Notice>The prompt drill arrives in the next update. The live test works today.</Notice>
    </div>
  );
}

export function Lab() {
  usePageTitle('Lab');
  const [tab, setTab] = useState<Tab>('live');
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
        <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} className="lab-tabpanel">
          {tab === 'live' ? <LiveTest /> : <Drill />}
        </div>
      </div>
    </section>
  );
}
