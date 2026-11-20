import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SAMPLE_CARD } from '@tell/shared';
import type * as VerifyCardModule from '../card/useVerifiedCard';
import { Verify } from './Verify';
import { initialPasteCheckState, pasteCheckReducer } from './verify-state';

const m = vi.hoisted(() => ({ checkCard: vi.fn() }));
vi.mock('../card/useVerifiedCard', async (orig) => ({ ...(await orig<typeof VerifyCardModule>()), checkCard: m.checkCard }));

const valid = { verdict: { status: 'valid', kid: 'demo', keySource: 'sample', engine: 'noble' }, promptOk: null } as const;
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('paste check reducer', () => {
  it('allows text, invalid, checking, and matching completion transitions', () => {
    const typed = pasteCheckReducer(initialPasteCheckState, { type: 'text', text: '{}' });
    const invalid = pasteCheckReducer(typed, { type: 'invalid', error: 'Paste a verify link or the card’s JSON.', requestId: 1 });
    expect(invalid.status).toBe('invalid');
    const checking = pasteCheckReducer(invalid, { type: 'checking', requestId: 2 });
    expect(checking.status).toBe('checking');
    const done = pasteCheckReducer(checking, { type: 'done', requestId: 2, result: { card: null, check: { status: 'done', verdict: { status: 'invalid', reason: 'malformed', kid: null }, promptOk: null } } });
    expect(done.status).toBe('done');
  });

  it('rejects illegal and stale completion transitions without changing state', () => {
    const typed = pasteCheckReducer(initialPasteCheckState, { type: 'text', text: '{}' });
    const illegal = pasteCheckReducer(typed, { type: 'done', requestId: 1, result: { card: null, check: { status: 'checking' } } });
    expect(illegal).toEqual(typed);
    const checking = pasteCheckReducer(typed, { type: 'checking', requestId: 2 });
    const stale = pasteCheckReducer(checking, { type: 'done', requestId: 1, result: { card: null, check: { status: 'checking' } } });
    expect(stale).toEqual(checking);
  });

  it('keeps the prior result visible when a new input is invalid', () => {
    const done = pasteCheckReducer(
      { status: 'checking', text: '{}', error: null, result: null, requestId: 1 },
      { type: 'done', requestId: 1, result: { card: null, check: { status: 'checking' } } },
    );
    const invalid = pasteCheckReducer(done, { type: 'invalid', error: 'bad', requestId: 2 });
    expect(invalid.status).toBe('invalid');
    expect(invalid.result).toBe(done.result);
  });
});

describe('Verify pasted checks', () => {
  it('does not let an older verification overwrite a newer one', async () => {
    const first = deferred<typeof valid>();
    const second = deferred<typeof valid>();
    m.checkCard.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    render(
      <MemoryRouter>
        <Verify />
      </MemoryRouter>,
    );
    const box = screen.getByLabelText('Check a card yourself');
    fireEvent.change(box, { target: { value: JSON.stringify(SAMPLE_CARD) } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Check signature/ })));
    fireEvent.change(box, { target: { value: JSON.stringify({ ...SAMPLE_CARD, payload: { ...SAMPLE_CARD.payload, agent: 'Second' } }) } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Check signature/ })));
    await act(async () => first.resolve(valid));
    expect(screen.getByText('Checking the signature…')).toBeTruthy();
    await act(async () => second.resolve(valid));
    expect(screen.getByText('Valid sample.')).toBeTruthy();
  });

  it('keeps a prior result visible while reporting invalid new input', async () => {
    m.checkCard.mockResolvedValue(valid);
    render(
      <MemoryRouter>
        <Verify />
      </MemoryRouter>,
    );
    const box = screen.getByLabelText('Check a card yourself');
    fireEvent.change(box, { target: { value: JSON.stringify(SAMPLE_CARD) } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Check signature/ })));
    expect(screen.getByText('Valid sample.')).toBeTruthy();
    fireEvent.change(box, { target: { value: '{' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Check signature/ })));
    expect(screen.getByText('Paste a verify link or the card’s JSON.')).toBeTruthy();
    expect(screen.getByText('Valid sample.')).toBeTruthy();
  });
});
