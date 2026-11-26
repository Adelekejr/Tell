import { Link } from 'react-router';

/** The Tell wordmark. The letter paths are unchanged; the separate mark is not rendered. */
export function Logo({ tone = 'paper' }: { tone?: 'paper' | 'dark' }) {
  const ink = tone === 'dark' ? '#F6F5F1' : '#0B0B0C';
  const crack = tone === 'dark' ? '#6F7DFF' : '#3B4BFF';
  return (
    <Link className="logo" to="/" aria-label="Tell, home">
      <svg aria-hidden="true" width="36" height="26" viewBox="1288 -937 1538.3 1154" fillRule="evenodd">
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
