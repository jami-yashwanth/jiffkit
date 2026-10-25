import { minifyJson } from '../../text/json';

export const ROUNDED =
  'Some numbers are too large to keep exactly (over 2^53) and were rounded. Put them in quotes to keep every digit.';

/** Whole-number literals outside the range a JavaScript number holds exactly (strings skipped). */
function hasUnsafeInteger(text: string): boolean {
  for (const m of text.matchAll(/"(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g)) {
    const t = m[0];
    if (t.startsWith('"') || /[.eE]/.test(t)) continue;
    if (!Number.isSafeInteger(Number(t))) return true;
  }
  return false;
}

/** Parse JSON, with the JSON formatter's error wording and position, and a warning if big integers were rounded. */
export function parseJson(text: string): { value: unknown; warning?: string } | { error: string } {
  const checked = minifyJson(text);
  if (!checked.ok) return { error: `Invalid JSON at line ${checked.line}, column ${checked.column}: ${checked.message}.` };
  return { value: JSON.parse(text), ...(hasUnsafeInteger(text) ? { warning: ROUNDED } : {}) };
}
