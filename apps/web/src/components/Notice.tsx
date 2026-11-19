import type { ReactNode } from 'react';
import { AlertIcon } from './icons';

export function Notice({ children, role = 'status' }: { children: ReactNode; role?: 'status' | 'alert' }) {
  return (
    <div className="notice" role={role}>
      <AlertIcon />
      <div>{children}</div>
    </div>
  );
}
