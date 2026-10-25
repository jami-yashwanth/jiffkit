import { stringify } from 'yaml';
import type { Runner } from '../form';
import { parseJson } from '../lib/json-input';

export const run: Runner = ({ text }) => {
  const s = String(text);
  if (!s.trim()) return {};
  const parsed = parseJson(s);
  if ('error' in parsed) return { error: parsed.error };
  return { out: { result: stringify(parsed.value, { lineWidth: 0 }) } };
};
