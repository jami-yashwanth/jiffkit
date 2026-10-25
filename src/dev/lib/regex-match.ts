// Runs a regex over text: segments for highlighting and rows for the match table. Pure, so it can run in the regex
// worker (src/dev/lib/regex-worker.ts) where a runaway pattern can be stopped.

export const MAX_MATCHES = 1000;
const MAX_ROWS = 100;

export type MatchResult =
  | { error: string }
  | { count: number; capped: boolean; segments: { text: string; match?: boolean }[]; rows: [string, string][] };

export function runRegex(pattern: string, flags: string, text: string): MatchResult {
  let re: RegExp;
  try {
    re = new RegExp(pattern, flags);
  } catch (e) {
    return { error: `Invalid pattern: ${(e as Error).message.replace(/^Invalid regular expression: /, '')}` };
  }
  const all = re.global || re.sticky;
  const unicode = re.unicode || re.unicodeSets;
  const matches: RegExpExecArray[] = [];
  re.lastIndex = 0;
  for (let m = re.exec(text); m; m = all ? re.exec(text) : null) {
    matches.push(m);
    if (matches.length >= MAX_MATCHES) break;
    if (m[0] === '') re.lastIndex += unicode && (text.codePointAt(m.index) ?? 0) > 0xffff ? 2 : 1; // never loop on an empty match
  }

  const segments: { text: string; match?: boolean }[] = [];
  let at = 0;
  for (const m of matches) {
    if (m.index > at) segments.push({ text: text.slice(at, m.index) });
    if (m[0]) segments.push({ text: m[0], match: true });
    at = Math.max(at, m.index + m[0].length);
  }
  if (at < text.length) segments.push({ text: text.slice(at) });

  const rows: [string, string][] = [];
  for (const [i, m] of matches.slice(0, MAX_ROWS).entries()) {
    rows.push([`Match ${i + 1}, at ${m.index}`, m[0] === '' ? '(empty)' : m[0]]);
    for (let g = 1; g < m.length; g++) rows.push([`  Group ${g}`, m[g] ?? '(no match)']);
    for (const [name, v] of Object.entries(m.groups ?? {})) rows.push([`  Group “${name}”`, v ?? '(no match)']);
  }
  return { count: matches.length, capped: matches.length >= MAX_MATCHES, segments, rows };
}
