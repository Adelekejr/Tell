import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Outlet, useLocation, useNavigation } from 'react-router';
import { Footer } from './Footer';
import { LogoLoadingContext } from './logo-loading';
import { Dateline, NavBar } from './NavBar';
import { isWorking, subscribeWork } from '../lib/working';

/** Shortest sway, so even a quick load shows one clear left-right swing. */
export const MIN_SWAY_MS = 700;
/** A route change counts as loading the new page for this long. */
const ROUTE_LOAD_MS = 500;

/** True while `on` is true, and for at least `min` ms after it turns on. */
function useHeld(on: boolean, min: number): boolean {
  const [prevOn, setPrevOn] = useState(on);
  const [hold, setHold] = useState(false);
  const since = useRef(0);
  if (on !== prevOn) {
    setPrevOn(on);
    setHold(!on);
  }
  useEffect(() => {
    if (on) {
      since.current = Date.now();
      return;
    }
    if (!hold) return;
    const t = window.setTimeout(() => setHold(false), Math.max(0, min - (Date.now() - since.current)));
    return () => window.clearTimeout(t);
  }, [on, hold, min]);
  return on || hold;
}

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
  const working = useSyncExternalStore(subscribeWork, isWorking, () => false);
  const [routeLoading, setRouteLoading] = useState(false);
  const firstPath = useRef(pathname);
  // Booting: until the fonts are in and the first screen is drawn.
  useEffect(() => {
    let live = true;
    const fonts = typeof document !== 'undefined' && document.fonts ? document.fonts.ready : Promise.resolve();
    void Promise.resolve(fonts)
      .catch(() => undefined)
      .then(() => {
        if (live) setInitialLoading(false);
      });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    window.scrollTo(0, 0);
    if (pathname === firstPath.current) return;
    firstPath.current = pathname;
    setRouteLoading(true);
    const t = window.setTimeout(() => setRouteLoading(false), ROUTE_LOAD_MS);
    return () => window.clearTimeout(t);
  }, [pathname]);

  // The live run is "the table": the one full-ink screen on a paper site.
  const table = pathname.startsWith('/run/');
  // The logo sways only while something is working, and settles still once it is done.
  const logoLoading = useHeld(initialLoading || routeLoading || navigation.state !== 'idle' || loaders.size > 0 || working, MIN_SWAY_MS);

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
