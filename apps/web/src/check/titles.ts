import type { Finding } from '@tell/detector';

/** A short, plain title for each kind of finding, for people who don't read code. */
export function findingTitle(f: Finding): string {
  switch (f.rule) {
    case 'hidden-css':
      switch (f.hiddenBy) {
        case 'same-colour':
          return 'Text the same colour as the page';
        case 'off-screen':
          return 'Text pushed off the screen';
        case 'zero-size':
          return 'Text shrunk to nothing';
        case 'transparent':
          return 'See-through text';
        case 'clipped':
          return 'Text clipped out of view';
        case 'screen-reader-only':
          return 'Text only screen readers get';
        case 'not-rendered':
          return 'Text the page never draws';
        case 'collapsed':
          return 'Text tucked inside a closed box';
        default:
          return 'Text switched off for people';
      }
    case 'html-comment':
      return 'A note inside the page code';
    case 'unicode-tags':
      return 'Invisible letters';
    case 'variation-selectors':
      return 'Data hidden in invisible characters';
    case 'zero-width':
      return 'Invisible characters';
    case 'split-words':
      return 'Words split by invisible characters';
    case 'bidi-controls':
      return 'Text that reads backwards';
    case 'base64-payload':
      return 'A message in code';
    case 'url-fragment':
      return 'Instructions tucked into a link';
    case 'image-exfiltration':
      return 'An image that could leak your chat';
    case 'fake-role':
      return 'Text pretending to be a system message';
    case 'ai-order':
      return 'Orders aimed at AI assistants';
    case 'attribute-text':
      return 'Orders hidden in the page code';
  }
}

/** The text a finding uncovered, as shown to people. */
export function findingQuote(f: Finding): string {
  return (f.revealed ?? f.evidence).trim();
}
