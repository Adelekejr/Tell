import { useMemo, useState } from 'react';
import { useParams } from 'react-router';
import type { CardView, RunEvent, RunView } from '@tell/shared';
import { TRAPS, eventText, getTrap } from '@tell/shared';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Textarea } from '../components/Field';
import { Notice } from '../components/Notice';
import { TaskBox } from '../components/TaskBox';
import { TrapCard } from '../components/TrapCard';
import { ApiError, checkReply, finishRun } from '../lib/api';
import { clock } from '../lib/copy';
import { evidenceFor, headline } from '../lib/runText';
import { useRun } from '../lib/useRun';
import { usePageTitle } from '../lib/title';

function Tally({ run }: { run: RunView }) {
  const items = [
    ['Fired', run.tally.fired],
    ['Held', run.tally.held],
    ['Suspicious', run.tally.suspicious],
    ['Waiting', run.tally.waiting],
  ] as const;
  return (
    <dl className="tally">
      {items.map(([label, n]) => (
        <div key={label}>
          <dt className="label">{label}</dt>
          <dd key={`${label}-${n}`} className="tally-n">
            {n}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Timeline({ events }: { events: RunEvent[] }) {
  return (
    <section className="ticker" aria-labelledby="what-happened">
      <div className="ticker-head">
        <h2 id="what-happened" className="label">
          What happened
        </h2>
        <Badge tone="outline">Server-witnessed</Badge>
      </div>
      {events.length === 0 ? (
        <p className="small muted ticker-empty">Nothing yet. The first visit to a trap shows up here.</p>
      ) : (
        <ol className="ticker-list">
          {events.map((e) => {
            const { lead, rest } = eventText(e);
            return (
              <li key={`${e.at}-${e.trapId}-${e.kind}`} className={`ticker-row is-${e.kind}`}>
                <span className="mono muted">{clock(e.at)}</span>
                <span>
                  <b>{lead}</b> {rest}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function ReplyBox({ run, onRun }: { run: RunView; onRun: (r: RunView) => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    if (!text.trim()) {
      setError('Paste what your agent wrote back first.');
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const r = await checkReply(run.id, text);
      onRun(r.run);
      setResult(
        r.matched.length === 0
          ? 'No secret word or canary link in that reply. Nothing fired.'
          : `Found ${r.matched.map((id) => getTrap(id).name).join(', ')} in the reply.${r.recorded.length ? ' The card flipped.' : ' Already counted.'}`,
      );
      setText('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Couldn\u2019t check the reply. Retry.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="echo">
      <Textarea
        label={'Agent can\u2019t browse? Paste its reply.'}
        hint="Tell checks it for secret words and canary links, then throws the text away."
        placeholder="Paste what your agent wrote back"
        rows={3}
        value={text}
        maxLength={20000}
        onChange={(e) => setText(e.target.value)}
        error={error ?? undefined}
      />
      <div className="echo-actions">
        <Button size="sm" variant="ghost" onClick={submit} loading={busy} loadingLabel={'Checking\u2026'}>
          Check the reply
        </Button>
        {result ? (
          <p className="small" role="status">
            {result}
          </p>
        ) : null}
      </div>
    </section>
  );
}

/** Announces new results for screen readers: "The Whisper fired at 14:02". */
function useAnnouncements(run: RunView | null): string {
  const [prev, setPrev] = useState<RunView | null>(run);
  const [message, setMessage] = useState('');
  if (run !== prev) {
    setPrev(run);
    if (prev && run) {
      const before = new Map(prev.cards.map((c) => [c.trapId, c.state]));
      const lines = run.cards
        .filter((c) => c.state !== 'waiting' && before.get(c.trapId) !== c.state)
        .map((c) => {
          const word = c.state === 'fired' || c.state === 'echo' ? 'fired' : c.state === 'held' ? 'held' : 'looks suspicious';
          return `${getTrap(c.trapId).name} ${word}${c.at ? ` at ${clock(c.at, false)}` : ''}.`;
        });
      if (lines.length) setMessage(lines.join(' '));
    }
  }
  return message;
}

export function Run() {
  const { id = '' } = useParams();
  usePageTitle('Live run');
  const validId = /^[a-z2-7]{26}$/.test(id);
  const { run, error, offline, refresh, replace } = useRun(validId ? id : '');
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);
  const announcement = useAnnouncements(run);
  const finished = run ? run.status !== 'open' : false;
  const head = useMemo(() => (run ? headline(run) : null), [run]);

  if (!run) {
    const missing = !validId || error?.status === 404;
    return (
      <section className="run wrap">
        <div className="run-loading" aria-live="polite">
          {missing || error ? (
            <>
              <h1 className="h1">{missing ? 'That run isn\u2019t on the table.' : 'Couldn\u2019t reach the run.'}</h1>
              <Notice role="alert">
                {missing ? 'That run doesn\u2019t exist or has expired. Runs last 24 hours.' : error?.message}
              </Notice>
              <div className="run-retry">
                {missing ? (
                  <Button to="/lab" arrow>
                    Start a new run
                  </Button>
                ) : (
                  <Button onClick={refresh} arrow>
                    Retry
                  </Button>
                )}
              </div>
            </>
          ) : (
            <>
              <h1 className="sr-only">Live run</h1>
              <span className="hairline" aria-hidden="true" />
              <p className="label">Dealing 7 cards{'\u2026'}</p>
            </>
          )}
        </div>
      </section>
    );
  }

  const finish = async () => {
    setFinishing(true);
    setFinishError(null);
    try {
      replace(await finishRun(run.id));
    } catch (err) {
      setFinishError(err instanceof ApiError ? err.message : 'Couldn\u2019t finish the run. Retry.');
    } finally {
      setFinishing(false);
    }
  };

  return (
    <section className="run">
      {offline ? (
        <div className="offline-strip" role="status">
          Offline. Cards will catch up when you{'\u2019'}re back.
        </div>
      ) : null}
      <div className="run-grid wrap">
        <header className="run-head">
          <div className="run-meta">
            <span className="label">Run {run.label}</span>
            <span className="label">
              {run.status === 'open' ? (
                <span className="live-word">
                  <i aria-hidden="true" />
                  Live
                </span>
              ) : run.status === 'finished' ? (
                'Finished'
              ) : (
                'Expired'
              )}
              {' \u00B7 '}Started {clock(run.createdAt, false)}
            </span>
          </div>
          <h1 className="h1 run-title">{head?.title}</h1>
          {head?.sub ? <p className="lede muted run-sub">{head.sub}</p> : null}
          <Tally run={run} />
        </header>

        <div className="run-hand">
          <div className="hand" aria-label="Your hand of seven traps">
            {TRAPS.map((trap, i) => {
              const card = run.cards[i] as CardView;
              const { evidence, backLabel } = evidenceFor(card, finished);
              return <TrapCard key={trap.id} trap={trap} state={card.state} evidence={evidence} backLabel={backLabel} />;
            })}
          </div>
          <p className="sr-only" aria-live="polite">
            {announcement}
          </p>
        </div>

        <aside className="run-side">
          <Timeline events={run.events} />
          {run.status === 'open' ? <ReplyBox run={run} onRun={replace} /> : null}
          <details className="run-task">
            <summary className="small">Show the task for your agent again</summary>
            <TaskBox task={run.task} />
          </details>
        </aside>
      </div>

      <div className="sticky-bar">
        <div className="sticky-inner">
          {finishError ? <Notice role="alert">{finishError}</Notice> : null}
          {run.status === 'open' ? (
            <Button
              onClick={finish}
              loading={finishing}
              loadingLabel={'Finishing\u2026'}
              arrow
              sub={run.tally.waiting > 0 ? `${run.tally.waiting} still face down` : 'Every card has a result'}
            >
              Finish run
            </Button>
          ) : (
            <Button to="/lab" arrow sub="Signed scorecards arrive in the next update">
              Start a new run
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
