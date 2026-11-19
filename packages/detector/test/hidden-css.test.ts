import { describe, expect, it } from 'vitest';
import { first, rules, strongRules, ORDER } from './helpers.js';

const page = (body: string, head = ''): string =>
  `<!doctype html><html><head><title>Lemon cake</title>${head}</head><body><h1>Lemon cake</h1><p>Mix the butter and sugar.</p>${body}</body></html>`;

describe('hidden-css (Invisible Ink)', () => {
  const tricks: [string, string][] = [
    ['display:none', `<div style="display:none">${ORDER}</div>`],
    ['visibility:hidden', `<p style="visibility: hidden">${ORDER}</p>`],
    ['zero font size', `<span style="font-size:0px">${ORDER}</span>`],
    ['white on white', `<div style="background:#fff"><span style="color:#ffffff">${ORDER}</span></div>`],
    ['white with no background set', `<span style="color:white">${ORDER}</span>`],
    ['transparent colour', `<span style="color: rgba(0,0,0,0)">${ORDER}</span>`],
    ['opacity 0', `<span style="opacity:0">${ORDER}</span>`],
    ['off-screen', `<div style="position:absolute;left:-9999px">${ORDER}</div>`],
    ['text-indent', `<div style="text-indent:-10000px">${ORDER}</div>`],
    ['hidden attribute', `<div hidden>${ORDER}</div>`],
    ['class from a style sheet', `<div class="note">${ORDER}</div>`],
    ['screen-reader-only class', `<span class="sr-only">${ORDER}</span>`],
  ];
  for (const [name, body] of tricks) {
    it(`catches ${name}`, () => {
      const html = name.includes('style sheet') ? page(body, '<style>.note{display:none}</style>') : page(body);
      expect(strongRules({ html })).toContain('hidden-css');
    });
  }

  it('reports how the text was hidden', () => {
    expect(first({ html: page(`<span style="font-size:0">${ORDER}</span>`) }, 'hidden-css')?.hiddenBy).toBe('zero-size');
  });

  it('inherits hiding from a parent element', () => {
    const html = page(`<div style="display:none"><section><p>${ORDER}</p></section></div>`);
    expect(strongRules({ html })).toContain('hidden-css');
  });

  it('ignores the same order when it is visible', () => {
    expect(rules({ html: page(`<p>${ORDER}</p>`) })).not.toContain('hidden-css');
  });

  it('ignores normal hidden UI: menus, modals and skip links', () => {
    const html = page(
      `<nav style="display:none"><a href="/">Home</a><a href="/shop">Shop</a></nav>
       <div hidden class="modal">Thanks for subscribing! Check your inbox to confirm your email.</div>
       <a class="sr-only" href="#main">Skip to main content</a>
       <span class="visually-hidden">Opens in a new window</span>`,
    );
    expect(rules({ html })).not.toContain('hidden-css');
  });

  it('ignores dark sections with light text', () => {
    const html = page(`<section style="background:#111"><p style="color:#fff">Our story began in a small kitchen in 1998, with one oven and a big idea.</p></section>`);
    expect(rules({ html })).not.toContain('hidden-css');
  });

  it('flags long deceptively hidden text as weak, not strong', () => {
    const html = page(`<div style="font-size:0">best lemon cake recipe easy lemon cake moist lemon cake quick lemon cake</div>`);
    const f = first({ html }, 'hidden-css');
    expect(f?.strong).toBe(false);
    expect(f?.severity).toBe('low');
  });
});
