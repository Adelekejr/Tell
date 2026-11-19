import { Link } from 'react-router';
import lockupDark from '../assets/brand/fault-lockup-dark.svg';
import lockupPaper from '../assets/brand/fault-lockup-paper.svg';

/** The Fault lockup. Static: no hover, no motion, no states. */
export function Logo({ tone = 'paper' }: { tone?: 'paper' | 'dark' }) {
  return (
    <Link className="logo" to="/" aria-label="Tell, home">
      <img src={tone === 'dark' ? lockupDark : lockupPaper} alt="" width={65} height={26} />
    </Link>
  );
}
