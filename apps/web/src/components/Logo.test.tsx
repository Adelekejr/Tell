import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { Logo } from './Logo';

afterEach(cleanup);

describe('Logo loading motion', () => {
  it('adds the motion class only while loading', () => {
    const { rerender } = render(
      <MemoryRouter>
        <Logo />
      </MemoryRouter>,
    );
    const logo = screen.getByRole('link', { name: 'Tell, home' });
    expect(logo.classList.contains('is-loading')).toBe(false);
    expect(logo.querySelector('.logo-mark-t')).toBeTruthy();
    expect(logo.querySelector('.logo-crack')).toBeTruthy();

    rerender(
      <MemoryRouter>
        <Logo loading />
      </MemoryRouter>,
    );
    expect(logo.classList.contains('is-loading')).toBe(true);

    rerender(
      <MemoryRouter>
        <Logo />
      </MemoryRouter>,
    );
    expect(logo.classList.contains('is-loading')).toBe(false);
  });
});
