import type { Runner } from '../form';
import { formatXml, xmlError } from '../lib/xml';

export const run: Runner = ({ text, indent }) => {
  const s = String(text);
  if (!s.trim()) return {};
  const err = xmlError(s);
  if (err) return { error: `Not well-formed XML: ${err}` };
  return { out: { result: formatXml(s, indent === 'tab' ? '\t' : ' '.repeat(Number(indent) || 2)) } };
};
