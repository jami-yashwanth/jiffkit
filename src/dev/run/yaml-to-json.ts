import { parseAllDocuments } from 'yaml';
import type { Runner } from '../form';

export function yamlToJson(text: string, indent: number | '\t'): { json: string } | { error: string } {
  const docs = parseAllDocuments(text);
  const list = Array.isArray(docs) ? docs : [docs];
  for (const d of list) {
    const e = d.errors[0];
    if (e) return { error: `Invalid YAML${e.linePos ? ` at line ${e.linePos[0].line}, column ${e.linePos[0].col}` : ''}: ${e.message.split('\n')[0]}` };
  }
  const values = list.map((d) => d.toJS());
  return { json: JSON.stringify(values.length === 1 ? values[0] : values, null, indent) ?? 'null' };
}

export const run: Runner = ({ text, indent }) => {
  const s = String(text);
  if (!s.trim()) return {};
  const r = yamlToJson(s, indent === 'tab' ? '\t' : Number(indent) || 2);
  return 'error' in r ? { error: r.error } : { out: { result: r.json } };
};
