import { useReducer, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useParams } from 'react-router';
import type { CardPayload, SignedCard } from '@tell/shared';
import { BOARD_REFUSAL, FIX_TIPS, boardEligibility, cardModel, checkAgentName, isSampleCard } from '@tell/shared';
import { drawCard, toPngBlob } from '../card/image';
import { slugOf } from '../card/sample';
import { cardDate, gradeLabel, legacyNote, scoreLine, shortUrl, siteUrl, trapName } from '../card/text';
import { useVerifiedCard } from '../card/useVerifiedCard';
import { Button } from '../components/Button';
import { Input } from '../components/Field';
import { Notice } from '../components/Notice';
import { ScoreSheet } from '../components/ScoreSheet';
import { CheckIcon, CopyIcon, ShareIcon } from '../components/icons';
import { initialSubmissionState, submissionReducer } from '../components/submission-state';
import { ApiError, addToBoard, verifyPath } from '../lib/api';
import { copyText } from '../lib/copy';
import { usePageTitle } from '../lib/title';

function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState<'idle' | 'copied' | 'failed'>('idle');
  return (
    <div className="linkbox">
      <span className="mono linkbox-text">{shortUrl(url)}</span>
      <button
        type="button"
        className="btn btn-primary btn-sm linkbox-copy"
        onClick={async () => setCopied((await copyText(url)) ? 'copied' : 'failed')}
        aria-label="Copy the verify link"
      >
        {copied === 'copied' ? <CheckIcon /> : <CopyIcon />}
        {copied === 'copied' ? 'Copied' : copied === 'failed' ? 'Select it' : 'Copy'}
      </button>
    </div>
  );
}

async function share(card: SignedCard, url: string): Promise<'shared' | 'copied' | 'failed'> {
  const p = cardModel(card.payload).current;
  const sample = isSampleCard(card);
  const text = sample
    ? 'A sample Tell scorecard. Check its signature yourself, then test your own agent.'
    : `${gradeLabel(p)}: ${scoreLine(p)}. Check the signature yourself.`;
  try {
    if (navigator.share) {
      const canvas = await drawCard(p, url, sample);
      const blob = canvas ? await toPngBlob(canvas) : null;
      const file = blob ? new File([blob], `tell-card-${p.id}.png`, { type: 'image/png' }) : null;
      const data: ShareData = file && navigator.canShare?.({ files: [file] }) ? { title: 'Tell scorecard', text, url, files: [file] } : { title: 'Tell scorecard', text, url };
      await navigator.share(data);
      return 'shared';
    }
  } catch (err) {
    if ((err as { name?: string }).name === 'AbortError') return 'shared';
  }
  return (await copyText(url)) ? 'copied' : 'failed';
}

async function saveImage(p: CardPayload, url: string, sample = false): Promise<boolean> {
  const canvas = await drawCard(p, url, sample);
  if (!canvas) return false;
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = `tell-card-${p.id}.png`;
  a.click();
  return true;
}

function BoardForm({ card, onAdded }: { card: SignedCard; onAdded: () => void }) {
  const [name, setName] = useState(card.payload.agent ?? '');
  const [submission, dispatch] = useReducer(submissionReducer, initialSubmissionState);
  const nextRequestId = useRef(0);
  const activeRequest = useRef<number | null>(null);
  const busy = submission.status === 'submitting';
  const error = submission.status === 'validation-error' || submission.status === 'error' ? submission.message : null;
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (activeRequest.current !== null) return;
    const requestId = ++nextRequestId.current;
    activeRequest.current = requestId;
    dispatch({ type: 'begin', requestId });
    const check = checkAgentName(name);
    if (!check.ok) {
      dispatch({ type: 'validation-error', requestId, message: check.reason });
      activeRequest.current = null;
      return;
    }
    try {
      await addToBoard(card.payload.id, check.name);
      if (activeRequest.current !== requestId) return;
      dispatch({ type: 'success', requestId });
      activeRequest.current = null;
      onAdded();
    } catch (err) {
      if (activeRequest.current !== requestId) return;
      dispatch({
        type: 'failure',
        requestId,
        message: err instanceof ApiError ? err.message : 'Couldn\u2019t add it. Retry in a moment.',
      });
      activeRequest.current = null;
    }
  }
  return (
    <form className="board-form" onSubmit={(e) => void submit(e)} noValidate>
      <Input
        label="Name on the board"
        value={name}
        maxLength={40}
        onChange={(e) => setName(e.target.value)}
        error={error ?? undefined}
        hint="Shown publicly with the score and date. Nothing else about you."
        autoComplete="off"
      />
      <Button type="submit" variant="primary" size="sm" loading={busy} loadingLabel={'Adding\u2026'}>
        Add to board
      </Button>
    </form>
  );
}

