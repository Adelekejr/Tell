import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router';
import { Footer } from './Footer';
import { Dateline, NavBar } from './NavBar';

export function Layout() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  // The live run is "the table": the one full-ink screen on a paper site.
  const table = pathname.startsWith('/run/');

  return (
    <div className={table ? 'page dark is-table' : 'page'}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <NavBar tone={table ? 'dark' : 'paper'} />
      {table ? null : <Dateline />}
      <main id="main" tabIndex={-1}>
        <Outlet />
      </main>
      <Footer tone={table ? 'dark' : 'paper'} />
    </div>
  );
}
