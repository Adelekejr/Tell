import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ApiModule from '../lib/api';
import { drillPayload, legacyPayload, livePayload, noGradePayload, reportedPayload, testKey } from '../test/cards';
import { routes } from '../routes';

const api = vi.hoisted(() => ({
  getCard: vi.fn(),
  getPublishedKeys: vi.fn(),
  addToBoard: vi.fn(),
  getBoard: vi.fn(),
}));
vi.mock('../lib/api', async (orig) => ({ ...(await orig<typeof ApiModule>()), ...api }));

const key = testKey();
const open = (path: string) => render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />);

beforeEach(() => {
  api.getPublishedKeys.mockResolvedValue({ keys: [key.info] });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('scorecard page', () => {
  it('shows a live card like the mockup and checks its signature', async () => {
    const card = key.signCard(livePayload([1, 4, 6]));
    api.getCard.mockResolvedValue({ card, prompt: null, listed: false });
    open(`/card/${card.payload.id}`);
    expect(await screen.findByText('Signature valid')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Twitchy' })).toBeTruthy();
    expect(screen.getByText('Scorecard \u00B7 ShopBot')).toBeTruthy();
    expect(screen.getByText('Witnessed')).toBeTruthy();
    expect(screen.getByText(/4 of 7 held\. Your agent folded on/).textContent).toBe(
      '4 of 7 held. Your agent folded on The Whisper, The Hashtag and The Impostor.',
    );
    expect(screen.getByText('Ed25519 \u00B7 key k1')).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['The Whisper', 'The Hashtag', 'The Impostor']);
    expect(screen.getByText(/\/v\/abcdefghijklmnop$/)).toBeTruthy();
  });

  it('adds a live card to the board with a checked name', async () => {
    const card = key.signCard(livePayload([1]));
    api.getCard.mockResolvedValue({ card, prompt: null, listed: false });
    api.addToBoard.mockResolvedValue({ added: true, entry: {} });
    open(`/card/${card.payload.id}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Add to board' }));
    const name = screen.getByLabelText('Name on the board');
    fireEvent.change(name, { target: { value: 'me@example.com' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Add to board' }).at(-1)!);
    expect(await screen.findByText('No links or email addresses.')).toBeTruthy();
    expect(api.addToBoard).not.toHaveBeenCalled();
    fireEvent.change(name, { target: { value: 'ShopBot' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Add to board' }).at(-1)!);
    expect(await screen.findByRole('link', { name: 'On the board' })).toBeTruthy();
    expect(api.addToBoard).toHaveBeenCalledWith(card.payload.id, 'ShopBot');
  });

  it('labels a drill card browser-reported and never offers the board', async () => {
    const card = key.signCard(drillPayload());
    api.getCard.mockResolvedValue({ card, prompt: null, listed: false });
    open(`/card/${card.payload.id}`);
    expect(await screen.findByText('Browser-reported')).toBeTruthy();
    expect(screen.queryByText('Witnessed')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add to board' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Save image' })).toBeTruthy();
  });

  it('shows a pasted-reply result as reported, apart from the score, and never offers the board', async () => {
    const card = key.signCard(reportedPayload());
    api.getCard.mockResolvedValue({ card, prompt: null, listed: false });
    open(`/card/${card.payload.id}`);
    expect(await screen.findByText('Signature valid')).toBeTruthy();
    expect(screen.getByText('Partly reply-reported')).toBeTruthy();
    expect(screen.queryByText('Witnessed')).toBeNull();
    expect(screen.getByText('Reported')).toBeTruthy();
    expect(screen.getByText(/5 of 6 held\. Your agent folded on The Whisper\. A pasted reply also reported The Cipher \(not witnessed, not scored\)\./)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add to board' })).toBeNull();
    expect(screen.getByText(/can’t join the witnessed board/)).toBeTruthy();
  });

  it('shows "Not enough evidence" instead of a grade when nothing was validly tested', async () => {
    const card = key.signCard(noGradePayload());
    api.getCard.mockResolvedValue({ card, prompt: null, listed: false });
    open(`/card/${card.payload.id}`);
    expect(await screen.findByRole('heading', { level: 1, name: 'Not enough evidence' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add to board' })).toBeNull();
    expect(screen.getByText(/there is no grade to rank/)).toBeTruthy();
  });

  it('shows an old-scoring note on a v1 card and re-reads it under today\u2019s rules', async () => {
    const card = key.signCard(legacyPayload());
    api.getCard.mockResolvedValue({ card, prompt: null, listed: true });
    open(`/card/${card.payload.id}`);
    expect(await screen.findByText('Signature valid')).toBeTruthy();
    expect(screen.getByText(/Signed under Tell’s old scoring \(card v1\)/).textContent).toContain('As signed: 6 of 7 held. Under today’s rules: 5 of 5 held (Poker Face)');
    expect(screen.getByText('Partly reply-reported')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'On the board' })).toBeNull();
  });

  it('says so when a card was edited', async () => {
    const card = key.signCard(livePayload([1]));
    api.getCard.mockResolvedValue({ card: { ...card, payload: { ...card.payload, agent: 'Other Bot' } }, prompt: null, listed: false });
    open(`/card/${card.payload.id}`);
    expect(await screen.findByText('Signature not valid')).toBeTruthy();
  });

  it('explains a missing card', async () => {
    const { ApiError } = await import('../lib/api');
    api.getCard.mockRejectedValue(new ApiError('not-found', 'gone', 404));
    open('/card/abcdefghijklmnop');
    expect(await screen.findByRole('heading', { name: /isn\u2019t in the deck/ })).toBeTruthy();
  });
});

describe('verify page', () => {
  it('checks a stored card and explains the key', async () => {
    const card = key.signCard(livePayload());
    api.getCard.mockResolvedValue({ card, prompt: null, listed: false });
    open(`/v/${card.payload.id}`);
    expect(await screen.findByText('Signature valid.')).toBeTruthy();
    expect(screen.getByText('Live test, every result witnessed by Tell\u2019s server')).toBeTruthy();
    expect(screen.getByText(/published by Tell at \/keys\.json/)).toBeTruthy();
    expect(screen.getByText(/What a valid signature proves, and what it doesn\u2019t/)).toBeTruthy();
  });

  it('verifies an old v1 card and explains the old scoring', async () => {
    const card = key.signCard(legacyPayload());
    api.getCard.mockResolvedValue({ card, prompt: null, listed: false });
    open(`/v/${card.payload.id}`);
    expect(await screen.findByText('Signature valid.')).toBeTruthy();
    expect(screen.getByText(/As signed: 6 of 7 held/)).toBeTruthy();
    expect(screen.getByText(/tell-card-v1/)).toBeTruthy();
  });

  it('labels a reply-reported card on the verify page', async () => {
    const card = key.signCard(reportedPayload());
    api.getCard.mockResolvedValue({ card, prompt: null, listed: false });
    open(`/v/${card.payload.id}`);
    expect(await screen.findByText('Signature valid.')).toBeTruthy();
    expect(screen.getByText(/partly reply-reported.*1 reply-reported \(not scored\)/)).toBeTruthy();
  });

  it('checks pasted card JSON without sending it anywhere', async () => {
    const card = key.signCard(drillPayload());
    open('/verify');
    fireEvent.change(screen.getByLabelText('Check a card yourself'), { target: { value: JSON.stringify(card) } });
    fireEvent.click(screen.getByRole('button', { name: /Check signature/ }));
    expect(await screen.findByText('Signature valid.')).toBeTruthy();
    expect(screen.getByText('Prompt drill, browser-reported')).toBeTruthy();
    expect(api.getCard).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Check a card yourself'), {
      target: { value: JSON.stringify({ ...card, payload: { ...card.payload, issuedAt: card.payload.issuedAt + 1 } }) },
    });
    fireEvent.click(screen.getByRole('button', { name: /Check signature/ }));
    expect(await screen.findByText('Signature not valid.')).toBeTruthy();
  });
});

describe('board page', () => {
  const entry = (cardId: string, name: string, held: number, cells: string) => ({
    cardId,
    name,
    held,
    tested: 7,
    grade: held === 7 ? 'poker-face' : 'steady',
    cells: cells.split(''),
    at: Date.UTC(2026, 10, 18),
  });

  it('lists entries in the order the server ranked them and switches filters', async () => {
    api.getBoard.mockResolvedValue({ entries: [entry('aaaaaaaaaaaaaaaa', 'Atlas Browser Agent', 7, 'hhhhhhh'), entry('bbbbbbbbbbbbbbbb', 'Fennel Assist', 6, 'hhhhhfh')] });
    open('/board');
    expect(await screen.findByText('Atlas Browser Agent')).toBeTruthy();
    expect(screen.getByText('Poker Face')).toBeTruthy();
    expect(screen.getByText('6/7 held \u00B7 18 Nov')).toBeTruthy();
    expect(api.getBoard).toHaveBeenLastCalledWith('week', false, expect.anything());
    fireEvent.click(screen.getByRole('button', { name: 'Poker Face only' }));
    expect(api.getBoard).toHaveBeenLastCalledWith('all', true, expect.anything());
  });

  it('shows the empty state with a way in', async () => {
    api.getBoard.mockResolvedValue({ entries: [] });
    open('/board');
    expect(await screen.findByText('No poker faces yet this week.')).toBeTruthy();
    expect(screen.getAllByRole('link', { name: /Test my agent/ }).length).toBeGreaterThanOrEqual(2);
  });
});
