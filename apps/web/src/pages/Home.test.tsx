import { act, cleanup, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getTrap } from '@tell/shared';
import { routes } from '../routes';
import { TrapCard } from '../components/TrapCard';

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return render(<RouterProvider router={router} />);
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('Home', () => {
  it('leads with the headline and both doors', () => {
    renderAt('/');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Every AIhas a tell.');
    expect(screen.getAllByRole('link', { name: /Test my agent/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /Check a page/ })[0]?.getAttribute('href')).toBe('/check');
  });

  it('lists all seven traps', () => {
    renderAt('/');
    expect(screen.getByText('The Impostor')).toBeTruthy();
    expect(screen.getByText('Invisible Ink')).toBeTruthy();
  });

  it('flips the raised card to Tell! after the deal', () => {
    vi.useFakeTimers();
    const { container } = renderAt('/');
    expect(container.querySelector('.tcard-big')).toBeNull();
    act(() => vi.advanceTimersByTime(1500));
    expect(container.querySelector('.tcard-big')?.textContent).toBe('Tell!');
  });
});

describe('routes', () => {
  it.each(['/lab', '/run/abc', '/card/xyz', '/check', '/board', '/traps', '/how', '/docs', '/device'])(
    '%s renders inside the shared layout',
    (path) => {
      renderAt(path);
      expect(screen.getByRole('heading', { level: 1 })).toBeTruthy();
      expect(screen.getAllByLabelText('Tell, home').length).toBeGreaterThan(0);
    },
  );

  it('shows a friendly not-found page', () => {
    renderAt('/nope');
    expect(screen.getByText('That card isn\u2019t in the deck.')).toBeTruthy();
  });

  it('device check says plainly when Firebase is not configured', () => {
    renderAt('/device');
    expect(screen.getByText('Not connected to Firebase yet.')).toBeTruthy();
  });
});

describe('TrapCard', () => {
  it('announces state and evidence', () => {
    render(<TrapCard trap={getTrap('whisper')} state="fired" evidence="14:02:11 · word ✓ strong" />);
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe('The Whisper: Fired. 14:02:11 · word ✓ strong');
  });

  it('never shows a suspicious hit as fired', () => {
    render(<TrapCard trap={getTrap('cipher')} state="suspicious" />);
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe('The Cipher: Suspicious');
  });
});
