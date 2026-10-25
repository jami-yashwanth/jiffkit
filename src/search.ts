// Tool search: shared by the page script (src/ui/search.ts) and the build (src/search-index.ts). No imports, so the
// script that loads it on first focus stays small.

/** One tool as the search sees it. `blurb` is a line on what it does; `icon` is its Lucide icon's inner SVG. */
export type SearchEntry = { slug: string; name: string; zone: string; label: string; words: string; blurb: string; icon: string };

/** Lower case, accents dropped, anything that isn't a letter or digit turned into a space. */
export const norm = (s: string): string =>
  s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** 2 when the term is a whole word, 1 when it starts a longer word, 0 when it does neither. */
const fit = (words: string[], term: string) => (words.includes(term) ? 2 : words.some((w) => w.startsWith(term)) ? 1 : 0);

/**
 * The tools that match every word of the query, best first: a match on the tool's name beats a match on its zone,
 * which beats a match on its everyday words, and a whole word beats the start of one. Each query word matches the start
 * of a word ("hei" finds HEIC). Ties keep registry order. At most `limit` results.
 */
export function findTools(query: string, index: SearchEntry[], limit = 6): SearchEntry[] {
  const q = norm(query);
  const terms = q.split(' ').filter(Boolean);
  if (!terms.length) return [];
  const scored: { entry: SearchEntry; score: number; at: number }[] = [];
  index.forEach((entry, at) => {
    const name = norm(entry.name);
    const nameWords = name.split(' ');
    const labelWords = norm(entry.label).split(' ');
    const otherWords = norm(entry.words).split(' ');
    let score = name === q ? 100 : name.startsWith(q) ? 50 : 0;
    for (const t of terms) {
      const [n, l, w] = [fit(nameWords, t), fit(labelWords, t), fit(otherWords, t)];
      if (n) score += 8 + n;
      else if (l) score += 4 + l;
      else if (w) score += 1 + w;
      else return;
    }
    scored.push({ entry, score, at });
  });
  return scored.sort((a, b) => b.score - a.score || a.at - b.at).slice(0, limit).map((s) => s.entry);
}

/** Split a tool name into plain and matched parts: each query word marks the start of the name's words it begins. */
export function highlight(name: string, query: string): { text: string; hit: boolean }[] {
  const terms = norm(query).split(' ').filter(Boolean);
  const parts: { text: string; hit: boolean }[] = [];
  let at = 0;
  for (const m of name.matchAll(/[\p{L}\p{N}]+/gu)) {
    const len = Math.max(0, ...terms.filter((t) => norm(m[0]).startsWith(t)).map((t) => t.length));
    if (!len) continue;
    if (m.index > at) parts.push({ text: name.slice(at, m.index), hit: false });
    parts.push({ text: name.slice(m.index, m.index + len), hit: true });
    at = m.index + len;
  }
  if (at < name.length) parts.push({ text: name.slice(at), hit: false });
  return parts;
}

/** Where to start when the box is empty: common jobs, the first three that aren't the page you're on. Not a ranking:
 * there is no usage data. */
export const STARTERS = ['remove-background', 'merge-pdf', 'compress-image', 'json-formatter'];
