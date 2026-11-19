import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { AnswerSource } from '@tell/shared';
import { isConfigured } from '../ai/config';
import type { AiProblem } from '../ai/modes';
import { PROBLEM_TEXT, classifyAiError } from '../ai/modes';
import { checkDeviceAvailability } from '../ai/source';
import type { DeviceAvailability } from '../ai/source';
import type * as Hybrid from '../ai/hybrid';
import type { CheckView } from '../check/analyse';
import { analyseHtml, analyseText } from '../check/analyse';
import { EXAMPLE_HTML, EXAMPLE_URL } from '../check/example';
import type { Explanation } from '../check/explain';
import { MAX_EXPLAINED, buildExplainPrompt, parseExplanation } from '../check/explain';
import { MAX_TEXT, asLink, hostOf } from '../check/input';
import { InferenceBadge } from '../components/Badge';
import { Button } from '../components/Button';
import { CheckSplit } from '../components/CheckSplit';
import { FindingCard } from '../components/FindingCard';
import { Textarea } from '../components/Field';
import { AlertIcon, HeldIcon } from '../components/icons';
import { cloudReady, pickEngine } from '../drill/engine';
import { ASK_TIMEOUT_MS, withTimeout } from '../drill/run';
import { ApiError, fetchPage } from '../lib/api';
import { usePageTitle } from '../lib/title';

type HybridModule = typeof Hybrid;
const loadHybrid = (() => {
  let p: Promise<HybridModule> | null = null;
  return () => (p ??= import('../ai/hybrid'));
})();

const FETCH_TEXT: Record<string, string> = {
  'not-configured': 'Link checks aren\u2019t switched on here yet. Copy the page\u2019s text and paste it instead.',
  network: 'Couldn\u2019t reach Tell\u2019s server. Check your connection, or paste the page\u2019s text instead.',
  'app-check': 'This browser couldn\u2019t be verified. Reload the page and try again.',
};

type Explain =
  | { status: 'idle' }
  | { status: 'running' }
  | { status: 'done'; data: Explanation; source: AnswerSource }
  | { status: 'failed'; problem: AiProblem };

const SHOWN = 8;

