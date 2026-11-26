import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { Logo } from './Logo';

afterEach(cleanup);

describe('Logo', () => {
  it('renders only the Tell wordmark, with no mark and no motion class', () => {
    render(
      <MemoryRouter>
        <Logo />
      </MemoryRouter>,
    );
    const logo = screen.getByRole('link', { name: 'Tell, home' });
    expect(logo.classList.contains('is-loading')).toBe(false);
    expect(logo.querySelector('svg')).toBeTruthy();
    expect(logo.querySelector('.logo-mark-t')).toBeNull();
    expect(logo.querySelector('.logo-crack')).toBeNull();
  });
});
