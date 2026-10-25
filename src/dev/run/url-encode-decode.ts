import type { Runner } from '../form';

/** The 1-based position of the first % that does not start a valid escape run, or -1. */
export function badEscapeAt(s: string): number {
  const stray = s.search(/%(?![0-9a-fA-F]{2})/);
  if (stray >= 0) return stray + 1;
  for (const m of s.matchAll(/(?:%[0-9a-fA-F]{2})+/g)) {
    try {
      decodeURIComponent(m[0]);
    } catch {
      return m.index! + 1;
    }
  }
  return -1;
}

export const run: Runner = ({ mode, scope, text }) => {
  const s = String(text);
  if (!s) return {};
  const uri = scope === 'uri';
  try {
    if (mode === 'encode') return { out: { result: uri ? encodeURI(s) : encodeURIComponent(s) } };
    return { out: { result: uri ? decodeURI(s) : decodeURIComponent(s) } };
  } catch {
    if (mode === 'encode') return { error: 'Can’t encode: the text has a broken character (a lone surrogate).' };
    const at = badEscapeAt(s);
    return { error: at > 0 ? `Can’t decode: the % at character ${at} doesn’t start a valid escape.` : 'Can’t decode: the text has an invalid % escape.' };
  }
};
