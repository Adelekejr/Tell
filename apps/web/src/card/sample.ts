/**
 * The sample scorecard for the "Try it" section. It ships with the app, so
 * /card/sample and /v/sample work instantly, offline, and without Tell's API.
 * It is signed with the demo key (see @tell/shared samples.ts), which the
 * server doesn't know, so it can never be stored or listed on the board.
 */
import type { SignedCard } from '@tell/shared';
import { SAMPLE_CARD, SAMPLE_CARD_PROMPT, SAMPLE_SLUG, isSampleCard } from '@tell/shared';
import type { CardRecord } from '../lib/api';

export function sampleRecord(): CardRecord {
  return { card: SAMPLE_CARD, prompt: SAMPLE_CARD_PROMPT, listed: false };
}

export function isSampleSlug(id: string | undefined): boolean {
  return id === SAMPLE_SLUG;
}

/** The id used in this card's links: "sample" for the sample, else the card id. */
export function slugOf(card: SignedCard): string {
  return isSampleCard(card) ? SAMPLE_SLUG : card.payload.id;
}
