import { describe, expect, it } from 'vitest';
import { MAX_PAGE_PIXELS, renderScale } from '../../src/pdf/raster';

const pixels = (w: number, h: number, scale: number) => Math.floor(w * scale) * Math.floor(h * scale);

describe('renderScale', () => {
  it('draws a Letter page at 300 dpi in full', () => {
    expect(renderScale(612, 792, 300)).toEqual({ scale: 300 / 72, dpi: 300, capped: false });
  });
  it('draws a Letter page at 150 dpi in full', () => {
    expect(renderScale(612, 792, 150)).toEqual({ scale: 150 / 72, dpi: 150, capped: false });
  });
  it('falls back to 150 dpi when 300 would pass 25 MP, and says so', () => {
    // A2, 1191 x 1684 pt: 300 dpi is ~35 MP, 150 dpi is ~8.7 MP.
    const r = renderScale(1191, 1684, 300);
    expect(r).toEqual({ scale: 150 / 72, dpi: 150, capped: true });
    expect(pixels(1191, 1684, r.scale)).toBeLessThanOrEqual(MAX_PAGE_PIXELS);
  });
  it('shrinks below 150 dpi when even that would pass 25 MP', () => {
    const r = renderScale(5000, 5000, 300);
    expect(r.capped).toBe(true);
    expect(r.scale).toBeLessThan(150 / 72);
    expect(pixels(5000, 5000, r.scale)).toBeLessThanOrEqual(MAX_PAGE_PIXELS);
    expect(pixels(5000, 5000, r.scale)).toBeGreaterThan(MAX_PAGE_PIXELS * 0.98); // as large as the cap allows
  });
  it('caps a 150 dpi request too', () => {
    const r = renderScale(5000, 5000, 150);
    expect(r.capped).toBe(true);
    expect(pixels(5000, 5000, r.scale)).toBeLessThanOrEqual(MAX_PAGE_PIXELS);
  });
  it('never returns a zero-size page', () => {
    const r = renderScale(0.5, 0.5, 150);
    expect(Math.floor(0.5 * r.scale)).toBeGreaterThanOrEqual(0);
    expect(r.scale).toBeGreaterThan(0);
  });
});
