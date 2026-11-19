import { Link } from 'react-router';
import { getTrap, trapNumber } from '@tell/shared';
import { CHECK_EXAMPLES, checkExamplePath } from '../check/examples';
import { cardPath } from '../lib/api';

/** Picks for the home page: three known-bad examples, the clean one and the sample card. */
const HOME_PICKS = ['white-text', 'invisible-letters', 'ai-order', 'clean'];

/** The short "Try it" strip on the home page. Everything opens in one tap and works with no AI. */
export function TryItStrip() {
  const picks = HOME_PICKS.map((id) => CHECK_EXAMPLES.find((e) => e.id === id)!).filter(Boolean);
  return (
    <section className="try-strip" aria-labelledby="try-strip-title">
      <div className="try-strip-head">
        <p className="label">Try it now {'\u00B7'} made-up examples</p>
        <h2 className="h2" id="try-strip-title">
          Tap one. See what an AI <em>would</em> read.
        </h2>
      </div>
      <ul className="try-picks">
        {picks.map((e) => (
          <li key={e.id}>
            <Link to={checkExamplePath(e.id)} className="try-pick">
              <span className="label">{e.trap ? `${trapNumber(getTrap(e.trap).no)} \u00B7 ${getTrap(e.trap).name}` : e.bad ? 'Two tricks' : 'For comparison'}</span>
              <span className="try-pick-title">{e.title}</span>
              <span className="small muted">{e.blurb}</span>
            </Link>
          </li>
        ))}
        <li>
          <Link to={cardPath('sample')} className="try-pick">
            <span className="label">Sample</span>
            <span className="try-pick-title">A signed scorecard</span>
            <span className="small muted">What a result looks like, and how anyone checks it.</span>
          </Link>
        </li>
      </ul>
      <Link to="/try" className="linkish try-more">
        All examples, demo trap pages and sample prompts {'\u2192'}
      </Link>
    </section>
  );
}
