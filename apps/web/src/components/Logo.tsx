import { Link } from 'react-router';

/** The Fault lockup. The existing SVG paths remain unchanged. */
export function Logo({ tone = 'paper', loading = false }: { tone?: 'paper' | 'dark'; loading?: boolean }) {
  const ink = tone === 'dark' ? '#F6F5F1' : '#0B0B0C';
  const crack = tone === 'dark' ? '#6F7DFF' : '#3B4BFF';
  return (
    <Link className={`logo${loading ? ' is-loading' : ''}`} to="/" aria-label="Tell, home">
      <svg aria-hidden="true" width="65" height="26" viewBox="-80 -937 2906.3 1154" fillRule="evenodd">
        <g transform="translate(0 -857) scale(20.71)">
          <g className="logo-mark-t">
            <path d="M6 6H42V18H6Z" fill={ink} />
            <path d="M18 17L30 17L30 26L18 29Z" fill={ink} />
            <path d="M15 32L27 29L27 42L15 42Z" fill={ink} />
          </g>
          <path className="logo-crack" d="M10 31.4L33 28.65L33 30.85L10 33.6Z" fill={crack} />
        </g>
        <g transform="translate(1288 0)">
          <path d="M0 -700H569V-580H0Z" fill={ink} />
          <path d="M952.52 -206A266.4 262 0 1 0 899.83 -88.7L792.81 -162.58A130.6 142 0 0 1 565.73 -206ZM806.48 -314A130.6 142 0 0 0 573.32 -314Z" fill={ink} />
          <path d="M1047.3 -740H1187.3V0H1047.3Z" fill={ink} />
          <path d="M1318.3 -740H1458.3V0H1318.3Z" fill={ink} />
          <path d="M214.5 -581L354.5 -581L354.5 -502L214.5 -458Z" fill={ink} />
          <path d="M186.5 -418L326.5 -462L326.5 0L186.5 0Z" fill={ink} />
          <path d="M64.5 -396.36L394.5 -500.07L394.5 -481.07L64.5 -377.36Z" fill={crack} />
        </g>
      </svg>
    </Link>
  );
}
