import qrcode from 'qrcode-generator';

export type Level = 'L' | 'M' | 'Q' | 'H';
export type QrResult =
  | { ok: true; size: number; isDark(r: number, c: number): boolean }
  | { ok: false; max: number };

/** Quiet zone, in modules, required around a QR code by the spec. */
export const QUIET = 4;

// Byte-mode capacity of a version 40 symbol, per error-correction level (ISO/IEC 18004).
const CAPACITY: Record<Level, number> = { L: 2953, M: 2331, Q: 1663, H: 1273 };

export const maxBytes = (level: Level): number => CAPACITY[level];

const encoder = new TextEncoder();
/** The library's default maps UTF-16 code units to single bytes; QR readers expect UTF-8. */
qrcode.stringToBytes = (s: string) => Array.from(encoder.encode(s));

export const byteLength = (text: string): number => encoder.encode(text).length;

/** Why `makeQr` said no. The limit is in UTF-8 bytes, so it says what takes more than one. */
export const tooMuchText = (max: number, level: Level): string =>
  `Too much text for a QR code (${max.toLocaleString('en-US')} bytes max at level ${level}; accented letters and emoji take 2–4 bytes each).`;

export function makeQr(text: string, level: Level): QrResult {
  const max = maxBytes(level);
  if (byteLength(text) > max) return { ok: false, max };
  const qr = qrcode(0, level);
  qr.addData(text, 'Byte');
  qr.make();
  return { ok: true, size: qr.getModuleCount(), isDark: (r, c) => qr.isDark(r, c) };
}

/** SVG of `qr` at `px` CSS pixels, with a 4-module quiet zone. The viewBox is in modules, so it scales cleanly. */
export function toSvg(qr: Extract<QrResult, { ok: true }>, px: number): string {
  const total = qr.size + QUIET * 2;
  let d = '';
  for (let r = 0; r < qr.size; r++) {
    for (let c = 0; c < qr.size; c++) {
      if (!qr.isDark(r, c)) continue;
      let end = c;
      while (end + 1 < qr.size && qr.isDark(r, end + 1)) end++;
      const n = end - c + 1;
      d += `M${c + QUIET} ${r + QUIET}h${n}v1h-${n}z`;
      c = end;
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges">` +
    `<rect width="${total}" height="${total}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`
  );
}
