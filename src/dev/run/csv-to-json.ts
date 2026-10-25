import type { Runner } from '../form';
import { delimiterOf, guessDelimiter, parseCsv } from '../lib/csv';

/** Column names from a header row: blanks become "column N", repeats get _2, _3. */
export function headerNames(row: string[], width: number): string[] {
  const seen = new Map<string, number>();
  return Array.from({ length: width }, (_, i) => {
    const base = row[i]?.trim() || `column ${i + 1}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}_${n}`;
  });
}

export function csvToJson(text: string, delimiter: string, header: boolean): { value: unknown[] } | { error: string } {
  const delim = delimiter === 'auto' ? guessDelimiter(text) : delimiterOf(delimiter);
  const parsed = parseCsv(text, delim);
  if ('unclosedAt' in parsed) return { error: `A quoted field starting on line ${parsed.unclosedAt} is never closed.` };
  const rows = parsed.rows.filter((r) => !(r.length === 1 && r[0] === ''));
  if (!header) return { value: rows };
  const width = Math.max(0, ...rows.map((r) => r.length));
  const names = headerNames(rows[0] ?? [], width);
  return { value: rows.slice(1).map((r) => Object.fromEntries(names.map((k, i) => [k, r[i] ?? '']))) };
}

export const run: Runner = ({ text, delimiter, header }) => {
  const s = String(text);
  if (!s.trim()) return {};
  const r = csvToJson(s, String(delimiter), !!header);
  if ('error' in r) return { error: r.error };
  return { out: { result: JSON.stringify(r.value, null, 2) }, status: `${r.value.length} rows.` };
};
