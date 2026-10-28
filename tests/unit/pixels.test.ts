import { describe, expect, it } from 'vitest';
import type { Pixels } from '../../src/engine/decode';
import { applyOrientation, downscaleTo, fitWithin, flattenOnWhite } from '../../src/engine/pixels';

/** Pixel (x, y) holds r = x, g = y so every position is identifiable. */
function grid(width: number, height: number, orientation: number): Pixels {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) data.set([x % 256, y % 256, 7, 255], (y * width + x) * 4);
  return { data, width, height, orientation, hasAlpha: false };
}
const at = (p: Pixels, x: number, y: number): [number, number] => {
  const i = (y * p.width + x) * 4;
  return [p.data[i]!, p.data[i + 1]!];
};

describe('applyOrientation', () => {
  it('leaves orientation 1 alone', () => {
    const p = grid(4, 3, 1);
    expect(applyOrientation(p)).toBe(p);
  });

  it('orientation 6 on 400x300 gives 300x400 with the source top-left at the top-right', () => {
    const out = applyOrientation(grid(400, 300, 6));
    expect([out.width, out.height, out.orientation]).toEqual([300, 400, 1]);
    expect(at(out, 299, 0)).toEqual([0, 0]);
    expect(at(out, 0, 0)).toEqual([0, 299 % 256]); // source bottom-left -> top-left
  });

  it('orientation 3 rotates 180 degrees', () => {
    const out = applyOrientation(grid(4, 3, 3));
    expect([out.width, out.height]).toEqual([4, 3]);
    expect(at(out, 3, 2)).toEqual([0, 0]);
    expect(at(out, 0, 0)).toEqual([3, 2]);
  });

  it('orientation 8 puts the source top-left at the bottom-left', () => {
    const out = applyOrientation(grid(4, 3, 8));
    expect([out.width, out.height]).toEqual([3, 4]);
    expect(at(out, 0, 3)).toEqual([0, 0]);
    expect(at(out, 2, 0)).toEqual([3, 2]); // source bottom-right -> top-right
  });

  it.each([
    [2, [3, 0], [0, 0]],
    [4, [0, 2], [3, 2]],
    [5, [0, 0], [0, 3]],
    [7, [2, 3], [2, 0]],
  ] as const)('orientation %i puts source (0,0) at %j and source (3,0) at %j', (o, [x, y], [x2, y2]) => {
    const out = applyOrientation(grid(4, 3, o));
    expect(at(out, x, y)).toEqual([0, 0]);
    expect(at(out, x2, y2)).toEqual([3, 0]);
  });
});

describe('flattenOnWhite', () => {
  it('turns a fully transparent pixel white and blends half-transparent ones', () => {
    const p: Pixels = {
      data: new Uint8ClampedArray([10, 20, 30, 0, 0, 0, 0, 128, 9, 9, 9, 255, 0, 0, 0, 255]),
      width: 4,
      height: 1,
      orientation: 1,
      hasAlpha: true,
    };
    const out = flattenOnWhite(p);
    expect(out.hasAlpha).toBe(false);
    expect([...out.data.subarray(0, 4)]).toEqual([255, 255, 255, 255]);
    expect(out.data[4]).toBe(127);
    expect(out.data[7]).toBe(255);
    expect([...out.data.subarray(8, 12)]).toEqual([9, 9, 9, 255]);
  });
});

describe('downscaleTo', () => {
  it('shrinks 8064x6048 to at most 24 MP keeping the aspect ratio', () => {
    const w = 8064;
    const h = 6048;
    const src: Pixels = { data: new Uint8ClampedArray(w * h * 4).fill(200), width: w, height: h, orientation: 1, hasAlpha: false };
    const out = downscaleTo(src, 24);
    expect(out.width * out.height).toBeLessThanOrEqual(24_000_000);
    expect(Math.abs(out.width / out.height / (w / h) - 1)).toBeLessThan(0.005);
    expect(out.data.length).toBe(out.width * out.height * 4);
    expect(out.data[0]).toBe(200);
  }, 30_000);

  it('returns the input untouched when it is already small enough', () => {
    const p = grid(10, 10, 1);
    expect(downscaleTo(p, 24)).toBe(p);
  });

  it('averages the covered pixels (box filter) and keeps alpha-weighted colour', () => {
    const p: Pixels = {
      data: new Uint8ClampedArray([0, 0, 0, 255, 100, 100, 100, 255, 100, 100, 100, 255, 200, 200, 200, 255]),
      width: 2,
      height: 2,
      orientation: 1,
      hasAlpha: false,
    };
    const out = downscaleTo(p, 1 / 1e6); // 1 pixel
    expect([out.width, out.height]).toEqual([1, 1]);
    expect([...out.data]).toEqual([100, 100, 100, 255]);
  });

  it('does not bleed colour from a transparent pixel', () => {
    const p: Pixels = {
      data: new Uint8ClampedArray([255, 0, 0, 0, 0, 0, 255, 255, 255, 0, 0, 0, 0, 0, 255, 255]),
      width: 2,
      height: 2,
      orientation: 1,
      hasAlpha: true,
    };
    const out = downscaleTo(p, 1 / 1e6);
    expect([...out.data]).toEqual([0, 0, 255, 128]);
  });
});

describe('fitWithin', () => {
  it('fits a width: 4032x3024 inside 1200 wide is 1200x900', () => {
    expect(fitWithin(4032, 3024, { width: 1200 })).toEqual([1200, 900]);
  });
  it('fits a height: 4032x3024 inside 600 high is 800x600', () => {
    expect(fitWithin(4032, 3024, { height: 600 })).toEqual([800, 600]);
  });
  it('fits a box by its tighter side, keeping the proportions', () => {
    expect(fitWithin(3000, 1000, { width: 1500, height: 1500 })).toEqual([1500, 500]);
    expect(fitWithin(1000, 3000, { width: 1500, height: 1500 })).toEqual([500, 1500]);
  });
  it('never enlarges: an image already inside the box keeps its size, as does an empty box', () => {
    expect(fitWithin(800, 600, { width: 1200 })).toEqual([800, 600]);
    expect(fitWithin(800, 600, { width: 800, height: 600 })).toEqual([800, 600]);
    expect(fitWithin(800, 600, {})).toEqual([800, 600]);
  });
  it('keeps each side at least 1 px', () => {
    expect(fitWithin(10_000, 10, { width: 100 })).toEqual([100, 1]);
  });
});
