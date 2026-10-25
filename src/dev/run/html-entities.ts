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

// Numeric references 128-159 mean windows-1252 characters in HTML, not C1 controls (as browsers decode them).
const WIN1252: Record<number, number> = {
  128: 0x20ac, 130: 0x201a, 131: 0x192, 132: 0x201e, 133: 0x2026, 134: 0x2020, 135: 0x2021, 136: 0x2c6, 137: 0x2030, 138: 0x160,
  139: 0x2039, 140: 0x152, 142: 0x17d, 145: 0x2018, 146: 0x2019, 147: 0x201c, 148: 0x201d, 149: 0x2022, 150: 0x2013, 151: 0x2014,
  152: 0x2dc, 153: 0x2122, 154: 0x161, 155: 0x203a, 156: 0x153, 158: 0x17e, 159: 0x178,
};

/** The character(s) a named entity stands for, from the browser's HTML parser in an inert document (nothing renders or runs). Cached. */
const seen = new Map<string, string | undefined>();
function named(entity: string): string | undefined {
  if (!seen.has(entity)) {
    const text = new DOMParser().parseFromString(`<!doctype html><body>${entity}`, 'text/html').body.textContent ?? '';
    seen.set(entity, text === entity ? undefined : text);
  }
  return seen.get(entity);
}

/** Decode named, decimal and hex entities; anything that is not an entity is left exactly as it was. */
export function decodeEntities(s: string, lookup: (entity: string) => string | undefined = named): string {
  return s.replace(/&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|([A-Za-z][A-Za-z0-9]*));?/g, (m, dec, hex, name) => {
    if (name) return lookup(m) ?? m;
    const n = parseInt(dec ?? hex, dec ? 10 : 16);
    const cp = WIN1252[n] ?? n;
    return cp > 0 && cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff) ? String.fromCodePoint(cp) : '�';
  });
}

export const run: Runner = ({ mode, ascii, text }) => {
  const s = String(text);
  if (!s) return {};
  return { out: { result: mode === 'decode' ? decodeEntities(s) : encodeEntities(s, !!ascii) } };
};
