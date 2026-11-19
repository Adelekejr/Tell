import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

function subscribe(cb: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mq = window.matchMedia(QUERY);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(QUERY).matches;
}

/** True when the device asks for less motion. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, prefersReducedMotion, () => false);
}

/** A short tap on phones that support it, skipped with reduced motion. */
export function tick(): void {
  if (prefersReducedMotion()) return;
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(12);
}

/** Soft limit: follows the finger at first, then resists. Never passes `max`. */
export function rubber(delta: number, max: number): number {
  return max * Math.tanh(delta / (max * 2));
}
