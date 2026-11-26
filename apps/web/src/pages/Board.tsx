import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import type { BoardEntry, BoardRange } from '@tell/shared';
import { gradeFor } from '@tell/shared';
import { Button } from '../components/Button';
import { Notice } from '../components/Notice';
import { ApiError, getBoard } from '../lib/api';
import { usePageTitle } from '../lib/title';

type Filter = 'week' | 'all' | 'poker';
const FILTERS: [Filter, string][] = [
  ['week', 'This week'],
  ['all', 'All time'],
  ['poker', 'Poker Face only'],
];

type Load = { status: 'loading' } | { status: 'failed'; message: string } | { status: 'ready'; entries: BoardEntry[] };

const day = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

function Strip({ cells }: { cells: BoardEntry['cells'] }) {
  return (
    <span className="strip" aria-hidden="true">
      {cells.map((c, i) => (
        <span key={i} className={`m is-${c}`} />
      ))}
    </span>
  );
}

/** The public board: live-tested agents only, read through Tell's API. */
export function Board() {
  usePageTitle('Board');
  const [filter, setFilter] = useState<Filter>('week');
  const [state, setState] = useState<{ filter: Filter; load: Load }>({ filter, load: { status: 'loading' } });

  useEffect(() => {
    let live = true;
    const ctrl = new AbortController();
    const range: BoardRange = filter === 'all' || filter === 'poker' ? 'all' : 'week';
    getBoard(range, filter === 'poker', ctrl.signal)
      .then((page) => live && setState({ filter, load: { status: 'ready', entries: page.entries } }))
      .catch((err: unknown) => {
        if (live) setState({ filter, load: { status: 'failed', message: err instanceof ApiError ? err.message : 'Couldn\u2019t load the board.' } });
      });
    return () => {
      live = false;
      ctrl.abort();
    };
  }, [filter]);

  const load: Load = state.filter === filter ? state.load : { status: 'loading' };

  return (
    <section className="board wrap">
      <p className="label">The board {'\u00B7'} live tests only</p>
      <h1 className="h1 board-title">
        Who kept
        <br /> a poker face.
      </h1>
      <div className="filters" role="group" aria-label="Show">
        {FILTERS.map(([id, label]) => (
          <button key={id} type="button" className="chip" aria-pressed={filter === id} onClick={() => setFilter(id)}>
            {label}
          </button>
        ))}
      </div>

      {load.status === 'loading' ? (
        <p className="label board-wait" aria-live="polite">
          Loading the board{'\u2026'}
        </p>
      ) : load.status === 'failed' ? (
        <div className="board-wait">
          <Notice role="alert">{load.message}</Notice>
        </div>
      ) : load.entries.length === 0 ? (
        <div className="board-empty">
          <p className="h2">{filter === 'all' ? 'No poker faces yet.' : 'No poker faces yet this week.'}</p>
          <Button to="/lab" arrow>
            Test my agent
          </Button>
        </div>
      ) : (
        <>
          <ol className="lb">
            {load.entries.map((e, i) => (
              <li key={e.cardId}>
                <span className="rk">{i + 1}</span>
                <Link className="nm" to={`/card/${e.cardId}`}>
                  {e.name}
                </Link>
                <span className="g">{gradeFor(e.held, e.tested).label}</span>
                <div className="meta">
                  <Strip cells={e.cells} />
                  <span className="mono muted">
                    {e.held}/{e.tested} held {'\u00B7'} {day(e.at)}
                  </span>
                </div>
              </li>
            ))}
          </ol>
          <p className="small muted board-legend">
            <span className="strip legend-cell" aria-hidden="true">
              <span className="m is-f" />
            </span>
            a trap that fired {'\u00B7'} every result on every entry was witnessed by Tell{'\u2019'}s server. Score = held out of
            traps that were read and fully watched; inconclusive visits and untested traps are left out.
          </p>
        </>
      )}

      <div className="howto">
        <h2 className="h3">How to get listed</h2>
        <p className="small muted">
          Run a live test, then tap <b>Add to board</b> on your scorecard. Only cards where Tell{'\u2019'}s server witnessed every result
          can join: prompt drills are browser-reported, and results found in a pasted reply are user-submitted, so neither is ranked.
        </p>
        <Button to="/lab" size="sm" arrow>
          Test my agent
        </Button>
      </div>
    </section>
  );
}
