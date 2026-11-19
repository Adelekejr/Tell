import { useState } from 'react';
import { Link } from 'react-router';
import { SAMPLE_CARD, getTrap, trapNumber } from '@tell/shared';
import { gradeLabel } from '../card/text';
import { CHECK_EXAMPLES, TRAP_EXAMPLES, checkExamplePath } from '../check/examples';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { CheckIcon, CopyIcon } from '../components/icons';
import { API_BASE, cardPath, verifyPath } from '../lib/api';
import { copyText } from '../lib/copy';
import { usePageTitle } from '../lib/title';

function CopyButton({ url, label }: { url: string; label: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      aria-label={label}
      onClick={async () => setState((await copyText(url)) ? 'copied' : 'failed')}
    >
      {state === 'copied' ? <CheckIcon /> : <CopyIcon />}
      {state === 'copied' ? 'Copied' : state === 'failed' ? 'Couldn\u2019t copy' : 'Copy link'}
    </button>
  );
}

/**
 * /try: everything a first-time visitor can try in one tap, on any phone.
 * The check examples and the prompt quick check run on Tell's rules in the
 * browser, so they work with no AI at all. Everything here is labelled as an
 * example; nothing here reaches the board.
 */
export function Try() {
  usePageTitle('Try it');
  const sample = SAMPLE_CARD.payload;
  return (
    <section className="try wrap">
      <header className="try-head">
        <p className="label">Try it</p>
        <h1 className="h1">
          See a tell
          <br /> in seconds.
        </h1>
        <p className="lede muted">
          Made-up examples you can tap right now. No sign-up, no setup. Tell{'\u2019'}s rules find what{'\u2019'}s hidden, so
          they work on any phone, even with no AI available.
        </p>
      </header>

      <section className="try-section" aria-labelledby="try-check">
        <div className="try-section-head">
          <p className="label">1 {'\u00B7'} Check a page</p>
          <h2 className="h3" id="try-check">
            Known-bad text, and one clean one
          </h2>
          <p className="small muted">Each opens the check with the result ready. Everything is checked in your browser.</p>
        </div>
        <ul className="try-grid">
          {CHECK_EXAMPLES.map((e) => (
            <li key={e.id}>
              <Link to={checkExamplePath(e.id)} className={`try-card${e.bad ? '' : ' is-clean'}`}>
                <span className="try-card-top">
                  <span className="label">{e.trap ? getTrap(e.trap).name : e.bad ? 'Two tricks' : 'Clean'}</span>
                  <Badge tone={e.bad ? 'outline' : 'line'}>{e.kind === 'page' ? 'Page' : 'Text'}</Badge>
                </span>
                <span className="try-card-title">{e.title}</span>
                <span className="small muted">{e.blurb}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="try-section" aria-labelledby="try-traps">
        <div className="try-section-head">
          <p className="label">2 {'\u00B7'} Tell{'\u2019'}s demo trap pages</p>
          <h2 className="h3" id="try-traps">
            Seven real pages, always on
          </h2>
          <p className="small muted">
            The same pages a live test uses, at fixed links that work without starting a run. Check one here, or give a link to
            your AI and ask it for a summary. Nothing is recorded; for a scored result, run a live test.
          </p>
        </div>
        <ol className="try-traps">
          {TRAP_EXAMPLES.map((e) => {
            const t = getTrap(e.trap!);
            return (
              <li key={e.id}>
                <div className="try-trap-text">
                  <span className="mono muted">{trapNumber(t.no)}</span>
                  <span className="try-trap-name">{t.name}</span>
                  <span className="small muted">{t.trick}</span>
                </div>
                <div className="try-trap-actions">
                  <Button to={checkExamplePath(e.id)} variant="ghost" size="sm">
                    Check it
                  </Button>
                  {API_BASE ? <CopyButton url={e.input} label={`Copy the demo link for ${t.name}`} /> : null}
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="try-section" aria-labelledby="try-drill">
        <div className="try-section-head">
          <p className="label">3 {'\u00B7'} Drill a prompt</p>
          <h2 className="h3" id="try-drill">
            A weak prompt and a strong one
          </h2>
          <p className="small muted">
            Opens the prompt drill with a made-up prompt. A rules-only quick check shows up straight away; where AI is available,
            run the full drill to see which traps it falls for.
          </p>
        </div>
        <div className="try-pair">
          <Link to="/lab?tab=drill&sample=weak" className="try-card">
            <span className="label">Sample prompt</span>
            <span className="try-card-title">Weak prompt</span>
            <span className="small muted">Tells the agent to follow page notes and open the links pages suggest.</span>
          </Link>
          <Link to="/lab?tab=drill&sample=strong" className="try-card">
            <span className="label">Sample prompt</span>
            <span className="try-card-title">Strong prompt</span>
            <span className="small muted">Treats pages as data, ignores hidden orders and warns the user.</span>
          </Link>
        </div>
      </section>

      <section className="try-section" aria-labelledby="try-card">
        <div className="try-section-head">
          <p className="label">4 {'\u00B7'} A signed scorecard</p>
          <h2 className="h3" id="try-card">
            What a result looks like
          </h2>
          <p className="small muted">
            A made-up card, signed with a demo key that signed nothing else. Check its signature in your browser, the same way
            anyone checks a real card. Samples never go on the board.
          </p>
        </div>
        <div className="try-sample">
          <div className="try-sample-top">
            <span className="label">Scorecard {'\u00B7'} {sample.agent}</span>
            <Badge tone="accent">Sample</Badge>
          </div>
          <p className="try-sample-grade">{gradeLabel(sample)}</p>
          <p className="small muted">
            {sample.score.held} of {sample.score.tested} held
          </p>
          <div className="try-sample-actions">
            <Button to={cardPath('sample')} variant="primary" size="sm" arrow>
              Open the sample card
            </Button>
            <Button to={verifyPath('sample')} variant="ghost" size="sm">
              Check its signature
            </Button>
          </div>
        </div>
      </section>

      <div className="try-next">
        <p className="small muted">Seen enough? Test your own agent, or check a real page.</p>
        <div className="try-next-actions">
          <Button to="/lab" arrow>
            Test my agent
          </Button>
          <Button to="/check" variant="ghost" arrow>
            Check a page
          </Button>
        </div>
      </div>
    </section>
  );
}
