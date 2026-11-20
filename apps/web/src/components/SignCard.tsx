import { useId, useReducer, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { MAX_CARD_PROMPT, checkAgentName } from '@tell/shared';
import type { SignRequest } from '../lib/api';
import { ApiError, cardPath, signCard } from '../lib/api';
import { Button } from './Button';
import { Input, Textarea } from './Field';
import { Notice } from './Notice';
import { initialSubmissionState, submissionReducer } from './submission-state';

type Extras = { agent?: string; prompt?: string };

/**
 * Asks Tell to sign a scorecard. The name is optional. The prompt is sent
 * only when "Include my prompt on my card" is switched on (off by default).
 */
export function SignCard({
  kind,
  build,
  defaultPrompt = '',
  disabled,
}: {
  kind: 'live' | 'drill';
  build: (extras: Extras) => SignRequest;
  defaultPrompt?: string;
  disabled?: boolean;
}) {
  const navigate = useNavigate();
  const switchId = useId();
  const [agent, setAgent] = useState('');
  const [includePrompt, setIncludePrompt] = useState(false);
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [submission, dispatch] = useReducer(submissionReducer, initialSubmissionState);
  const nextRequestId = useRef(0);
  const activeRequest = useRef<number | null>(null);
  const busy = submission.status === 'submitting';
  const nameError = submission.status === 'validation-error' ? submission.message : null;
  const error = submission.status === 'error' ? submission.message : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (activeRequest.current !== null) return;
    const requestId = ++nextRequestId.current;
    activeRequest.current = requestId;
    dispatch({ type: 'begin', requestId });
    const extras: Extras = {};
    if (agent.trim()) {
      const name = checkAgentName(agent);
      if (!name.ok) {
        dispatch({ type: 'validation-error', requestId, message: name.reason });
        activeRequest.current = null;
        return;
      }
      extras.agent = name.name;
    }
    if (includePrompt && prompt.trim()) extras.prompt = prompt.trim();
    try {
      const { card } = await signCard(build(extras));
      if (activeRequest.current !== requestId) return;
      dispatch({ type: 'success', requestId });
      activeRequest.current = null;
      navigate(cardPath(card.payload.id));
    } catch (err) {
      if (activeRequest.current !== requestId) return;
      dispatch({
        type: 'failure',
        requestId,
        message: err instanceof ApiError ? err.message : 'Couldn\u2019t sign the card. Retry in a moment.',
      });
      activeRequest.current = null;
    }
  }

  return (
    <form className="sign-card" onSubmit={(e) => void submit(e)} noValidate id="sign">
      <div className="sign-card-head">
        <p className="label">Signed scorecard</p>
        <p className="small muted">
          {kind === 'live'
            ? 'Built from Tell\u2019s own records of this run, then signed so anyone can check it wasn\u2019t edited.'
            : 'Signed as browser-reported: Tell didn\u2019t watch this run, so it never joins the board.'}
        </p>
      </div>
      <Input
        label="Agent name (optional)"
        placeholder="ShopBot"
        value={agent}
        maxLength={40}
        onChange={(e) => setAgent(e.target.value)}
        error={nameError ?? undefined}
        hint="Shown on the card. No links, emails or phone numbers."
        autoComplete="off"
      />
      <label className="drill-switch" htmlFor={switchId}>
        <input id={switchId} type="checkbox" role="switch" checked={includePrompt} onChange={(e) => setIncludePrompt(e.target.checked)} />
        <span className="drill-switch-track" aria-hidden="true" />
        <span>
          <span className="h4">Include my prompt on my card</span>
          <span className="small muted">
            Off by default. When on, the prompt is stored with the card and anyone with the link can read it.
          </span>
        </span>
      </label>
      {includePrompt ? (
        <Textarea
          label="Prompt to include"
          mono
          rows={4}
          value={prompt}
          maxLength={MAX_CARD_PROMPT}
          onChange={(e) => setPrompt(e.target.value)}
          hint={`${prompt.length} / ${MAX_CARD_PROMPT} \u00B7 Its fingerprint (SHA-256) is signed into the card.`}
        />
      ) : null}
      {error ? <Notice role="alert">{error}</Notice> : null}
      <Button type="submit" variant="accent" arrow loading={busy} loadingLabel={'Signing\u2026'} disabled={disabled}>
        Sign my scorecard
      </Button>
    </form>
  );
}
