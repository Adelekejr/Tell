import { useEffect, useState } from 'react';

/**
 * True while the element with this id is on screen. Used to hide a sticky
 * shortcut once the thing it points at is already in view, so a view never
 * shows two main actions at once.
 */
export function useInView(id: string, enabled = true): boolean {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    if (!enabled || typeof IntersectionObserver === 'undefined') return;
    const el = document.getElementById(id);
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setInView(!!entry?.isIntersecting), { threshold: 0.25 });
    io.observe(el);
    return () => {
      io.disconnect();
      setInView(false);
    };
  }, [id, enabled]);
  return enabled && inView;
}
