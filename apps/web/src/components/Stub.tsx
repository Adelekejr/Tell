import type { ReactNode } from 'react';
import { usePageTitle } from '../lib/title';
import { Button } from './Button';

interface StubProps {
  title: string;
  kicker: string;
  heading: ReactNode;
  lede: ReactNode;
  children?: ReactNode;
}

/**
 * A short page with a way back home: used for not-found. Never a dead end.
 */
export function Stub({ title, kicker, heading, lede, children }: StubProps) {
  usePageTitle(title);
  return (
    <section className="stub">
      <p className="label">{kicker}</p>
      <h1 className="h1">{heading}</h1>
      <p className="lede muted">{lede}</p>
      <div className="stub-body">
        {children}
        <div className="stub-actions">
          <Button to="/" variant="ghost" arrow>
            Back to the home page
          </Button>
        </div>
      </div>
    </section>
  );
}
