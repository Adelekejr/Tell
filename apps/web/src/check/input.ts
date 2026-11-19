/** Is the pasted thing a link? Returns a full https link, or null for text. */
export function asLink(raw: string): string | null {
  const t = raw.trim();
  if (!t || /\s/.test(t) || t.length > 2048) return null;
  if (/^https?:\/\//i.test(t)) return t;
  if (/^(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?::\d+)?(?:[/?#]\S*)?$/i.test(t)) return `https://${t}`;
  return null;
}

export const MAX_TEXT = 200_000;

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
