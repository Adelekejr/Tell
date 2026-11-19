/** One small icon set: 16px grid, 1.5 stroke, square caps. */
import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement>;
const base = { viewBox: '0 0 16 16', 'aria-hidden': true, focusable: false } as const;

export function ChipIcon(p: P) {
  return (
    <svg {...base} fill="none" stroke="currentColor" strokeWidth="1.5" {...p}>
      <rect x="3.5" y="3.5" width="9" height="9" rx="1" />
      <path d="M6 1v2.5M10 1v2.5M6 12.5V15M10 12.5V15M1 6h2.5M1 10h2.5M12.5 6H15M12.5 10H15" />
    </svg>
  );
}

export function CloudIcon(p: P) {
  return (
    <svg {...base} fill="none" stroke="currentColor" strokeWidth="1.5" {...p}>
      <path d="M4.5 12.5h7a3 3 0 0 0 .4-5.97A4 4 0 0 0 4.2 7.6 2.5 2.5 0 0 0 4.5 12.5Z" />
    </svg>
  );
}

export function RulesIcon(p: P) {
  return (
    <svg {...base} fill="none" stroke="currentColor" strokeWidth="1.5" {...p}>
      <path d="M2.5 4h11M2.5 8h11M2.5 12h7" />
    </svg>
  );
}

/** Filled "!" for FIRED. The cut-out uses the card's accent. */
export function FiredIcon(p: P) {
  return (
    <svg {...base} {...p}>
      <circle cx="8" cy="8" r="7" fill="currentColor" />
      <path d="M8 4.2v4.6" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="8" cy="11.3" r="1" fill="var(--accent)" />
    </svg>
  );
}

export function HeldIcon(p: P) {
  return (
    <svg {...base} fill="none" stroke="currentColor" strokeWidth="1.5" {...p}>
      <circle cx="8" cy="8" r="6.75" />
      <path d="m5 8.2 2 2 4-4.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SuspiciousIcon(p: P) {
  return (
    <svg {...base} fill="none" stroke="currentColor" strokeWidth="1.5" {...p}>
      <circle cx="8" cy="8" r="6.75" strokeDasharray="2.2 1.8" />
      <path d="M6.3 6.2a1.8 1.8 0 1 1 2.5 1.6c-.5.2-.8.6-.8 1.1v.4" strokeLinecap="round" />
      <circle cx="8" cy="11.6" r=".8" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function AlertIcon(p: P) {
  return (
    <svg {...base} fill="none" stroke="currentColor" strokeWidth="1.5" {...p}>
      <circle cx="8" cy="8" r="6.75" />
      <path d="M8 4.5v4.2" strokeLinecap="round" />
      <circle cx="8" cy="11.2" r=".8" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function MenuIcon(p: P) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" {...p}>
      <path d="M3 7h14M3 13h14" />
    </svg>
  );
}

export function CloseIcon(p: P) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" {...p}>
      <path d="m5 5 10 10M15 5 5 15" />
    </svg>
  );
}

export function CopyIcon(p: P) {
  return (
    <svg {...base} fill="none" stroke="currentColor" strokeWidth="1.5" {...p}>
      <rect x="5.25" y="5.25" width="8" height="8" rx="1.25" />
      <path d="M10.75 5.25V3.5a.75.75 0 0 0-.75-.75H3.5a.75.75 0 0 0-.75.75V10c0 .41.34.75.75.75h1.75" />
    </svg>
  );
}

export function CheckIcon(p: P) {
  return (
    <svg {...base} fill="none" stroke="currentColor" strokeWidth="1.6" {...p}>
      <path d="m3.5 8.4 3 3 6-6.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ShareIcon(p: P) {
  return (
    <svg {...base} fill="none" stroke="currentColor" strokeWidth="1.5" {...p}>
      <path d="M8 10V2M5 5l3-3 3 3M3 8.5V14h10V8.5" />
    </svg>
  );
}
