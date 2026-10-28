import { describe, expect, it } from 'vitest';
import jsQR from 'jsqr';
import { makeQr, maxBytes, toSvg, tooMuchText, type Level } from '../../src/qr/qr';

/** Render the matrix to RGBA (4-module quiet zone) so a real decoder can read it back. */
function decode(text: string, level: Level) {
  const qr = makeQr(text, level);
  if (!qr.ok) throw new Error('expected ok');
  const mod = 6;
  const side = (qr.size + 8) * mod;
  const rgba = new Uint8ClampedArray(side * side * 4).fill(255);
  for (let r = 0; r < qr.size; r++)
    for (let c = 0; c < qr.size; c++) {
      if (!qr.isDark(r, c)) continue;
      for (let y = 0; y < mod; y++)
        for (let x = 0; x < mod; x++) {
          const i = (((r + 4) * mod + y) * side + (c + 4) * mod + x) * 4;
          rgba[i] = rgba[i + 1] = rgba[i + 2] = 0;
        }
    }
  return jsQR(rgba, side, side)?.data;
}

describe('makeQr', () => {
  it('round-trips a URL', () => {
    expect(decode('https://example.com', 'M')).toBe('https://example.com');
  });

  it('round-trips non-ASCII text as UTF-8', () => {
    const text = 'naïve 👋 こんにちは';
    expect(decode(text, 'M')).toBe(text);
  });

  it.each(['L', 'M', 'Q', 'H'] as Level[])('decodes at level %s', (level) => {
    expect(decode('hello', level)).toBe('hello');
  });

  it('reports byte capacities at version 40', () => {
    expect(maxBytes('L')).toBe(2953);
    expect(maxBytes('M')).toBe(2331);
    expect(maxBytes('Q')).toBe(1663);
    expect(maxBytes('H')).toBe(1273);
  });

  it('accepts exactly the capacity and rejects one byte more', () => {
    expect(makeQr('a'.repeat(2953), 'L').ok).toBe(true);
    expect(makeQr('a'.repeat(2954), 'L')).toEqual({ ok: false, max: 2953 });
  });

  it('counts UTF-8 bytes, not characters', () => {
    // 1000 emoji = 4000 bytes
    expect(makeQr('👋'.repeat(1000), 'L')).toEqual({ ok: false, max: 2953 });
  });
});

describe('toSvg', () => {
  const qr = makeQr('hi', 'M');
  if (!qr.ok) throw new Error('expected ok');
  const svg = toSvg(qr, 256);

  it('is a crisp, scalable SVG with a white background', () => {
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('shape-rendering="crispEdges"');
    expect(svg).toContain('width="256"');
    expect(svg).toContain(`viewBox="0 0 ${qr.size + 8} ${qr.size + 8}"`);
    expect(svg).toContain('fill="#fff"');
  });

  it('offsets the first dark module by the 4-module quiet zone', () => {
    // The top-left finder pattern starts dark at module (0,0) -> drawn at (4,4).
    expect(svg).toMatch(/M4 4h\d+v1h-\d+z/);
  });
});

describe('too much text', () => {
  it('states the limit in bytes, as makeQr counts it', () => {
    const r = makeQr('é'.repeat(maxBytes('L') / 2 + 1), 'L'); // 2 bytes each: fewer characters than the limit
    expect(r.ok).toBe(false);
    const message = tooMuchText((r as { max: number }).max, 'L');
    expect(message).toContain('2,953 bytes max at level L');
    expect(message).not.toContain('characters max');
  });
});
