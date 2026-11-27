import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router';
import { Button } from './Button';
import { CloseIcon, MenuIcon } from './icons';
import { Logo } from './Logo';

const NAV_LINKS = [
  { to: '/try', label: 'Try it' },
  { to: '/lab', label: 'Lab' },
  { to: '/check', label: 'Check' },
  { to: '/traps', label: 'Traps' },
  { to: '/board', label: 'Board' },
  { to: '/how', label: 'How it works' },
] as const;

export function NavBar({ tone = 'paper' }: { tone?: 'paper' | 'dark' }) {
  const { pathname } = useLocation();
  // The menu remembers which page it was opened on, so it closes itself on navigation.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const setOpen = (next: boolean | ((v: boolean) => boolean)) =>
    setOpenOn((prev) => {
      const value = typeof next === 'function' ? next(prev === pathname) : next;
      return value ? pathname : null;
    });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpenOn(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <header className="nav">
      <Logo tone={tone} />
      <nav className="nav-links" aria-label="Main">
        {NAV_LINKS.map((l) => (
          <NavLink key={l.to} to={l.to}>
            {l.label}
          </NavLink>
        ))}
      </nav>
      <div className="nav-cta">
        <Button to="/lab" size="sm">
          Test my agent {'\u2192'}
        </Button>
      </div>
      <button
        type="button"
        className="menu-btn"
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
        aria-controls="menu-sheet"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <CloseIcon /> : <MenuIcon />}
      </button>
      {open ? (
        <nav className="menu-sheet" id="menu-sheet" aria-label="Main">
          {NAV_LINKS.map((l, i) => (
            <NavLink key={l.to} to={l.to}>
              {l.label}
              <span className="mono">{String(i + 1).padStart(2, '0')}</span>
            </NavLink>
          ))}
          <Button to="/lab" arrow sub="Live test or prompt drill">
            Test my agent
          </Button>
        </nav>
      ) : null}
    </header>
  );
}

/** The newspaper-style strip under the nav. */
export function Dateline() {
  return (
    <div className="dateline">
      <span className="label">A field test for AI agents</span>
      <span className="label">
        <span className="m-only">Firebase AI Logic</span>
        <span className="d-only">Firebase AI Logic {'\u00B7'} Gemini Nano + Cloud</span>
      </span>
      <span className="label">
        <span className="m-only">
          7 traps<span className="dl-extra"> {'\u00B7'} hybrid AI</span>
        </span>
        <span className="d-only">7 traps {'\u00B7'} no login</span>
      </span>
    </div>
  );
}
