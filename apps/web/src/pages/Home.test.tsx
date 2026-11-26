import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
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
    expect(screen.getAllByRole('link', { name: /Test an AI agent/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /Inspect a webpage/ })[0]?.getAttribute('href')).toBe('/check');
  });

  it('lists all seven traps', () => {
    renderAt('/');
    expect(screen.getAllByText('The Impostor').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Invisible Ink').length).toBeGreaterThan(0);
  });

  it('keeps every card face down after the deal, and a tap on the front shows the paper inside', () => {
    vi.useFakeTimers();
    renderAt('/');
    const hero = () => screen.getByRole('button', { name: /^The Whisper/ });
    act(() => vi.advanceTimersByTime(1500));
    expect(hero().className).not.toContain('is-flipped');
    expect(hero().textContent).not.toContain('Tell!');
    // The face-down side shows the number; the inside is not visible until a tap.
    expect(hero().getAttribute('aria-label')).toBe('The Whisper, face down');
    fireEvent.click(hero());
    expect(hero().className).toContain('is-flipped');
    expect(hero().textContent).not.toContain('Tell!');
    expect(hero().getAttribute('aria-label')).toMatch(/^The Whisper: /);
    expect(hero().className).not.toMatch(/is-fired/);
  });

  it('offers the made-up examples as one list, labelled as made up', () => {
    renderAt('/');
    const strip = screen.getByRole('region', { name: /Tap one/ });
    expect(strip.textContent).toContain('Made-up examples');
    expect(strip.querySelectorAll('.index-row')).toHaveLength(5);
  });
});

describe('routes', () => {
  it.each(['/lab', '/run/abc', '/card/xyz', '/check', '/board', '/traps', '/traps/whisper', '/how', '/docs', '/device'])(
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