export function Scorecard() {
  const { id = '' } = useParams();
  usePageTitle('Scorecard');
  const load = useVerifiedCard(id);
  const [shareNote, setShareNote] = useState<string | null>(null);
  const [boardOpen, setBoardOpen] = useState(false);
  const [listedNow, setListedNow] = useState(false);

  if (load.status !== 'ready') {
    return (
      <section className="card-page wrap">
        <div className="run-loading" aria-live="polite">
          {load.status === 'loading' ? (
            <>
              <h1 className="sr-only">Scorecard</h1>
              <span className="hairline" aria-hidden="true" />
              <p className="label">Fetching the card{'\u2026'}</p>
            </>
          ) : (
            <>
              <h1 className="h1">{load.status === 'missing' ? 'That card isn\u2019t in the deck.' : 'Couldn\u2019t load the card.'}</h1>
              <Notice role="alert">{load.status === 'missing' ? 'Check the link. Cards are never listed, so a wrong link can\u2019t be guessed.' : load.message}</Notice>
              <div className="run-retry">
                <Button to="/lab" arrow>
                  Test my agent
                </Button>
              </div>
            </>
          )}
        </div>
      </section>
    );
  }

  const { record, check } = load;
  const card = record.card;
  const model = cardModel(card.payload);
  const p = model.current;
  const sample = isSampleCard(card);
  const vUrl = siteUrl(verifyPath(slugOf(card)));
  const fallen = p.traps.filter((t) => t.result === 'fired' || t.result === 'reported');
  const listed = record.listed || listedNow;
  const eligibility = boardEligibility(card.payload);
  const old = legacyNote(model);

  return (
    <section className="card-page">
      {sample ? (
        <div className="card-sample wrap">
          <Notice>
            <strong>This is a sample card.</strong> It{'\u2019'}s made up, to show what a scorecard looks like. No agent was tested,
            and samples never go on the board.
          </Notice>
        </div>
      ) : null}
      {old ? (
        <div className="card-sample wrap">
          <Notice>{old}</Notice>
        </div>
      ) : null}
      <div className="card-wrap">
        <ScoreSheet payload={p} kid={card.kid} check={check} legacy={Boolean(model.legacy)} />
        <p className="small muted card-date">
          {sample ? 'Sample \u00B7 signed with Tell\u2019s demo key' : `Signed ${cardDate(p.issuedAt)}`}
          {p.run ? ` \u00B7 run ${p.run}` : ''}
        </p>
      </div>

      <div className="card-below wrap">
        {fallen.length ? (
          <div className="card-tips">
            <p className="label">Fix tips</p>
            <ol>
              {fallen.map((t) => (
                <li key={t.trap}>
                  <h2 className="h3">{trapName(t.trap)}</h2>
                  <p className="small muted">{FIX_TIPS[t.trap]}</p>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
        <Button to="/lab?tab=drill" variant="ghost" size="sm" arrow className="card-harden">
          Harden my prompt
        </Button>

        {record.prompt ? (
          <details className="card-prompt">
            <summary className="small">Prompt on this card</summary>
            <pre className="mono">{record.prompt}</pre>
            <p className="small muted">
              {check.status === 'done' && check.promptOk ? 'Matches the fingerprint signed into the card.' : check.status === 'done' && check.promptOk === false ? 'Does NOT match the fingerprint signed into the card.' : ''}
            </p>
          </details>
        ) : null}

        <p className="label card-share-label">Share or verify</p>
        <CopyLink url={vUrl} />
        <div className="card-actions">
          <button
            type="button"
            className="btn btn-accent btn-sm"
            onClick={async () => {
              const r = await share(card, vUrl);
              setShareNote(r === 'copied' ? 'Link copied. Paste it anywhere.' : r === 'failed' ? 'Couldn\u2019t share. Copy the link above.' : null);
            }}
          >
            <ShareIcon />
            Share card
          </button>
          {sample ? (
            <Button to={verifyPath(slugOf(card))} variant="ghost" size="sm">
              Check its signature
            </Button>
          ) : p.kind === 'live' ? (
            listed && eligibility.ok ? (
              <Button to="/board" variant="ghost" size="sm">
                On the board
              </Button>
            ) : !eligibility.ok ? (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => void saveImage(p, vUrl, sample)}>
                Save image
              </button>
            ) : (
              <button type="button" className="btn btn-ghost btn-sm" aria-expanded={boardOpen} onClick={() => setBoardOpen((o) => !o)}>
                Add to board
              </button>
            )
          ) : (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void saveImage(p, vUrl, sample)}>
              Save image
            </button>
          )}
        </div>
        {shareNote ? (
          <p className="small" role="status">
            {shareNote}
          </p>
        ) : null}
        {boardOpen && !listed && !sample && eligibility.ok ? <BoardForm card={card} onAdded={() => setListedNow(true)} /> : null}
        <p className="small muted card-note">
          {sample
            ? 'Anyone can check a card the same way. To get a real one, run a live test in the Lab.'
            : !eligibility.ok
              ? `Anyone can check this card wasn\u2019t edited. ${BOARD_REFUSAL[eligibility.reason]}`
              : 'Anyone can check this card wasn\u2019t edited. Only live cards with every result witnessed by Tell\u2019s server can join the board.'}
          {p.kind === 'live' && eligibility.ok ? (
            <>
              {' '}
              <button type="button" className="linkish small" onClick={() => void saveImage(p, vUrl, sample)}>
                Save the card as an image
              </button>
            </>
          ) : null}
        </p>
      </div>
    </section>
  );
}
