import { Link } from 'react-router';
import { Logo } from './Logo';

export function Footer({ tone = 'paper', loading = false }: { tone?: 'paper' | 'dark'; loading?: boolean }) {
  return (
    <footer className="footer">
      <div className="footer-top">
        <Logo tone={tone} loading={loading} />
        <span className="label">Built on Firebase AI Logic</span>
      </div>
      <div className="footer-bottom">
        <p className="small muted footer-note">No login. No payment. Traps are harmless test pages.</p>
        <nav className="footer-links" aria-label="More">
          <Link to="/docs">Docs</Link>
          <Link to="/device">Device check</Link>
          <Link to="/how">Privacy</Link>
          <a href="https://github.com/Adelekejr/Tell" target="_blank" rel="noreferrer">
            Source code
          </a>
        </nav>
      </div>
    </footer>
  );
}
