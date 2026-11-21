import { act, cleanup, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { routes } from '../routes';
import { beginWork, isWorking, trackWork } from './working';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('working signal', () => {
  it('counts work in and out, once per task, even when it fails', async () => {
    const end = beginWork();
    expect(isWorking()).toBe(true);
    end();
    end();
    expect(isWorking()).toBe(false);
    await expect(trackWork(() => Promise.reject(new Error('x')))).rejects.toThrow('x');
    expect(isWorking()).toBe(false);
  });

  it('the logo sways on boot and while work runs, then settles still', async () => {
    vi.useFakeTimers();
    window.scrollTo = () => {};
    const router = createMemoryRouter(routes, { initialEntries: ['/how'] });
    render(<RouterProvider router={router} />);
    const logo = () => screen.getAllByRole('link', { name: 'Tell, home' })[0]!;
    expect(logo().classList.contains('is-loading')).toBe(true);
    await act(() => vi.advanceTimersByTimeAsync(800));
    await act(() => vi.advanceTimersByTimeAsync(800));
    expect(logo().classList.contains('is-loading')).toBe(false);

    let end = () => {};
    act(() => {
      end = beginWork();
    });
    expect(logo().classList.contains('is-loading')).toBe(true);
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(logo().classList.contains('is-loading')).toBe(true);
    act(() => end());
    // Done: it settles on the next tick, with no extra sway.
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(logo().classList.contains('is-loading')).toBe(false);

    // A route change counts as loading the new page.
    await act(() => router.navigate('/traps'));
    expect(logo().classList.contains('is-loading')).toBe(true);
    await act(() => vi.advanceTimersByTimeAsync(800));
    await act(() => vi.advanceTimersByTimeAsync(10));
    expect(logo().classList.contains('is-loading')).toBe(false);
  });
});
