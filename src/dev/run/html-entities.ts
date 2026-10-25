import type { Runner } from '../form';

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function encodeEntities(s: string, nonAscii: boolean): string {
  let out = '';
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    out += ESCAPES[ch] ?? (nonAscii && cp > 0x7e ? `&#x${cp.toString(16).toUpperCase()};` : ch);
  }
  return out;
}

/** The character(s) a named entity stands for, from the browser's HTML parser in an inert document (nothing renders or runs). */
function named(entity: string): string | undefined {
  const text = new DOMParser().parseFromString(`<!doctype html><body>${entity}`, 'text/html').body.textContent ?? '';
  return text === entity ? undefined : text;
}

/** Decode named, decimal and hex entities; anything that is not an entity is left exactly as it was. */
export function decodeEntities(s: string, lookup: (entity: string) => string | undefined = named): string {
  return s.replace(/&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|([A-Za-z][A-Za-z0-9]*));?/g, (m, dec, hex, name) => {
    if (name) return lookup(m) ?? m;
    const cp = parseInt(dec ?? hex, dec ? 10 : 16);
    return cp > 0 && cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff) ? String.fromCodePoint(cp) : '�';
  });
}

export const run: Runner = ({ mode, ascii, text }) => {
  const s = String(text);
  if (!s) return {};
  return { out: { result: mode === 'decode' ? decodeEntities(s) : encodeEntities(s, !!ascii) } };
};
