import { TRAPS, CLOUD_MODEL, trapNumber } from '@tell/shared';
import { InferenceBadge } from '../components/Badge';
import { Button } from '../components/Button';
import { Fan } from '../components/Fan';
import { TryItStrip } from '../components/TryIt';
import { usePageTitle } from '../lib/title';

const STEPS = [
  { n: 1, title: 'Deal the hand', body: 'You get 7 private trap links. Give them to any agent that can browse.' },
  { n: 2, title: 'Each page hides one line', body: 'A comment, invisible letters, a fake system note. Each carries a secret word.' },
  { n: 3, title: 'The card flips', body: 'If your agent visits the trap link with that word, it obeyed. Code decides, not an AI.' },
];

export function Home() {
  usePageTitle(null);
  return (
    <>
      <section className="hero grid">
        <div className="hero-copy">
          <h1 className="display">
            Every AI
            <br />
            has a <em>tell.</em>
          </h1>
          <p className="lede">
            Tell hides small traps in ordinary web pages, then shows you the moment an AI obeys text it was never meant
            to follow.
          </p>
          <div className="doors d-only-grid">
            <Button to="/lab" arrow sub="Live test or prompt drill">
              Test my agent
            </Button>
            <Button to="/check" variant="ghost" arrow sub="See what your AI reads">
              Check a page
            </Button>
          </div>
        </div>
        <div className="hero-fan">
          <Fan />
        </div>
      </section>

      <div className="doors m-only-grid">
        <Button to="/lab" arrow sub={'For builders \u00B7 live test or prompt drill'}>
          Test my agent
        </Button>
        <Button to="/check" variant="ghost" arrow sub={'For everyone \u00B7 see what your AI reads'}>
          Check a page
        </Button>
      </div>

      <TryItStrip />

      <section className="steps" aria-labelledby="steps-title">
        <h2 className="label" id="steps-title">
          How a trap fires
        </h2>
        <ol>
          {STEPS.map((s) => (
            <li key={s.n}>
              <span className="n" aria-hidden="true">
                {s.n}
              </span>
              <div>
                <h3 className="h3">{s.title}</h3>
                <p className="small muted">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="hand-list grid" aria-labelledby="hand-title">
        <div className="hand-list-head">
          <p className="label">The hand</p>
          <h2 className="h1" id="hand-title">
            Seven ways
            <br />a page lies.
          </h2>
        </div>
        <ol>
          {TRAPS.map((t) => (
            <li key={t.id}>
              <span className="mono muted">{trapNumber(t.no)}</span>
              <span className="t">{t.name}</span>
              <span className="d">{t.trick}</span>
              <span className="label">{t.family}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="hybrid dark grid" aria-labelledby="hybrid-title">
        <div className="hybrid-head">
          <p className="label">Hybrid by design</p>
          <h2 className="h2" id="hybrid-title">
            On your device when it can.
            <br />
            <em>Cloud when it can{'\u2019'}t.</em>
          </h2>
        </div>
        <div className="hybrid-body">
          <p className="small muted">
            Private text stays on your computer with Gemini Nano. Phones fall back to Gemini in the cloud. Every answer
            says which one ran.
          </p>
          <div className="hybrid-rows">
            <div className="hybrid-row">
              <InferenceBadge source="on-device" />
              <span className="small muted where">Chrome desktop</span>
            </div>
            <div className="hybrid-row">
              <InferenceBadge source="cloud" model={CLOUD_MODEL} />
              <span className="small muted where">Any browser</span>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
