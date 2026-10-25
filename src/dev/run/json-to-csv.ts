import type { Runner } from '../form';
import { delimiterOf, toCsv } from '../lib/csv';
import { parseJson } from '../lib/json-input';

const cell = (v: unknown): string => (v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Rows for CSV: objects become a header of every key (first-seen order) plus one row each; arrays are rows as they are. */
export function jsonToRows(value: unknown): string[][] | string {
  const items = Array.isArray(value) ? value : [value];
  if (!items.length) return 'The array is empty: there is nothing to convert.';
  if (items.every(Array.isArray)) return items.map((r) => r.map(cell));
  if (items.every(isObject)) {
    const keys = [...new Set(items.flatMap((o) => Object.keys(o)))];
    return [keys, ...items.map((o) => keys.map((k) => cell(o[k])))];
  }
  if (items.every((v) => !isObject(v) && !Array.isArray(v))) return [['value'], ...items.map((v) => [cell(v)])];
  return 'Mix of objects and other values: use an array of objects, or an array of arrays.';
}

export const run: Runner = ({ text, delimiter }) => {
  const s = String(text);
  if (!s.trim()) return {};
  const parsed = parseJson(s);
  if ('error' in parsed) return { error: parsed.error };
  const rows = jsonToRows(parsed.value);
  if (typeof rows === 'string') return { error: rows };
  const items = Array.isArray(parsed.value) ? parsed.value.length : 1;
  return { out: { result: toCsv(rows, delimiterOf(String(delimiter))) }, status: `${items} ${items === 1 ? 'row' : 'rows'}.${parsed.warning ? ` ${parsed.warning}` : ''}` };
};
