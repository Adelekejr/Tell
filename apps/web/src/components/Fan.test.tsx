import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { rubber } from '../lib/motion';
import { Fan } from './Fan';
import { swipeSteps } from './fan-state';

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

function swipe(dx: number, el: Element = cards()[front()]!) {
  fireEvent.pointerDown(el, { pointerId: 1, button: 0, clientX: 200, clientY: 100 });
  fireEvent.pointerMove(el, { pointerId: 1, clientX: 200 + dx / 2, clientY: 101 });
  fireEvent.pointerUp(el, { pointerId: 1, clientX: 200 + dx, clientY: 101 });
  fireEvent.click(el);
}

describe('home fan', () => {
  it('is one keyboard stop: seven cards in number order, arrows turn the fan', () => {
    setReducedMotion(false);
    render(<Fan />);
    expect(fan().getAttribute('aria-label')).toMatch(/Press the front card to flip it/);
    expect(cards()).toHaveLength(7);
    expect(offsets()).toEqual([-3, -2, -1, 0, 1, 2, 3]);
    expect(cards().filter((c) => c.tabIndex === 0)).toEqual([cards()[3]]);
    act(() => cards()[3]!.focus());
    fireEvent.keyDown(cards()[3]!, { key: 'ArrowRight' });
    expect(front()).toBe(4);
    expect(document.activeElement).toBe(cards()[4]);
    fireEvent.keyDown(cards()[4]!, { key: 'ArrowLeft' });
    fireEvent.keyDown(cards()[3]!, { key: 'ArrowLeft' });
    expect(front()).toBe(2);
    expect(document.activeElement).toBe(cards()[2]);
  });

  it('tapping the front card flips it to its trick and back', () => {
    setReducedMotion(false);
    render(<Fan />);
    fireEvent.click(cards()[1]!);
    expect(front()).toBe(1);
    expect(cards()[1]!.getAttribute('aria-label')).toBe('Ghost Letters, face down');
    fireEvent.click(cards()[1]!);
    expect(cards()[1]!.getAttribute('aria-label')).toMatch(/^Ghost Letters: /);
    expect(cards()[1]!.className).toContain('is-flipped');
    fireEvent.click(cards()[1]!);
    expect(cards()[1]!.getAttribute('aria-label')).toBe('Ghost Letters, face down');
  });

  it('tapping a card further round rolls the fan the short way until it is at the front', () => {
    setReducedMotion(false);
    render(<Fan />);
    for (const target of [0, 6, 5, 1, 4, 3]) {
      fireEvent.click(cards()[target]!);
      expect(front()).toBe(target);
      expect(slot(target).style.zIndex).toBe('10');
      expect(slot(target).style.getPropertyValue('--lift')).toBe('-22px');
      expect(slot(target).style.getPropertyValue('--rot')).toBe('0deg');
    }
    // No.01 at the front: No.05 to No.07 wrap round to its left, in order.
    fireEvent.click(cards()[0]!);
    expect(offsets()).toEqual([0, 1, 2, 3, -3, -2, -1]);
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

  it('swipes turn the fan both ways, wrap all the way round, and are not taps', () => {
    vi.useFakeTimers();
    setReducedMotion(false);
    render(<Fan />);
    const seen: number[] = [];
    for (let k = 0; k < 7; k += 1) {
      swipe(-60);
      act(() => vi.advanceTimersByTime(500));
      seen.push(front());
      // Never flipped by the swipe's own click.
      expect(cards().some((c) => c.className.includes('is-flipped') && c !== cards()[3])).toBe(false);
    }
    expect(seen).toEqual([4, 5, 6, 0, 1, 2, 3]);
    seen.length = 0;
    for (let k = 0; k < 7; k += 1) {
      swipe(60);
      act(() => vi.advanceTimersByTime(500));
      seen.push(front());
      const a = front();
      const order = cards()
        .map((_, i) => i)
        .sort((x, y) => offsets()[x]! - offsets()[y]!);
      expect(order).toEqual([-3, -2, -1, 0, 1, 2, 3].map((d) => (a + d + 7) % 7));
    }
    expect(seen).toEqual([2, 1, 0, 6, 5, 4, 3]);
  });

  it('a long fling turns more than one card, a short wobble none', () => {
    expect(swipeSteps(10, 100)).toBe(0);
    expect(swipeSteps(-40, 400)).toBe(1);
    expect(swipeSteps(-60, 1)).toBe(1);
    expect(swipeSteps(40, 400)).toBe(-1);
    expect(swipeSteps(-140, 400)).toBe(2);
    expect(swipeSteps(-140, 50)).toBe(3);
    expect(swipeSteps(-10_000, 1)).toBe(3);
  });

  it('a vertical drag scrolls the page and changes nothing', () => {
    setReducedMotion(false);
    render(<Fan />);
    const c = cards()[3]!;
    fireEvent.pointerDown(c, { pointerId: 2, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(c, { pointerId: 2, clientX: 102, clientY: 200 });
    fireEvent.pointerUp(c, { pointerId: 2, clientX: 102, clientY: 300 });
    fireEvent.click(c);
    expect(front()).toBe(3);
    expect(c.getAttribute('aria-label')).toBe('The Whisper, face down');
  });

  it('the mouse wheel and trackpad turn one card per gesture', () => {
    vi.useFakeTimers();
    setReducedMotion(false);
    render(<Fan />);
    fireEvent.wheel(fan(), { deltaY: 40 });
    fireEvent.wheel(fan(), { deltaY: 40 });
    fireEvent.wheel(fan(), { deltaY: 40 });
    expect(front()).toBe(4);
    act(() => vi.advanceTimersByTime(400));
    fireEvent.wheel(fan(), { deltaX: -50, deltaY: 5 });
    expect(front()).toBe(3);
    act(() => vi.advanceTimersByTime(400));
    fireEvent.wheel(fan(), { deltaY: -40 });
    expect(front()).toBe(2);
  });

  it('with reduced motion the hand is shown at once and still turns', () => {
    setReducedMotion(true);
    render(<Fan />);
    expect(cards()[3]!.getAttribute('aria-label')).toBe('The Whisper: Tell! It fired.');
    swipe(-60);
    expect(front()).toBe(4);
  });

  it('the pull resists: it never passes its limit', () => {
    expect(rubber(0, 36)).toBe(0);
    expect(rubber(10_000, 36)).toBeLessThanOrEqual(36);
    expect(rubber(-10_000, 24)).toBeGreaterThanOrEqual(-24);
    expect(Math.abs(rubber(10, 36))).toBeLessThan(10);
  });
});
