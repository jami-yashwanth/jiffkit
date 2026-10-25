import type { Result, Runner } from '../form';

export type Rgba = { r: number; g: number; b: number; a: number };

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const num = (s: string, scale: number) => (s.endsWith('%') ? (parseFloat(s) / 100) * scale : parseFloat(s));
const alpha = (s: string | undefined) => (s === undefined ? 1 : clamp(num(s, 1), 0, 1));
const hue = (s: string) => {
  const m = /^(-?[\d.]+)(deg|turn|rad|grad)?$/.exec(s);
  if (!m) return NaN;
  const v = parseFloat(m[1]);
  return { deg: v, turn: v * 360, rad: (v * 180) / Math.PI, grad: v * 0.9 }[m[2] ?? 'deg']!;
};

/** Parse #rgb, #rgba, #rrggbb, #rrggbbaa, rgb()/rgba() and hsl()/hsla(), in comma or space syntax. */
export function parseColor(input: string): Rgba | undefined {
  const s = input.trim().toLowerCase();
  const hex = /^#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(s);
  if (hex) {
    let h = hex[1];
    if (h.length <= 4) h = [...h].map((c) => c + c).join('');
    const v = (i: number) => parseInt(h.slice(i, i + 2), 16);
    return { r: v(0), g: v(2), b: v(4), a: h.length === 8 ? Math.round((v(6) / 255) * 1000) / 1000 : 1 };
  }
  const fn = /^(rgba?|hsla?)\((.*)\)$/.exec(s);
  if (!fn) return undefined;
  const parts = fn[2].replace(/\s*\/\s*/, ' / ').split(/[\s,]+/).filter((p) => p && p !== '/');
  if (parts.length < 3 || parts.length > 4) return undefined;
  if (fn[1].startsWith('rgb')) {
    const [r, g, b] = parts.slice(0, 3).map((p) => clamp(Math.round(num(p, 255)), 0, 255));
    const a = alpha(parts[3]);
    return [r, g, b, a].some(Number.isNaN) ? undefined : { r, g, b, a };
  }
  const h = hue(parts[0]);
  const sat = clamp(parseFloat(parts[1]), 0, 100) / 100;
  const l = clamp(parseFloat(parts[2]), 0, 100) / 100;
  if ([h, sat, l].some(Number.isNaN)) return undefined;
  return { ...hslToRgb(h, sat, l), a: alpha(parts[3]) };
}

function hslToRgb(h: number, s: number, l: number) {
  const k = (n: number) => (n + h / 30) % 12;
  const f = (n: number) => l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return { r: Math.round(f(0) * 255), g: Math.round(f(8) * 255), b: Math.round(f(4) * 255) };
}

export function rgbToHsl({ r, g, b }: Rgba): [number, number, number] {
  const [R, G, B] = [r, g, b].map((v) => v / 255);
  const max = Math.max(R, G, B), min = Math.min(R, G, B), d = max - min;
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d) h = max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return [Math.round((h * 60 + 360) % 360), Math.round(s * 100), Math.round(l * 100)];
}

const hex2 = (n: number) => n.toString(16).padStart(2, '0');
export const toHex = (c: Rgba, withAlpha = c.a < 1) => `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}${withAlpha ? hex2(Math.round(c.a * 255)) : ''}`;

export function formats(c: Rgba): [string, string][] {
  const a = c.a < 1 ? ` / ${+c.a.toFixed(3)}` : '';
  const [h, s, l] = rgbToHsl(c);
  return [
    ['HEX', toHex(c)],
    ['RGB', `rgb(${c.r} ${c.g} ${c.b}${a})`],
    ['HSL', `hsl(${h} ${s}% ${l}%${a})`],
    ['RGB (legacy)', c.a < 1 ? `rgba(${c.r}, ${c.g}, ${c.b}, ${+c.a.toFixed(3)})` : `rgb(${c.r}, ${c.g}, ${c.b})`],
  ];
}

export const run: Runner = ({ color, picker }, changed): Result => {
  if (changed === 'picker') {
    const c = parseColor(String(picker))!;
    return { set: { color: toHex(c) }, out: { formats: { rows: formats(c) } } };
  }
  const s = String(color).trim();
  if (!s) return {};
  const c = parseColor(s);
  if (!c) return { error: 'Can’t read that color. Try #0e6b52, rgb(14 107 82) or hsl(164 77% 24%).' };
  return { set: { picker: toHex(c, false) }, out: { formats: { rows: formats(c) } } };
};
