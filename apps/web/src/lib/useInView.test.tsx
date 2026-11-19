import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useInView } from './useInView';

type Cb = (entries: { isIntersecting: boolean }[]) => void;
let fire: Cb = () => {};
class FakeObserver {
  constructor(cb: Cb) {
    fire = cb;
  }
  observe() {}
  disconnect() {}
}

function Probe({ enabled = true }: { enabled?: boolean }) {
  const seen = useInView('target', enabled);
  return (
    <>
      <div id="target" />
      <p>{seen ? 'in view' : 'out of view'}</p>
    </>
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('useInView', () => {
  it('follows the observer, so a sticky shortcut can step aside when its target is on screen', () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    render(<Probe />);
    expect(screen.getByText('out of view')).toBeTruthy();
    act(() => fire([{ isIntersecting: true }]));
    expect(screen.getByText('in view')).toBeTruthy();
    act(() => fire([{ isIntersecting: false }]));
    expect(screen.getByText('out of view')).toBeTruthy();
  });

  it('stays false when switched off or when the browser has no observer', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    render(<Probe />);
    expect(screen.getByText('out of view')).toBeTruthy();
    cleanup();
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    render(<Probe enabled={false} />);
    act(() => fire([{ isIntersecting: true }]));
    expect(screen.getByText('out of view')).toBeTruthy();
  });
});
