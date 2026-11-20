import { useCallback, useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigation } from 'react-router';
import { Footer } from './Footer';
import { LogoLoadingContext } from './logo-loading';
import { Dateline, NavBar } from './NavBar';

export function Layout() {
  const { pathname } = useLocation();
  const navigation = useNavigation();
  const [initialLoading, setInitialLoading] = useState(true);
  const [loaders, setLoaders] = useState<ReadonlySet<string>>(() => new Set());
  const registerLoading = useCallback((id: string, loading: boolean) => {
    setLoaders((current) => {
      if (current.has(id) === loading) return current;
      const next = new Set(current);
      if (loading) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => setInitialLoading(false), 1000);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  // The live run is "the table": the one full-ink screen on a paper site.
  const table = pathname.startsWith('/run/');
  const logoLoading = initialLoading || navigation.state !== 'idle' || loaders.size > 0;

  return (
    <LogoLoadingContext.Provider value={registerLoading}>
      <div className={table ? 'page dark is-table' : 'page'}>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <NavBar tone={table ? 'dark' : 'paper'} loading={logoLoading} />
        {table ? null : <Dateline />}
        <main id="main" tabIndex={-1}>
          <Outlet />
        </main>
        <Footer tone={table ? 'dark' : 'paper'} loading={logoLoading} />
      </div>
    </LogoLoadingContext.Provider>
  );
}
