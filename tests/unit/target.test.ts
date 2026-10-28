import { describe, expect, it } from 'vitest';
import type { Pixels } from '../../src/engine/decode';
import { bytesFor, fitToSize, MAX_ROUNDS, MIN_EDGE, Q_MAX, Q_MIN, type Encode } from '../../src/engine/target';

const image = (width: number, height: number): Pixels => ({
  data: new Uint8ClampedArray(width * height * 4).fill(200),
  width,
  height,
  orientation: 1,
  hasAlpha: false,
});

/** An encoder whose output is `width × height × quality / 100 × k` bytes, recording every call. */
function stub(k: number, size?: (w: number, h: number, q: number) => number) {
  const calls: { w: number; h: number; q: number }[] = [];
  const encode: Encode = async (p, q) => {
    calls.push({ w: p.width, h: p.height, q });
    return new Uint8Array(size ? size(p.width, p.height, q) : Math.round(((p.width * p.height * q) / 100) * k));
  };
  return { encode, calls };
}

describe('bytesFor', () => {
  it('max is KB × 1000, min is KB × 1024', () => {
    expect(bytesFor({ maxKB: 20, minKB: 10 })).toEqual({ maxBytes: 20000, minBytes: 10240 });
    expect(bytesFor({ maxKB: 50 })).toEqual({ maxBytes: 50000 });
  });
});

describe('fitToSize', () => {
  it('finds the highest quality that fits', async () => {
    // 400 × 300 at k = 1: quality 70 is 84,000 bytes, quality 71 is 85,200.
    const { encode } = stub(1);
    const fit = await fitToSize(image(400, 300), { maxBytes: 84_500 }, encode);
    expect(fit).not.toBe('cannot-fit');
    if (fit === 'cannot-fit') return;
    expect(fit.quality).toBe(70);
    expect(fit.shrunk).toBe(false);
    expect(fit.bytes.length).toBeLessThanOrEqual(84_500);
    expect([fit.pixels.width, fit.pixels.height]).toEqual([400, 300]);
  });

  it('keeps the first try when quality 92 already fits', async () => {
    const { encode, calls } = stub(1);
    const fit = await fitToSize(image(400, 300), { maxBytes: 200_000 }, encode);
    expect(fit !== 'cannot-fit' && fit.quality).toBe(Q_MAX);
    expect(calls).toHaveLength(1);
  });

  it('never encodes above 92 or below 40 while searching', async () => {
    const { encode, calls } = stub(1);
    await fitToSize(image(400, 300), { maxBytes: 60_000 }, encode);
    for (const c of calls) {
      expect(c.q).toBeGreaterThanOrEqual(Q_MIN);
      expect(c.q).toBeLessThanOrEqual(Q_MAX);
    }
  });

  it('shrinks once quality 40 is too big, keeping the aspect ratio', async () => {
    // Quality 40 at 400 × 300 is 48,000 bytes: over a 20,000-byte budget.
    const { encode } = stub(1);
    const fit = await fitToSize(image(400, 300), { maxBytes: 20_000 }, encode);
    expect(fit).not.toBe('cannot-fit');
    if (fit === 'cannot-fit') return;
    expect(fit.shrunk).toBe(true);
    expect(fit.pixels.width).toBeLessThan(400);
    expect(Math.abs(fit.pixels.height - (fit.pixels.width * 3) / 4)).toBeLessThanOrEqual(1);
    expect(fit.bytes.length).toBeLessThanOrEqual(20_000);
    expect(fit.quality).toBeGreaterThanOrEqual(Q_MIN);
  });

  it('stops after 6 rounds or at 64 px', async () => {
    const { encode, calls } = stub(1, () => 1e9); // never fits
    expect(await fitToSize(image(400, 300), { maxBytes: 1000 }, encode)).toBe('cannot-fit');
    expect(calls.length).toBeLessThanOrEqual(MAX_ROUNDS * 7 + 7);
    for (const c of calls) expect(Math.max(c.w, c.h)).toBeGreaterThanOrEqual(MIN_EDGE);
  });

  it('starts from at most maxBytes × 8 pixels', async () => {
    const { encode, calls } = stub(0.1);
    await fitToSize(image(2000, 1500), { maxBytes: 50_000 }, encode);
    expect(calls[0]!.w * calls[0]!.h).toBeLessThanOrEqual(400_000);
  });

  it('retries quality 100 for a minimum, and never pads', async () => {
    // k = 0.05: quality 92 is 5,520 bytes and quality 100 is 6,000, both under a 10,240-byte minimum.
    const { encode, calls } = stub(0.05);
    const fit = await fitToSize(image(400, 300), { maxBytes: 20_000, minBytes: 10_240 }, encode);
    expect(calls.map((c) => c.q)).toContain(100);
    expect(fit).not.toBe('cannot-fit');
    if (fit === 'cannot-fit') return;
    expect(fit.underMinimum).toBe(true);
    expect(fit.bytes.length).toBe(6000); // exactly the encoder's output
  });

  it('a result over the minimum is not flagged', async () => {
    const { encode } = stub(1);
    const fit = await fitToSize(image(400, 300), { maxBytes: 20_000, minBytes: 10_240 }, encode);
    expect(fit !== 'cannot-fit' && fit.underMinimum).toBe(false);
  });
});
