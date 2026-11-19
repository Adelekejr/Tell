/** Finds http(s) URLs in free text. */
export function findUrls(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\bhttps?:\/\/[^\s"'<>`]+/gi)) {
    out.push(m[0].replace(/[).,;:!?\]]+$/, ''));
  }
  return out;
}

export interface QueryParam {
  name: string;
  value: string;
}

export function queryParams(url: string): QueryParam[] {
  const q = url.split('#')[0]?.split('?')[1];
  if (!q) return [];
  return q.split('&').map((pair) => {
    const i = pair.indexOf('=');
    return i < 0 ? { name: pair, value: '' } : { name: pair.slice(0, i), value: pair.slice(i + 1) };
  });
}
