import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SAMPLE_CARD, SAMPLE_STRONG_PROMPT, SAMPLE_WEAK_PROMPT } from '@tell/shared';
import type * as ApiModule from '../lib/api';
import { routes } from '../routes';

// No API, no AI: exactly a first-time phone visitor on a copy of Tell with nothing switched on.
const api = vi.hoisted(() => ({ getCard: vi.fn(), getPublishedKeys: vi.fn(), fetchPage: vi.fn(), addToBoard: vi.fn() }));
vi.mock('../lib/api', async (orig) => ({ ...(await orig<typeof ApiModule>()), ...api }));

async function openAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  await screen.findByRole('heading', { level: 1 });
  return router;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Try it (/try)', () => {
  it('lists the check examples, the seven demo trap pages, two sample prompts and the sample card', async () => {
    await openAt('/try');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('See a tell in seconds.');
    const check = screen.getByRole('region', { name: 'Check a page' });
    const links = within(check).getAllByRole('link');
    expect(links).toHaveLength(9);
    expect(links.map((l) => l.getAttribute('href'))).toContain('/check?example=clean');
    expect(within(check).getByText('A clean recipe')).toBeTruthy();
    expect(within(check).getByText('The clean control page')).toBeTruthy();
    const traps = screen.getByRole('region', { name: 'Demo trap pages' });
    expect(within(traps).getAllByRole('link', { name: 'Check it' }).map((l) => l.getAttribute('href'))).toEqual(
      [1, 2, 3, 4, 5, 6, 7].map((n) => `/check?example=trap-${n}`),
    );
    expect(screen.getByRole('link', { name: /Weak prompt/ }).getAttribute('href')).toBe('/lab?tab=drill&sample=weak');
    expect(screen.getByRole('link', { name: /Open the sample card/ }).getAttribute('href')).toBe('/card/sample');
    expect(screen.getByRole('link', { name: /Check its signature/ }).getAttribute('href')).toBe('/v/sample');
    expect(screen.getAllByText('Sample').length).toBeGreaterThan(0);
  });

  it('one tap opens a known-bad example with the rules\u2019 result, labelled as an example, with no AI', async () => {
    await openAt('/try');
    await act(async () => {
      fireEvent.click(screen.getByRole('link', { name: /White-on-white text/ }));
    });
    expect(await screen.findByText('1 hidden line found.')).toBeTruthy();
    expect(screen.getByText('Example: made up, checked in this browser')).toBeTruthy();
    expect(screen.getByText('Text the same colour as the page')).toBeTruthy();
    expect(screen.getByText(/The findings above come from Tell\u2019s rules and stand on their own/)).toBeTruthy();
    expect(api.fetchPage).not.toHaveBeenCalled();
  });

  it('the visible "AI assistants:" order is a thing to know, and the clean example finds nothing', async () => {
    await openAt('/check?example=ai-order');
    expect(await screen.findByText('1 thing to know.')).toBeTruthy();
    expect(screen.getByText('Orders aimed at AI assistants')).toBeTruthy();
    cleanup();
    await openAt('/check?example=clean');
    expect(await screen.findByText('Nothing hidden found.')).toBeTruthy();
    expect(screen.getByText(/Nothing in it is hidden/)).toBeTruthy();
  });

  it('demo trap pages open in the check without a run', async () => {
    await openAt('/check?example=trap-2');
    expect(await screen.findByText('1 hidden line found.')).toBeTruthy();
    expect(screen.getByText(/Example: Tell\u2019s demo trap page 2 of 7 \(The Whisper\)/)).toBeTruthy();
    expect((screen.getByLabelText('Link or text') as HTMLTextAreaElement).value).toMatch(/\/t\/demo\/2$/);
  });

  it('an unknown example just opens the empty check', async () => {
    await openAt('/check?example=nope');
    expect(screen.queryByRole('status')).toBeNull();
    expect((screen.getByLabelText('Link or text') as HTMLTextAreaElement).value).toBe('');
  });

  it('a sample prompt opens the drill with the rules-only quick check, even with no AI', async () => {
    await openAt('/lab?tab=drill&sample=weak');
    const box = (await screen.findByLabelText(/system prompt/)) as HTMLTextAreaElement;
    expect(box.value).toBe(SAMPLE_WEAK_PROMPT);
    expect(screen.getByText('Quick check \u00B7 0 of 7 defences')).toBeTruthy();
    expect(screen.getByText('Asks the agent to follow what pages say.')).toBeTruthy();
    expect((screen.getByRole('button', { name: /Run the drill/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Strong prompt' }));
    expect(box.value).toBe(SAMPLE_STRONG_PROMPT);
    expect(screen.getByText('Quick check \u00B7 7 of 7 defences')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Strong prompt' }).getAttribute('aria-pressed')).toBe('true');
  });
});

describe('the sample scorecard', () => {
  it('/card/sample shows the bundled card, marked as a sample, signature checked, never offered for the board', async () => {
    api.getPublishedKeys.mockRejectedValue(new Error('offline'));
    await openAt('/card/sample');
    expect(await screen.findByText('Signature valid')).toBeTruthy();
    expect(screen.getByText('This is a sample card.')).toBeTruthy();
    expect(screen.getByText('Sample')).toBeTruthy();
    expect(screen.queryByText('Witnessed')).toBeNull();
    expect(screen.getByText('Scorecard \u00B7 Sample agent')).toBeTruthy();
    expect(screen.getByText('Ed25519 \u00B7 key demo')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add to board' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Check its signature' }).getAttribute('href')).toBe('/v/sample');
    expect(screen.getByText(/\/v\/sample$/)).toBeTruthy();
    expect(screen.getByText('Prompt on this card')).toBeTruthy();
    expect(api.getCard).not.toHaveBeenCalled();
  });

  it('/v/sample verifies in the browser and says it is a sample, not a result', async () => {
    api.getPublishedKeys.mockResolvedValue({ keys: [] });
    await openAt('/v/sample');
    expect(await screen.findByText('Valid sample.')).toBeTruthy();
    expect(screen.getByText(/signed only this made-up sample/)).toBeTruthy();
    expect(screen.getByText(/^Sample, made up \(shaped like a live test card\)/)).toBeTruthy();
    expect(screen.getByText('Included, and it matches the signed fingerprint.')).toBeTruthy();
  });

  it('a pasted copy of the sample checks out as a sample; an edited one does not', async () => {
    api.getPublishedKeys.mockResolvedValue({ keys: [] });
    await openAt('/verify');
    const box = screen.getByLabelText('Check a card yourself');
    fireEvent.change(box, { target: { value: JSON.stringify(SAMPLE_CARD) } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Check signature/ }));
    });
    expect(await screen.findByText('Valid sample.')).toBeTruthy();
    const edited = { ...SAMPLE_CARD, payload: { ...SAMPLE_CARD.payload, agent: 'Real agent' } };
    fireEvent.change(box, { target: { value: JSON.stringify(edited) } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Check signature/ }));
    });
    expect(await screen.findByText('Signature not valid.')).toBeTruthy();
  });

  it('a pasted sample link goes to the sample check', async () => {
    api.getPublishedKeys.mockResolvedValue({ keys: [] });
    const router = await openAt('/verify');
    fireEvent.change(screen.getByLabelText('Check a card yourself'), { target: { value: 'https://tell.run/v/sample' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Check signature/ }));
    });
    expect(router.state.location.pathname).toBe('/v/sample');
  });
});

describe('home page', () => {
  it('has a Try it strip with one-tap examples and the sample card', async () => {
    await openAt('/');
    const strip = screen.getByRole('region', { name: /Tap one/ });
    expect(within(strip).getByRole('link', { name: /White-on-white text/ }).getAttribute('href')).toBe('/check?example=white-text');
    expect(within(strip).getByRole('link', { name: /A clean recipe/ }).getAttribute('href')).toBe('/check?example=clean');
    expect(within(strip).getByRole('link', { name: /A signed scorecard/ }).getAttribute('href')).toBe('/card/sample');
    expect(within(strip).getByRole('link', { name: /All examples/ }).getAttribute('href')).toBe('/try');
  });
});
