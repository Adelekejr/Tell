import { createContext, useContext, useEffect, useId } from 'react';

export type LogoLoadingRegistration = (id: string, loading: boolean) => void;
export const LogoLoadingContext = createContext<LogoLoadingRegistration>(() => {});

/** Register a route or page loader so both site lockups can move only while loading. */
export function useLogoLoading(loading: boolean) {
  const register = useContext(LogoLoadingContext);
  const id = useId();
  useEffect(() => {
    register(id, loading);
    return () => register(id, false);
  }, [id, loading, register]);
}
