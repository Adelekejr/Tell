import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
const offsets = () => cards().map((_, i) => Number(slot(i).dataset.offset));
const front = () => offsets().indexOf(0);
const fan = () => screen.getByRole('toolbar');

function drag(dx: number, steps = 6, end = true) {
  const el = cards()[front()]!;
  fireEvent.pointerDown(el, { pointerId: 1, button: 0, clientX: 200, clientY: 100 });
  for (let k = 1; k <= steps; k += 1) {
    // A steady, unhurried drag (when the clock is faked): no flick momentum.
    if (vi.isFakeTimers()) vi.advanceTimersByTime(60);
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 200 + (dx * k) / steps, clientY: 101 });
  }
  if (!end) return;
  fireEvent.pointerUp(el, { pointerId: 1, clientX: 200 + dx, clientY: 101 });
  fireEvent.click(el);
}

describe('home fan', () => {
  it('deals No.01 to No.07 in order with No.02 at the front', () => {
    setReducedMotion(true);
    render(<Fan />);
    expect(cards().map((c) => c.parentElement!.dataset.no)).toEqual(['1', '2', '3', '4', '5', '6', '7']);
    expect(offsets()).toEqual([-1, 0, 1, 2, 3, -3, -2]);
    expect(slot(1).style.zIndex).toBe('100');
    expect(cards().filter((c) => c.tabIndex === 0)).toEqual([cards()[1]]);
    expect(fan().getAttribute('aria-label')).toMatch(/Press the front card to flip it/);
    expect(screen.getByText(/No\.02 of 7, The Whisper, at the front/)).toBeTruthy();
  });

  it('a drag moves the cards with the finger before it is let go', () => {
    setReducedMotion(true);
    render(<Fan />);
    const before = cards().map((_, i) => slot(i).style.transform);
    drag(-30, 3, false);
    const during = cards().map((_, i) => slot(i).style.transform);
    expect(during.every((t, i) => t !== before[i])).toBe(true);
    expect(front()).toBe(1);
  });

  it('swipes turn the ring both ways, all the way round, and are not taps', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    setReducedMotion(true);
    render(<Fan />);
    const seen: number[] = [];
    for (let k = 0; k < 7; k += 1) {
      drag(-80);
      seen.push(front());
    }
    expect(seen).toEqual([2, 3, 4, 5, 6, 0, 1]);
    seen.length = 0;
    for (let k = 0; k < 7; k += 1) {
      drag(80);
      seen.push(front());
    }
    expect(seen).toEqual([0, 6, 5, 4, 3, 2, 1]);
    expect(cards().some((c) => c.className.includes('is-flipped') && c !== cards()[1])).toBe(false);
  });

  it('tapping a card further round brings it to the front; tapping the front card flips it', () => {
    setReducedMotion(true);
    render(<Fan />);
    for (const target of [0, 6, 5, 1, 4, 3]) {
      fireEvent.click(cards()[target]!);
      expect(front()).toBe(target);
      expect(slot(target).style.zIndex).toBe('100');
    }
    fireEvent.click(cards()[3]!);
    expect(cards()[3]!.getAttribute('aria-label')).toMatch(/^The Cipher: /);
    fireEvent.click(cards()[3]!);
    expect(cards()[3]!.getAttribute('aria-label')).toBe('The Cipher, face down');
  });

  it('arrow keys turn the ring and keep focus on the front card', () => {
    setReducedMotion(true);
    render(<Fan />);
    act(() => cards()[1]!.focus());
    fireEvent.keyDown(cards()[1]!, { key: 'ArrowRight' });
    expect(front()).toBe(2);
    expect(document.activeElement).toBe(cards()[2]);
    fireEvent.keyDown(cards()[2]!, { key: 'ArrowLeft' });
    fireEvent.keyDown(cards()[1]!, { key: 'ArrowLeft' });
    expect(front()).toBe(0);
    expect(document.activeElement).toBe(cards()[0]);
  });

  it('a mouse wheel notch turns one card each way', () => {
    setReducedMotion(true);
    render(<Fan />);
    fireEvent.wheel(fan(), { deltaY: 100 });
    expect(front()).toBe(2);
    fireEvent.wheel(fan(), { deltaY: -100 });
    fireEvent.wheel(fan(), { deltaX: -100 });
    expect(front()).toBe(0);
  });

  it('a vertical drag scrolls the page and changes nothing', () => {
    setReducedMotion(true);
    render(<Fan />);
    const c = cards()[1]!;
    fireEvent.pointerDown(c, { pointerId: 2, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(c, { pointerId: 2, clientX: 102, clientY: 200 });
    fireEvent.pointerCancel(c, { pointerId: 2 });
    expect(front()).toBe(1);
  });

  it('with motion, the ring springs onto the card and the raised card turns to Tell!', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    setReducedMotion(false);
    render(<Fan />);
    act(() => vi.advanceTimersByTime(1500));
    expect(cards()[1]!.getAttribute('aria-label')).toBe('The Whisper: Tell! It fired.');
    fireEvent.click(cards()[4]!);
    act(() => vi.advanceTimersByTime(100));
    expect(front()).not.toBe(4);
    act(() => vi.advanceTimersByTime(1500));
    expect(front()).toBe(4);
    expect(slot(4).style.transform).toMatch(/^rotate\(0(\.0+)?deg\)/);
  });
});
