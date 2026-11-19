import type { ReactNode } from 'react';
import { usePageTitle } from '../lib/title';
import { Button } from './Button';

interface StubProps {
  title: string;
  kicker: string;
  heading: ReactNode;
  lede: ReactNode;
  children?: ReactNode;
  /** False for pages that are finished but empty, like not-found. */
  building?: boolean;
}

/**
 * Shared shell for pages that are still being built. Honest about it, and
 * never a dead end: there is always a way back to something that works.
 */
export function Stub({ title, kicker, heading, lede, children, building = true }: StubProps) {
  usePageTitle(title);
  return (
    <section className="stub">
      <p className="label">{kicker}</p>
      <h1 className="h1">{heading}</h1>
      <p className="lede muted">{lede}</p>
      <div className="stub-body">
        {children}
        {building ? <p className="small muted">This page is being built. It arrives in the next few days.</p> : null}
        <div className="stub-actions">
          <Button to="/" variant="ghost" arrow>
            Back to the home page
          </Button>
        </div>
      </div>
    </section>
  );
}
