import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { rubber } from '../lib/motion';
import { Fan } from './Fan';

function setReducedMotion(on: boolean) {
  window.matchMedia = ((q: string) => ({
    matches: on && q.includes('reduce'),
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const cards = () => screen.getAllByRole('button');
const slot = (i: number) => cards()[i]!.parentElement!;

describe('home fan', () => {
  it('is one keyboard stop: seven cards in a toolbar, arrows move between them', () => {
    setReducedMotion(false);
    render(<Fan />);
    expect(screen.getByRole('toolbar').getAttribute('aria-label')).toMatch(/Press a card to flip it/);
    expect(cards()).toHaveLength(7);
    expect(cards().filter((c) => c.tabIndex === 0)).toHaveLength(1);
    act(() => cards()[3]!.focus());
    fireEvent.keyDown(cards()[3]!, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(cards()[4]);
    fireEvent.keyDown(cards()[4]!, { key: 'Home' });
    expect(document.activeElement).toBe(cards()[0]);
    fireEvent.keyDown(cards()[0]!, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(cards()[6]);
  });

  it('a tap (or Enter or Space, which click a button) flips a card to its trick and back', () => {
    setReducedMotion(false);
    render(<Fan />);
    expect(cards()[0]!.getAttribute('aria-label')).toBe('Invisible Ink, face down');
    fireEvent.click(cards()[0]!);
    expect(cards()[0]!.getAttribute('aria-label')).toMatch(/^Invisible Ink: CSS-hidden text/);
    expect(cards()[0]!.className).toContain('is-flipped');
    fireEvent.click(cards()[0]!);
    expect(cards()[0]!.getAttribute('aria-label')).toBe('Invisible Ink, face down');
  });

  it('the raised card turns to Tell! after the deal, and stays put once a visitor has flipped it', () => {
    vi.useFakeTimers();
    setReducedMotion(false);
    render(<Fan />);
    expect(cards()[3]!.getAttribute('aria-label')).toBe('The Whisper, face down');
    act(() => vi.advanceTimersByTime(1500));
    expect(cards()[3]!.getAttribute('aria-label')).toBe('The Whisper: Tell! It fired.');
    fireEvent.click(cards()[3]!);
    expect(cards()[3]!.getAttribute('aria-label')).toBe('The Whisper, face down');
  });

  it('a vertical pull follows the pointer a little, springs back on release, and is not a flip', () => {
    setReducedMotion(false);
    render(<Fan />);
    const c = cards()[1]!;
    fireEvent.pointerDown(c, { pointerId: 1, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(c, { pointerId: 1, clientX: 100, clientY: 400 });
    const dy = parseFloat(slot(1).style.getPropertyValue('--dy'));
    expect(dy).toBeGreaterThan(20);
    expect(dy).toBeLessThan(24);
    expect(slot(1).className).toContain('is-dragging');
    fireEvent.pointerUp(c, { pointerId: 1, clientX: 100, clientY: 400 });
    fireEvent.click(c);
    expect(slot(1).style.getPropertyValue('--dy')).toBe('0px');
    expect(slot(1).className).not.toContain('is-dragging');
    expect(c.getAttribute('aria-label')).toBe('Ghost Letters, face down');
  });

  it('a horizontal swipe rotates every card one slot, keeps taps, and wraps', () => {
    setReducedMotion(false);
    render(<Fan />);
    const whisper = cards()[3]!;
    fireEvent.pointerDown(whisper, { pointerId: 3, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(whisper, { pointerId: 3, clientX: 40, clientY: 102 });
    fireEvent.pointerUp(whisper, { pointerId: 3, clientX: 40, clientY: 102 });
    fireEvent.click(whisper);
    expect(cards().map((c) => c.getAttribute('aria-label'))).toEqual([
      'Ghost Letters, face down',
      'The Cipher, face down',
      'The Whisper, face down',
      'The Hashtag, face down',
      'The Postcard, face down',
      'The Impostor, face down',
      'Invisible Ink, face down',
    ]);
    expect(slot(3).style.getPropertyValue('--lift')).toBe('-22px');
    fireEvent.click(cards()[3]!);
    expect(cards()[3]!.getAttribute('aria-label')).toMatch(/^The Hashtag: /);

    const center = cards()[3]!;
    fireEvent.pointerDown(center, { pointerId: 4, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(center, { pointerId: 4, clientX: 160, clientY: 101 });
    fireEvent.pointerUp(center, { pointerId: 4, clientX: 160, clientY: 101 });
    fireEvent.click(center);
    expect(cards().map((c) => c.getAttribute('aria-label'))[3]).toMatch(/^The Whisper/);
  });

  it('a cancelled pull (the page scrolled) also springs back', () => {
    setReducedMotion(false);
    render(<Fan />);
    const c = cards()[2]!;
    fireEvent.pointerDown(c, { pointerId: 7, button: 0, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(c, { pointerId: 7, clientX: 30, clientY: 30 });
    expect(slot(2).style.getPropertyValue('--dy')).not.toBe('0px');
    fireEvent.pointerCancel(c, { pointerId: 7 });
    expect(slot(2).style.getPropertyValue('--dx')).toBe('0px');
    expect(slot(2).style.getPropertyValue('--dy')).toBe('0px');
  });

  it('with reduced motion the hand is shown at once and cards do not follow the pointer', () => {
    setReducedMotion(true);
    render(<Fan />);
    expect(cards()[3]!.getAttribute('aria-label')).toBe('The Whisper: Tell! It fired.');
    const c = cards()[0]!;
    fireEvent.pointerDown(c, { pointerId: 1, button: 0, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(c, { pointerId: 1, clientX: 200, clientY: 0 });
    expect(slot(0).style.getPropertyValue('--dx')).toBe('');
    fireEvent.click(c);
    expect(c.getAttribute('aria-label')).toMatch(/^Invisible Ink: /);
  });

  it('still rotates on a horizontal swipe with reduced motion and does not pull the card', () => {
    setReducedMotion(true);
    render(<Fan />);
    const card = cards()[0]!;
    fireEvent.pointerDown(card, { pointerId: 8, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(card, { pointerId: 8, clientX: 40, clientY: 101 });
    expect(slot(0).style.getPropertyValue('--dx')).toBe('');
    fireEvent.pointerUp(card, { pointerId: 8, clientX: 40, clientY: 101 });
    fireEvent.click(card);
    expect(cards()[0]!.getAttribute('aria-label')).toBe('Ghost Letters, face down');
  });

  it('the pull resists: it never passes its limit', () => {
    expect(rubber(0, 36)).toBe(0);
    expect(rubber(10_000, 36)).toBeLessThanOrEqual(36);
    expect(rubber(-10_000, 24)).toBeGreaterThanOrEqual(-24);
    expect(Math.abs(rubber(10, 36))).toBeLessThan(10);
  });
});
