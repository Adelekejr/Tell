import { EXAMPLE_PAGES, examplePageUrl } from '@tell/shared';
import { API_BASE } from '../lib/api';

/** A made-up recipe page with two hidden lines, hosted by Tell's API so the link really opens. */
export const EXAMPLE_URL = examplePageUrl(API_BASE || 'https://tell.run', 'lemon-drizzle-cake');

export const EXAMPLE_HTML: string = EXAMPLE_PAGES['lemon-drizzle-cake'];
