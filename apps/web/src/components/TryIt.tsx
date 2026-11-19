import { Link } from 'react-router';
import { CHECK_EXAMPLES, checkExamplePath, exampleKey } from '../check/examples';
import { cardPath } from '../lib/api';

/** Picks for the home page: three known-bad examples, the clean one and the sample card. */
const HOME_PICKS = ['white-text', 'invisible-letters', 'ai-order', 'clean'];

/** One ruled row in a list of things to open: key, title, one line, arrow. */
export function IndexRow({ to, k, title, blurb, aside }: { to: string; k: string; title: string; blurb: string; aside?: string }) {
  return (
    <li>
      <Link to={to} className="index-row">
        <span className="index-k">{k}</span>
        <span className="index-t">{title}</span>
        <span className="index-d">{blurb}</span>
        <span className="index-go" aria-hidden="true">
          {aside ? <span className="index-aside">{aside}</span> : null}
          {'\u2192'}
        </span>
      </Link>
    </li>
  );
}

/** The short "Try it" list on the home page. Everything opens in one tap and works with no AI. */
export function TryItStrip() {
  const picks = HOME_PICKS.map((id) => CHECK_EXAMPLES.find((e) => e.id === id)!).filter(Boolean);
  return (
    <section className="try-strip grid" aria-labelledby="try-strip-title">
      <div className="try-strip-head">
        <h2 className="h2" id="try-strip-title">
          Tap one. See what an AI <em>would</em> read.
        </h2>
        <p className="small muted">Made-up examples. Each opens with the result ready, and needs no AI.</p>
      </div>
      <div className="try-strip-body">
        <ul className="index">
          {picks.map((e) => (
            <IndexRow key={e.id} to={checkExamplePath(e.id)} k={exampleKey(e)} title={e.title} blurb={e.blurb} />
          ))}
          <IndexRow to={cardPath('sample')} k="Sample" title="A signed scorecard" blurb="What a result looks like, and how anyone checks it." />
        </ul>
        <Link to="/try" className="linkish try-more">
          All examples, demo trap pages and sample prompts {'\u2192'}
        </Link>
      </div>
    </section>
  );
}
