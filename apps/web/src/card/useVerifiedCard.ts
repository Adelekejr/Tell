import { useEffect, useState } from 'react';
import type { SignedCard } from '@tell/shared';
import type { CardRecord } from '../lib/api';
import { ApiError, getCard, getPublishedKeys } from '../lib/api';
import type { KeyedInfo, Verdict } from './verify';
import { mergeKeys, promptMatches, verifyCard } from './verify';

export type Check = { status: 'checking' } | { status: 'done'; verdict: Verdict; promptOk: boolean | null };

export type CardLoad =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'failed'; message: string }
  | { status: 'ready'; record: CardRecord; check: Check };

/** Keys: pinned ones from the code plus Tell's published keys.json (if it answers). */
export async function loadKeys(): Promise<KeyedInfo[]> {
  try {
    return mergeKeys((await getPublishedKeys()).keys ?? []);
  } catch {
    return mergeKeys([]);
  }
}

export async function checkCard(card: unknown, prompt: string | null): Promise<{ verdict: Verdict; promptOk: boolean | null }> {
  const verdict = await verifyCard(card, await loadKeys());
  const promptOk = verdict.status === 'valid' ? await promptMatches(card as SignedCard, prompt) : null;
  return { verdict, promptOk };
}

/** Loads a card from Tell's API, then checks its signature in this browser. */
export function useVerifiedCard(id: string): CardLoad {
  const [state, setState] = useState<{ id: string; load: CardLoad }>({ id, load: { status: 'loading' } });

  useEffect(() => {
    let live = true;
    const ctrl = new AbortController();
    getCard(id, ctrl.signal)
      .then(async (record) => {
        if (!live) return;
        setState({ id, load: { status: 'ready', record, check: { status: 'checking' } } });
        const { verdict, promptOk } = await checkCard(record.card, record.prompt);
        if (live) setState({ id, load: { status: 'ready', record, check: { status: 'done', verdict, promptOk } } });
      })
      .catch((err: unknown) => {
        if (!live) return;
        if (err instanceof ApiError && err.status === 404) setState({ id, load: { status: 'missing' } });
        else setState({ id, load: { status: 'failed', message: err instanceof ApiError ? err.message : 'Couldn\u2019t load the card.' } });
      });
    return () => {
      live = false;
      ctrl.abort();
    };
  }, [id]);

  return state.id === id ? state.load : { status: 'loading' };
}
