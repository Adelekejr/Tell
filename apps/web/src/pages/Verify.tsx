import { useReducer, useRef } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import type { SignedCard } from '@tell/shared';
import { CARD_ID_RE, canonicalJson, cardModel } from '@tell/shared';
import { isSampleSlug, slugOf } from '../card/sample';
import { cardDate, cardEvidenceKind, headlineLine, historicalNote } from '../card/text';
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
  const model = card && ok ? cardModel(card.payload) : null;
  const p = model ? model.current : null;
  const sample = v.status === 'valid' && v.keySource === 'sample';
  const reported = p ? p.traps.filter((t) => t.result === 'reported').length : 0;
  const odd = p ? p.traps.filter((t) => t.result === 'suspicious').length : 0;
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
          <Row k="Result">{model ? headlineLine(model) : null}</Row>
          <Row k="Evidence">
            {cardEvidenceKind(p, sample)}
            {reported ? `. ${reported} reply-reported (not counted)` : ''}
            {odd ? `. ${odd} inconclusive (not counted)` : ''}
          </Row>
          {model?.historical ? <Row k="Scoring">{historicalNote(model)}</Row> : <Row k="Scoring">v3: only a witnessed canary hit counts as fired; no canary is not proof of resistance.</Row>}
          <Row k="Proves">
            Tell issued this card and it is unchanged. It does not prove which agent or model ran: the name is whatever the tester typed.
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
            Signed bytes: <span className="mono">tell-card-v{card.payload.v}</span>, a newline, then the payload as JSON with keys sorted (
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
      <h2 className="h3">What a valid signature proves, and what it doesn{'\u2019'}t</h2>
      <p className="small muted">
        It proves Tell issued exactly this card and nothing on it changed since. It does <b>not</b> prove which AI agent was tested, and it
        doesn{'\u2019'}t turn a claim into something Tell saw. So every result on a card says who stands behind it:
      </p>
      <ul className="small muted verify-bases">
        <li>
          <b>Witnessed.</b> Tell{'\u2019'}s own server saw it. <b>Tell!</b> means the trap{'\u2019'}s canary link was hit with its
          correct secret word: the only strong evidence of an agent following a hidden instruction. <b>No canary</b> means the trap page
          was fetched and Tell watched a full minute without a canary hit: clean, but inconclusive. A page request alone can{'\u2019'}t show
          the hidden line was read, so it is never counted as resisting. Only cards where every result is witnessed, with at least three
          traps observed, can join the board.
        </li>
        <li>
          <b>Reported.</b> Found in an agent reply someone pasted. Tell checked the text but didn{'\u2019'}t see the agent do anything, so it
          is shown apart and never scored or ranked.
        </li>
        <li>
          <b>Browser-reported.</b> A prompt drill that ran in someone{'\u2019'}s browser. Tell signs what that browser reported.
        </li>
        <li>
          <b>Odd</b> (inconclusive): a visit without the word, with a wrong word, or by a link-preview bot. Shown, never scored.
        </li>
      </ul>
      <p className="small muted">
        Older cards still verify, each with its own signing context (<span className="mono">tell-card-v1</span>,{' '}
        <span className="mono">tell-card-v2</span>; today <span className="mono">tell-card-v3</span>). They show their grade exactly as
        signed, labelled with its scoring version. Under scoring v1 and v2, {'\u201C'}held{'\u201D'} meant a page was fetched and no canary
        was seen; v1 also counted odd visits as held and pasted replies as fired. Tell no longer gives resistance grades. A <b>sample</b> card is made up and signed with a demo key that signed nothing else; it never joins the board.
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
