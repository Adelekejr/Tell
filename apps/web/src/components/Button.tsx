import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router';

type Variant = 'primary' | 'ghost' | 'accent';

interface Common {
  variant?: Variant;
  size?: 'door' | 'sm';
  /** Second line under the label on 56px door buttons. */
  sub?: ReactNode;
  /** Shows the mono arrow on the right. */
  arrow?: boolean;
  children: ReactNode;
  className?: string;
}

type AsLink = Common & { to: string; external?: boolean };
type AsButton = Common &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'className'> & {
    to?: undefined;
    loading?: boolean;
    loadingLabel?: string;
  };

export type ButtonProps = AsLink | AsButton;

function classes(p: Common): string {
  return ['btn', `btn-${p.variant ?? 'primary'}`, p.size === 'sm' ? 'btn-sm' : '', p.className ?? '']
    .filter(Boolean)
    .join(' ');
}

function Body({ children, sub, arrow }: Pick<Common, 'children' | 'sub' | 'arrow'>) {
  return (
    <>
      <span>
        {children}
        {sub ? <span className="sub">{sub}</span> : null}
      </span>
      {arrow ? (
        <span className="arrow" aria-hidden="true">
          {'\u2192'}
        </span>
      ) : null}
    </>
  );
}

/**
 * Door buttons are 56px with a sub-line; small buttons are 44px.
 * Loading keeps the width fixed: the label becomes "Working..." with a 1px line.
 */
export function Button(props: ButtonProps) {
  if (props.to !== undefined) {
    const { to, external, children, sub, arrow } = props;
    if (external) {
      return (
        <a className={classes(props)} href={to} target="_blank" rel="noreferrer">
          <Body sub={sub} arrow={arrow}>
            {children}
          </Body>
        </a>
      );
    }
    return (
      <Link className={classes(props)} to={to}>
        <Body sub={sub} arrow={arrow}>
          {children}
        </Body>
      </Link>
    );
  }
  const { variant: _v, size: _s, sub, arrow, children, className: _c, loading, loadingLabel, type, disabled, ...rest } =
    props;
  return (
    <button
      {...rest}
      type={type ?? 'button'}
      className={classes(props)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      <Body sub={loading ? undefined : sub} arrow={arrow && !loading}>
        {loading ? (loadingLabel ?? 'Working\u2026') : children}
      </Body>
      {loading ? <span className="busy-line" aria-hidden="true" /> : null}
    </button>
  );
}