function Verdict({ view }: { view: CheckView }) {
  const n = view.hiddenLines;
  const others = view.findings.length;
  if (n > 0) {
    return (
      <div className="check-verdict is-found" role="status">
        <AlertIcon />
        <div>
          <p className="check-verdict-head">
            {n} hidden {n === 1 ? 'line' : 'lines'} found.
          </p>
          <p className="check-verdict-sub">You can{'\u2019'}t see {n === 1 ? 'it' : 'them'}. An AI reading this {view.source === 'text' ? 'text' : 'page'} can.</p>
        </div>
      </div>
    );
  }
  if (others > 0) {
    return (
      <div className="check-verdict is-found" role="status">
        <AlertIcon />
        <div>
          <p className="check-verdict-head">
            {others} {others === 1 ? 'thing' : 'things'} to know.
          </p>
          <p className="check-verdict-sub">Nothing is hidden from view, but an AI could be steered by what{'\u2019'}s below.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="check-verdict is-clear" role="status">
      <HeldIcon />
      <div>
        <p className="check-verdict-head">Nothing hidden found.</p>
        <p className="check-verdict-sub">
          Tell looked for the 7 tricks it knows. That{'\u2019'}s a good sign, not a guarantee.
        </p>
      </div>
    </div>
  );
}

/**
 * The check page, for everyone: paste a link or some text and see what you
 * see next to what an AI reads. The rules decide what is hidden; Gemini only
 * explains it in plain words, and says where it ran.
 */
export function Check() {
  usePageTitle('Check a page');
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<CheckView | null>(null);
  const [meta, setMeta] = useState<string | null>(null);
  const [allowCloud, setAllowCloud] = useState(false);
  const [device, setDevice] = useState<DeviceAvailability | null>(null);
  const [explain, setExplain] = useState<Explain>({ status: 'idle' });
  const [showAll, setShowAll] = useState(false);
  const result = useRef<HTMLDivElement | null>(null);
  const seq = useRef(0);
  const [runKey, setRunKey] = useState(0);

  useEffect(() => {
    let live = true;
    void checkDeviceAvailability().then((d) => live && setDevice(d));
    return () => {
      live = false;
    };
  }, []);

  const cloudOk = cloudReady();
  /** Pasted text needs the switch for the cloud; a public page doesn't. */
  const engineFor = (v: CheckView, cloud = allowCloud) => pickEngine(v.source === 'text' ? cloud : true, device, cloudOk);

  async function runExplain(v: CheckView, cloud = allowCloud) {
    const engine = engineFor(v, cloud);
    if (!engine.mode || !v.findings.length) return;
    const id = seq.current;
    setExplain({ status: 'running' });
    try {
      const m = await loadHybrid();
      const answer = await withTimeout(m.askExplain(buildExplainPrompt(v.findings), engine.mode), ASK_TIMEOUT_MS);
      if (id !== seq.current) return;
      const data = parseExplanation(answer.text, v.findings.length);
      setExplain(data ? { status: 'done', data, source: answer.source } : { status: 'failed', problem: 'bad-output' });
    } catch (e) {
      if (id === seq.current) setExplain({ status: 'failed', problem: classifyAiError(e) });
    }
  }

  function show(v: CheckView, about: string | null) {
    seq.current += 1;
    setRunKey((k) => k + 1);
    setView(v);
    setMeta(about);
    setShowAll(false);
    setExplain({ status: 'idle' });
    requestAnimationFrame(() => result.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }));
    void runExplain(v);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const raw = input.trim();
    setError(null);
    if (!raw) {
      setError('Paste a link (like https://example.com/page) or some text first.');
      return;
    }
    const link = asLink(raw);
    if (!link) {
      if (raw.length > MAX_TEXT) {
        setError('That\u2019s a lot of text. Paste up to 200,000 characters at a time.');
        return;
      }
      show(analyseText(raw), 'Your pasted text. It stayed in this browser.');
      return;
    }
    setLoading(true);
    try {
      const page = await fetchPage(link);
      const v = page.kind === 'html' ? analyseHtml(page.body, { url: page.url }) : { ...analyseText(page.body), source: 'link' as const, url: page.url };
      const bits = [`From ${hostOf(page.url)}`];
      if (page.redirects) bits.push(`${page.redirects} redirect${page.redirects > 1 ? 's' : ''} followed`);
      if (page.stylesheets) bits.push(`${page.stylesheets} style sheet${page.stylesheets > 1 ? 's' : ''} read`);
      show(v, bits.join(' \u00B7 '));
    } catch (err) {
      const code = err instanceof ApiError ? err.code : 'network';
      setError(FETCH_TEXT[code] ?? (err instanceof ApiError ? err.message : FETCH_TEXT.network) ?? null);
    } finally {
      setLoading(false);
    }
  }

  function tryExample() {
    setInput(EXAMPLE_URL);
    setError(null);
    show(analyseHtml(EXAMPLE_HTML, { url: EXAMPLE_URL, source: 'example' }), 'Example page (made up, checked in this browser)');
  }

  function toggleCloud(on: boolean) {
    setAllowCloud(on);
    if (on && view && view.source === 'text' && explain.status !== 'done' && explain.status !== 'running') void runExplain(view, true);
  }

  const engine = view ? engineFor(view) : null;
  const effects = explain.status === 'done' ? explain.data.effects : null;
  const findings = view ? (showAll ? view.findings : view.findings.slice(0, SHOWN)) : [];

  return (
    <section className="check">
      <header className="check-head">
        <p className="label">Check a page</p>
        <h1 className="h1">
          See what
          <br /> your AI reads.
        </h1>
        <p className="lede muted check-lede">
          Paste a link or some text. Tell shows the lines people can{'\u2019'}t see but an AI can.
        </p>
      </header>

      <form className="check-form" onSubmit={(e) => void onSubmit(e)} noValidate>
        <Textarea
          label="Link or text"
          rows={2}
          value={input}
          placeholder={'https://\u2026 or paste some text'}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && asLink(input)) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
          error={error ?? undefined}
          hint={'Pasted text stays in this browser. Links are opened by Tell\u2019s server, which doesn\u2019t keep them.'}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
        <div className="check-actions">
          <Button type="submit" variant="accent" arrow loading={loading} loadingLabel="Opening the page">
            Check it
          </Button>
          <button type="button" className="linkish" onClick={tryExample}>
            Try an example
          </button>
        </div>
      </form>

      {view ? (
        <div className="check-result" ref={result} key={runKey}>
          <Verdict view={view} />
          {meta ? <p className="small muted check-meta">{meta}</p> : null}
          <CheckSplit view={view} />

          {view.findings.length ? (
            <div className="findings">
              {explain.status === 'done' && explain.data.summary ? (
                <div className="check-summary">
                  <p className="label">In plain words</p>
                  <p className="check-summary-text">{explain.data.summary}</p>
                  <InferenceBadge source={explain.source} />
                </div>
              ) : null}
              {findings.map((f, i) => {
                const text = effects?.get(i);
                return (
                  <FindingCard
                    key={`${f.rule}-${i}`}
                    finding={f}
                    effect={text && explain.status === 'done' ? { text, source: explain.source } : null}
                    explaining={explain.status === 'running' && i < MAX_EXPLAINED}
                  />
                );
              })}
              {view.findings.length > SHOWN && !showAll ? (
                <Button variant="ghost" size="sm" onClick={() => setShowAll(true)}>
                  Show {view.findings.length - SHOWN} more
                </Button>
              ) : null}
            </div>
          ) : null}

          {view.findings.length ? (
            <p className="small muted check-ai-note" aria-live="polite">
              {explain.status === 'failed'
                ? `No plain explanation this time. ${PROBLEM_TEXT[explain.problem]} The findings above come from Tell\u2019s rules and stand on their own.`
                : engine && !engine.mode
                  ? `Plain explanations from Gemini aren\u2019t available here. ${isConfigured ? engine.line : PROBLEM_TEXT['not-configured']} The findings above come from Tell\u2019s rules and stand on their own.`
                  : 'Tell\u2019s rules decide what is hidden. Gemini only explains it, and can\u2019t overrule a rule.'}
            </p>
          ) : null}

          <label className={`drill-switch${cloudOk ? '' : ' is-disabled'}`}>
            <input
              type="checkbox"
              role="switch"
              checked={allowCloud && cloudOk}
              disabled={!cloudOk}
              onChange={(e) => toggleCloud(e.target.checked)}
            />
            <span className="drill-switch-track" aria-hidden="true" />
            <span>
              <span className="h4">Allow cloud for pasted text</span>
              <span className="small muted">
                {cloudOk
                  ? 'Off keeps your text on this device. On lets Gemini in the cloud explain it.'
                  : 'Off. The cloud isn\u2019t set up for this copy of Tell yet, so pasted text never leaves this device.'}
              </span>
            </span>
          </label>

          <Button
            variant="ghost"
            onClick={() => {
              seq.current += 1;
              setView(null);
              setInput('');
              setExplain({ status: 'idle' });
              window.scrollTo?.({ top: 0, behavior: 'smooth' });
            }}
          >
            Check something else
          </Button>
        </div>
      ) : (
        <p className="small muted check-how">
          Tell looks for 7 tricks: hidden text, notes in the page code, invisible letters, coded messages, orders tucked into links,
          leaky images and fake system messages.
        </p>
      )}
    </section>
  );
}
