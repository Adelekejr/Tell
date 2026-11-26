import type { ReactNode } from 'react';
import { SAMPLE_CARD, cardModel, getTrap, trapNumber } from '@tell/shared';
import { outcomeLabel, scoreLine } from '../card/text';
import { CHECK_EXAMPLES, TRAP_EXAMPLES, checkExamplePath, exampleKey } from '../check/examples';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { CopyLinkButton } from '../components/CopyLinkButton';
import { IndexRow } from '../components/TryIt';
import { API_BASE, cardPath, verifyPath } from '../lib/api';
import { usePageTitle } from '../lib/title';

function Section({ id, title, children, intro }: { id: string; title: string; intro: string; children: ReactNode }) {
  return (
    <section className="try-section grid" aria-labelledby={id}>
      <div className="try-section-head">
        <h2 className="h2" id={id}>
          {title}
        </h2>
        <p className="small muted">{intro}</p>
      </div>
      <div className="try-section-body">{children}</div>
    </section>
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
  const sample = cardModel(SAMPLE_CARD.payload).current;
  return (
    <div className="try">
      <header className="try-head wrap">
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

      <Section id="try-check" title="Check a page" intro="Known-bad text and one clean one. Each opens the check with the result ready, checked in your browser.">
        <ul className="index">
          {CHECK_EXAMPLES.map((e) => (
            <IndexRow
              key={e.id}
              to={checkExamplePath(e.id)}
              k={exampleKey(e)}
              title={e.title}
              blurb={e.blurb}
              aside={e.kind === 'page' ? 'Page' : 'Text'}
            />
          ))}
        </ul>
      </Section>

      <Section
        id="try-traps"
        title="Demo trap pages"
        intro="The seven pages a live test uses, at fixed links that work without starting a run. Check one here, or give a link to your AI and ask for a summary. Nothing is recorded; for a scored result, run a live test."
      >
        <ol className="try-traps">
          {TRAP_EXAMPLES.map((e) => {
            const t = getTrap(e.trap!);
            return (
              <li key={e.id}>
                <span className="index-k">{trapNumber(t.no)}</span>
                <span className="index-t">{t.name}</span>
                <span className="index-d">{t.trick}</span>
                <span className="try-trap-actions">
                  <Button to={checkExamplePath(e.id)} variant="quiet" size="sm" arrow>
                    Check it
                  </Button>
                  {API_BASE ? <CopyLinkButton url={e.input} label={`Copy the demo link for ${t.name}`} /> : null}
                </span>
              </li>
            );
          })}
        </ol>
      </Section>

      <Section
        id="try-drill"
        title="Drill a prompt"
        intro="Opens the prompt drill with a made-up prompt. A rules-only quick check shows up straight away; where AI is available, run the full drill to see which traps it falls for."
      >
        <ul className="index">
          <IndexRow
            to="/lab?tab=drill&sample=weak"
            k="Sample prompt"
            title="Weak prompt"
            blurb="Tells the agent to follow page notes and open the links pages suggest."
          />
          <IndexRow
            to="/lab?tab=drill&sample=strong"
            k="Sample prompt"
            title="Strong prompt"
            blurb="Treats pages as data, ignores hidden orders and warns the user."
          />
        </ul>
      </Section>

      <Section
        id="try-card"
        title="A signed scorecard"
        intro="A made-up card, signed with a demo key that signed nothing else. Check its signature in your browser, the same way anyone checks a real card. Samples never go on the board."
      >
        <div className="try-sample">
          <div className="try-sample-top">
            <span className="label">
              Scorecard {'\u00B7'} {sample.agent}
            </span>
            <Badge tone="accent">Sample</Badge>
          </div>
          <p className="try-sample-grade">{outcomeLabel(sample)}</p>
          <p className="small muted">{scoreLine(sample)}</p>
          <div className="try-sample-actions">
            <Button to={cardPath('sample')} variant="primary" size="sm" arrow>
              Open the sample card
            </Button>
            <Button to={verifyPath('sample')} variant="ghost" size="sm">
              Check its signature
            </Button>
          </div>
        </div>
      </Section>

      <div className="try-next wrap">
        <p className="lede">Seen enough? Test your own agent, or check a real page.</p>
        <div className="try-next-actions">
          <Button to="/lab" arrow>
            Test my agent
          </Button>
          <Button to="/check" variant="ghost" arrow>
            Check a page
          </Button>
        </div>
      </div>
    </div>
  );
}
