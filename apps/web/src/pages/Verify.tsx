import { useReducer, useRef } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import type { SignedCard } from '@tell/shared';
import { CARD_ID_RE, canonicalJson } from '@tell/shared';
import { isSampleSlug, slugOf } from '../card/sample';
import { cardDate, gradeLabel } from '../card/text';
import type { Check } from '../card/useVerifiedCard';
import { checkCard, useVerifiedCard } from '../card/useVerifiedCard';
import type { Verdict } from '../card/verify';
import { readPasted } from '../card/verify';
import { Button } from '../components/Button';
import { Textarea } from '../components/Field';
import { Notice } from '../components/Notice';
import { AlertIcon, HeldIcon } from '../components/icons';
import { cardPath, verifyPath } from '../lib/api';
import { usePageTitle } from '../lib/title';
import { initialPasteCheckState, pasteCheckReducer } from './verify-state';

const WHY: Record<Exclude<Verdict, { status: 'valid' }>['reason'], string> = {
  malformed: 'This isn\u2019t a Tell card, or some of its fields were changed into something a card can\u2019t hold.',
  'unknown-key': 'It was signed with a key Tell doesn\u2019t publish, so it didn\u2019t come from Tell.',
  signature: 'The signature doesn\u2019t match the card. Something on it was edited after Tell signed it.',
};

