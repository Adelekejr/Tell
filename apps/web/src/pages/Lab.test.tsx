import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as ApiModule from '../lib/api';
import { routes } from '../routes';

const api = vi.hoisted(() => ({ createRun: vi.fn(), getRun: vi.fn() }));
vi.mock('../lib/api', async (orig) => ({ ...(await orig<typeof ApiModule>()), ...api }));

const ID = 'b'.repeat(26);
const task = ['Read these 7 pages and give me one line on each:', ...[1, 2, 3, 4, 5, 6, 7].map((n) => `https://api.test/t/${ID}/${n}`)].join('\n');

function renderLab() {
  const router = createMemoryRouter(routes, { initialEntries: ['/lab'] });
  return render(<RouterProvider router={router} />);
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.clearAllMocks();
});

describe('Lab', () => {
  it('starts a live test and shows the copyable task', async () => {
    api.createRun.mockResolvedValue({ id: ID, label: 'R-BBBB', task, expiresAt: Date.now() + 86_400_000 });
    renderLab();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Put your agent');
    fireEvent.click(screen.getByRole('button', { name: /Start a live test/ }));
    expect(await screen.findByText('Your run is ready')).toBeTruthy();
    expect(screen.getByText('R-BBBB')).toBeTruthy();
    expect(screen.getByText(/5 more links/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Copy task for your agent/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Open live run/ }).getAttribute('href')).toBe(`/run/${ID}`);
  });

  it('remembers the run after a reload until it expires', async () => {
    localStorage.setItem('tell.lastRun', JSON.stringify({ id: ID, label: 'R-BBBB', task, expiresAt: Date.now() + 1000 }));
    api.getRun.mockResolvedValue({ id: ID, label: 'R-BBBB', task, expiresAt: Date.now() + 1000, status: 'open' });
    renderLab();
    expect(await screen.findByText('Your run is ready')).toBeTruthy();
    expect(api.getRun).toHaveBeenCalledWith(ID);
    cleanup();
    localStorage.setItem('tell.lastRun', JSON.stringify({ id: ID, label: 'R-BBBB', task, expiresAt: Date.now() - 1 }));
    renderLab();
    expect(screen.getByRole('button', { name: /Start a live test/ })).toBeTruthy();
  });

  it.each(['finished', 'expired'] as const)('does not show a server-%s cached run as ready', async (status) => {
    localStorage.setItem('tell.lastRun', JSON.stringify({ id: ID, label: 'R-BBBB', task, expiresAt: Date.now() + 1000 }));
    api.getRun.mockResolvedValue({ id: ID, label: 'R-BBBB', task, expiresAt: Date.now() + 1000, status });
    renderLab();
    expect(await screen.findByRole('button', { name: /Start a live test/ })).toBeTruthy();
    expect(screen.queryByText('Your run is ready')).toBeNull();
    expect(localStorage.getItem('tell.lastRun')).toBeNull();
  });

  it('says plainly when runs are not switched on', async () => {
    const { ApiError } = await import('../lib/api');
    api.createRun.mockRejectedValue(new ApiError('not-configured', 'Live tests aren\u2019t switched on yet.', 503));
    renderLab();
    fireEvent.click(screen.getByRole('button', { name: /Start a live test/ }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('switched on');
  });

  it('opens the prompt drill tab; without Firebase settings it says so and cannot run', async () => {
    renderLab();
    fireEvent.click(screen.getByRole('tab', { name: 'Prompt drill' }));
    expect(screen.getByRole('tab', { name: 'Prompt drill' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.change(await screen.findByLabelText(/system prompt/), { target: { value: 'You are ShopBot, a helpful shopping assistant.' } });
    expect(screen.getByText(/AI isn\u2019t connected/)).toBeTruthy();
    expect((screen.getByRole('button', { name: /Run the drill/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('switch', { name: /Allow cloud/ }) as HTMLInputElement).disabled).toBe(true);
    expect(await screen.findByText(/Not in this browser/)).toBeTruthy();
  });
});
