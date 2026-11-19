import { useEffect } from 'react';

const SITE = 'Tell';

/** Sets the document title: "Lab · Tell", or the full tagline on Home. */
export function usePageTitle(title: string | null): void {
  useEffect(() => {
    document.title = title ? `${title} \u00B7 ${SITE}` : `${SITE} \u00B7 Every AI has a tell`;
  }, [title]);
}