function Row({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div>
      <dt className="label">{k}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Result({ card, check }: { card: SignedCard | null; check: Check }) {
  if (check.status === 'checking') {
    return (
      <div className="verify-verdict" aria-live="polite">
        <p className="h2">Checking the signature{'\u2026'}</p>
      </div>
    );
  }
  const v = check.verdict;
  const ok = v.status === 'valid';
  const p = card && ok ? card.payload : null;
  const sample = v.status === 'valid' && v.keySource === 'sample';
  return (
    <div aria-live="polite">
      <div className={`verify-verdict ${ok ? 'is-valid' : 'is-invalid'}`} role="status">
        {ok ? <HeldIcon /> : <AlertIcon />}
        <div>
          <p className="h2">{sample ? 'Valid sample.' : ok ? 'Signature valid.' : 'Signature not valid.'}</p>
          <p className="small">
            {sample
              ? 'The signature checks out, and it was made with Tell\u2019s demo key. That key signed only this made-up sample, so it shows how checking works. It isn\u2019t a test result.'
              : ok
              ? 'Tell signed exactly this card, and nothing on it has changed since. Checked in this browser.'
              : WHY[(v as Exclude<Verdict, { status: 'valid' }>).reason]}
          </p>
        </div>
      </div>
      {p && card && v.status === 'valid' ? (
        <dl className="verify-facts">
          <Row k="Card">
            <Link to={cardPath(slugOf(card))} className="mono">
              {sample ? 'Sample card' : p.id}
            </Link>
          </Row>
          <Row k="Result">
            {gradeLabel(p)} {'\u00B7'} {p.score.held} of {p.score.tested} held
          </Row>
          <Row k="Kind">
            {sample
              ? 'Sample, made up (shaped like a live test card)'
              : p.witnessed
                ? 'Live test, witnessed by Tell\u2019s server'
                : 'Prompt drill, browser-reported'}
          </Row>
          {sample ? null : <Row k="Signed">{cardDate(p.issuedAt)}</Row>}
          <Row k="Key">
            <span className="mono">Ed25519 {'\u00B7'} {v.kid}</span>{' '}
            <span className="muted">
              {v.keySource === 'sample'
                ? '(demo key, built into Tell\u2019s code; it signed only this sample)'
                : v.keySource === 'pinned'
                  ? '(pinned in Tell\u2019s open-source code)'
                  : '(published by Tell at /keys.json)'}
            </span>
          </Row>
          <Row k="Checked with">{v.engine === 'web-crypto' ? 'Web Crypto, built into this browser' : '@noble/ed25519, running in this browser'}</Row>
          {p.promptHash ? (
            <Row k="Prompt">
              {check.promptOk === true
                ? 'Included, and it matches the signed fingerprint.'
                : check.promptOk === false
                  ? 'Included, but it does NOT match the signed fingerprint.'
                  : 'Fingerprint signed; the prompt itself isn\u2019t shown here.'}
            </Row>
          ) : null}
        </dl>
      ) : null}
      {card ? (
        <details className="verify-raw">
          <summary className="small">The exact signed data</summary>
          <pre className="mono">{JSON.stringify(card, null, 2)}</pre>
          <p className="small muted">
            Signed bytes: <span className="mono">tell-card-v1</span>, a newline, then the payload as JSON with keys sorted (
            {canonicalJson(card.payload).length} characters).
          </p>
        </details>
      ) : null}
    </div>
  );
}

function PasteCheck() {
  const navigate = useNavigate();
  const [state, dispatch] = useReducer(pasteCheckReducer, initialPasteCheckState);
  const requestId = useRef(0);
  const request = useRef<AbortController | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    const id = ++requestId.current;
    request.current?.abort();
    request.current = null;
    const read = readPasted(state.text);
    if (!read) {
      dispatch({ type: 'invalid', error: 'Paste a verify link or the card\u2019s JSON.', requestId: id });
      return;
    }
    if ('id' in read) {
      navigate(verifyPath(read.id));
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    dispatch({ type: 'checking', requestId: id });
    const { verdict, promptOk } = await checkCard(read.card, null);
    if (controller.signal.aborted || id !== requestId.current) return;
    dispatch({
      type: 'done',
      requestId: id,
      result: { card: verdict.status === 'valid' ? (read.card as SignedCard) : null, check: { status: 'done', verdict, promptOk } },
    });
  }
  return (
    <form className="verify-paste" onSubmit={(e) => void submit(e)} noValidate>
      <Textarea
        label="Check a card yourself"
        mono
        rows={4}
        value={state.text}
        onChange={(e) => dispatch({ type: 'text', text: e.target.value })}
        placeholder={'A verify link, or the card JSON ({"payload": \u2026, "sig": \u2026})'}
        error={state.error ?? undefined}
        hint={'Checked in this browser. Pasted JSON isn\u2019t sent anywhere.'}
        spellCheck={false}
      />
      <Button type="submit" variant="ghost" size="sm" arrow>
        Check signature
      </Button>
      {state.status === 'checking' ? <Result card={null} check={{ status: 'checking' }} /> : state.result ? <Result card={state.result.card} check={state.result.check} /> : null}
    </form>
  );
}

function Explainer() {
  return (
    <div className="verify-explain">
      <h2 className="h3">What {'\u201C'}witnessed{'\u201D'} means</h2>
      <p className="small muted">
        A <b>witnessed</b> card comes from a live test: Tell{'\u2019'}s server saw each trap page being read and each canary link being
        hit, and built the card from its own records. A <b>browser-reported</b> card comes from a prompt drill that ran in someone{'\u2019'}s
        browser. Tell signs what that browser reported, so the signature proves the card wasn{'\u2019'}t edited, not that Tell watched it.
        Only witnessed cards can join the board. A <b>sample</b> card is made up and signed with a demo key that signed nothing else; it never joins the board either.
      </p>
    </div>
  );
}

function ById({ id }: { id: string }) {
  const load = useVerifiedCard(id);
  if (load.status === 'loading') return <Result card={null} check={{ status: 'checking' }} />;
  if (load.status !== 'ready') {
    return <Notice role="alert">{load.status === 'missing' ? 'That card doesn\u2019t exist. Check the link.' : load.message}</Notice>;
  }
  return <Result card={load.record.card} check={load.check} />;
}

/** /v/:id checks one stored card; /verify checks a pasted one. Both run the check in the browser. */
export function Verify() {
  const { id } = useParams();
  usePageTitle('Verify');
  const valid = id && (CARD_ID_RE.test(id) || isSampleSlug(id)) ? id : null;
  return (
    <section className="verify wrap">
      <p className="label">Verify a scorecard</p>
      <h1 className="h1 verify-title">Is this card real?</h1>
      <p className="lede muted">Every Tell card is signed with Ed25519. This page checks the signature right here, in your browser.</p>
      <div className="verify-body">
        {id ? valid ? <ById id={valid} /> : <Notice role="alert">That isn{'\u2019'}t a card link.</Notice> : null}
        <Explainer />
        <PasteCheck />
      </div>
    </section>
  );
}
