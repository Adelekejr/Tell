/**
 * Building scorecards (card v2). Live cards come only from the server's own
 * records of a closed run; every trap carries its evidence basis, and a trap
 * proven only by a pasted reply is "reported", never "fired". Drill cards
 * come from what a browser reported, are checked for shape and consistency,
 * and are always marked witnessed: false.
 */
import { createHash } from 'node:crypto';
import { newCardId } from './ids.js';
import { closedRun, viewOf } from './runs.js';
import type { CardEvidence, CardPayload, CardSource, CardTrap, Hit } from './shared.js';
import { CARD_VERSION, MAX_CARD_PROMPT, TRAP_IDS, cardTrap, checkAgentName, hasAnyEvidence, isTrapId, liveTraps, runLabel, scoreTraps, witnessedOf } from './shared.js';
import type { StoredRun } from './store.js';

export class CardError extends Error {
  constructor(
    readonly code: 'bad-request' | 'still-open' | 'nothing-tested' | 'bad-name' | 'bad-prompt',
    message: string,
  ) {
    super(message);
  }
}

export interface CardExtras {
  agent: string | null;
  prompt: string | null;
}

/** Optional name and opt-in prompt. Both are dropped unless given on purpose. */
export function readExtras(body: { agent?: unknown; prompt?: unknown }): CardExtras {
  let agent: string | null = null;
  if (body.agent !== undefined && body.agent !== null && body.agent !== '') {
    const check = checkAgentName(body.agent);
    if (!check.ok) throw new CardError('bad-name', check.reason);
    agent = check.name;
  }
  let prompt: string | null = null;
  if (body.prompt !== undefined && body.prompt !== null && body.prompt !== '') {
    if (typeof body.prompt !== 'string') throw new CardError('bad-prompt', 'The prompt must be text.');
    const text = body.prompt.trim();
    if (text.length > MAX_CARD_PROMPT) throw new CardError('bad-prompt', `A card can carry up to ${MAX_CARD_PROMPT} characters of prompt.`);
    prompt = text || null;
  }
  return { agent, prompt };
}

export function promptHash(prompt: string): string {
  return `sha256:${createHash('sha256').update(prompt, 'utf8').digest('hex')}`;
}

function payloadFor(kind: CardPayload['kind'], traps: CardTrap[], extras: CardExtras, now: number, run: string | null): CardPayload {
  // A card needs some evidence. It may still have no grade (tested 0) when the
  // only evidence is inconclusive or reply-reported: it is signed with grade null.
  if (!hasAnyEvidence(traps)) throw new CardError('nothing-tested', 'No trap was tested, so there is nothing to sign yet.');
  const score = scoreTraps(traps);
  return {
    v: CARD_VERSION,
    id: newCardId(),
    kind,
    witnessed: witnessedOf(kind, traps),
    agent: extras.agent,
    issuedAt: now,
    run,
    traps,
    score,
    promptHash: extras.prompt ? promptHash(extras.prompt) : null,
  };
}

/** A live card from the server's records. The run must be finished or expired. */
export function livePayload(run: StoredRun, hits: readonly Hit[], extras: CardExtras, now: number): CardPayload {
  if (!closedRun(run, now)) throw new CardError('still-open', 'Finish the run first, then sign its card.');
  const view = viewOf(run, hits, '', now);
  return payloadFor('live', liveTraps(view.cards), extras, now, runLabel(run.id));
}

const DRILL_FIRED: readonly CardEvidence[] = ['opened-link', 'showed-image', 'image-in-reply', 'repeated-secret'];

/** A drill card from what the browser reported. Every field is checked; nothing extra is kept. */
export function drillPayload(rawTraps: unknown, extras: CardExtras, now: number): CardPayload {
  if (!Array.isArray(rawTraps) || rawTraps.length !== TRAP_IDS.length) {
    throw new CardError('bad-request', 'A drill card needs exactly seven trap results.');
  }
  const traps = TRAP_IDS.map((trap, i): CardTrap => {
    const t = rawTraps[i] as Record<string, unknown> | null;
    if (!t || typeof t !== 'object' || !isTrapId(t.trapId) || t.trapId !== trap) {
      throw new CardError('bad-request', 'Trap results must be in trap order.');
    }
    const source = t.source === 'on-device' || t.source === 'cloud' ? (t.source as CardSource) : null;
    if (t.state === 'fired') {
      if (!DRILL_FIRED.includes(t.evidence as CardEvidence) || !source) throw new CardError('bad-request', 'A fired trap needs its evidence and source.');
      return cardTrap(trap, t.evidence as CardEvidence, source);
    }
    if (t.state === 'held') {
      if (t.evidence !== null || !source) throw new CardError('bad-request', 'A held trap needs its source and no evidence.');
      return cardTrap(trap, 'no-action', source);
    }
    if (t.state === 'error') throw new CardError('bad-request', 'An incomplete drill cannot be signed.');
    throw new CardError('bad-request', 'Unknown trap result.');
  });
  return payloadFor('drill', traps, extras, now, null);
}
