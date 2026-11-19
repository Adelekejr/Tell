import { useState } from 'react';
import type { FormEvent } from 'react';
import { useParams } from 'react-router';
import type { CardPayload, SignedCard } from '@tell/shared';
import { FIX_TIPS, checkAgentName } from '@tell/shared';
import { drawCard, toPngBlob } from '../card/image';
import { cardDate, gradeLabel, shortUrl, siteUrl, trapName } from '../card/text';
import { useVerifiedCard } from '../card/useVerifiedCard';
import { Button } from '../components/Button';
import { Input } from '../components/Field';
import { Notice } from '../components/Notice';
import { ScoreSheet } from '../components/ScoreSheet';
import { CheckIcon, CopyIcon, ShareIcon } from '../components/icons';
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
  const p = card.payload;
  const text = `${gradeLabel(p)}: ${p.score.held} of ${p.score.tested} traps held. Check the signature yourself.`;
  try {
    if (navigator.share) {
      const canvas = await drawCard(p, url);
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

async function saveImage(p: CardPayload, url: string): Promise<boolean> {
  const canvas = await drawCard(p, url);
  if (!canvas) return false;
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = `tell-card-${p.id}.png`;
  a.click();
  return true;
}

function BoardForm({ card, onAdded }: { card: SignedCard; onAdded: () => void }) {
  const [name, setName] = useState(card.payload.agent ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    const check = checkAgentName(name);
    if (!check.ok) {
      setError(check.reason);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await addToBoard(card.payload.id, check.name);
      onAdded();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Couldn\u2019t add it. Retry in a moment.');
      setBusy(false);
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
  const p = card.payload;
  const vUrl = siteUrl(verifyPath(p.id));
  const fallen = p.traps.filter((t) => t.result === 'fired');
  const listed = record.listed || listedNow;

  return (
    <section className="card-page">
      <div className="card-wrap">
        <ScoreSheet payload={p} kid={card.kid} check={check} />
        <p className="small muted card-date">
          Signed {cardDate(p.issuedAt)}
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
          {p.kind === 'live' ? (
            listed ? (
              <Button to="/board" variant="ghost" size="sm">
                On the board
              </Button>
            ) : (
              <button type="button" className="btn btn-ghost btn-sm" aria-expanded={boardOpen} onClick={() => setBoardOpen((o) => !o)}>
                Add to board
              </button>
            )
          ) : (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void saveImage(p, vUrl)}>
              Save image
            </button>
          )}
        </div>
        {shareNote ? (
          <p className="small" role="status">
            {shareNote}
          </p>
        ) : null}
        {boardOpen && !listed && p.kind === 'live' ? <BoardForm card={card} onAdded={() => setListedNow(true)} /> : null}
        <p className="small muted card-note">
          Anyone can check this card wasn{'\u2019'}t edited. Only live-tested cards can join the board.
          {p.kind === 'live' ? (
            <>
              {' '}
              <button type="button" className="linkish small" onClick={() => void saveImage(p, vUrl)}>
                Save the card as an image
              </button>
            </>
          ) : null}
        </p>
      </div>
    </section>
  );
}
