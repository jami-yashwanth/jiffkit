import type { Pixels } from './decode';
import { downscaleTo, resizeBox } from './pixels';

// Compress to a target size: the highest JPEG quality whose file fits under a byte budget, and if quality 40 is
// still too big, a smaller image. Never pads a file to reach a minimum. The encoder is passed in, so the search is
// testable without a codec.

export interface TargetBytes {
  maxBytes: number;
  minBytes?: number;
}
export type Encode = (p: Pixels, quality: number) => Promise<Uint8Array>;
export interface Fit {
  bytes: Uint8Array;
  pixels: Pixels;
  quality: number;
  /** The image was made smaller to fit. */
  shrunk: boolean;
  /** Even the best result is under the minimum. */
  underMinimum: boolean;
}

/** Below 40, faces and text break into blocks: a smaller clean image reads better than a full-size blocky one. */
export const Q_MIN = 40;
export const Q_MAX = 92;
/** A long edge below this is not readable on a form. */
export const MIN_EDGE = 64;
export const MAX_ROUNDS = 6;
/** Tries at growing back after the starting size, each one encode at quality 92. */
export const GROW_ROUNDS = 4;

/**
 * Portals differ on whether a KB is 1,000 or 1,024 bytes, so count whichever way is safer: a maximum of N KB is
 * N × 1,000 bytes, a minimum N × 1,024. A file meeting both passes either definition.
 */
export function bytesFor(t: { maxKB: number; minKB?: number }): TargetBytes {
  return t.minKB === undefined ? { maxBytes: t.maxKB * 1000 } : { maxBytes: t.maxKB * 1000, minBytes: t.minKB * 1024 };
}

/** The highest quality in [Q_MIN, Q_MAX] that fits, or null when even Q_MIN is too big. Tries Q_MAX, Q_MIN, then bisects. */
async function bestQuality(p: Pixels, maxBytes: number, encode: Encode): Promise<{ bytes: Uint8Array; quality: number } | { over: number }> {
  const top = await encode(p, Q_MAX);
  if (top.length <= maxBytes) return { bytes: top, quality: Q_MAX };
  const floor = await encode(p, Q_MIN);
  if (floor.length > maxBytes) return { over: floor.length };
  let best = { bytes: floor, quality: Q_MIN };
  let lo = Q_MIN + 1;
  let hi = Q_MAX - 1;
  while (lo <= hi) {
    const q = (lo + hi) >> 1;
    const bytes = await encode(p, q);
    if (bytes.length <= maxBytes) {
      best = { bytes, quality: q };
      lo = q + 1;
    } else hi = q - 1;
  }
  return best;
}

/**
 * `keepSize`: start from the image's own size, not the estimate. For a file that already fits, which should come back
 * at its own size whenever a quality of at least 40 allows it.
 */
export async function fitToSize(p: Pixels, t: TargetBytes, encode: Encode, opts: { keepSize?: boolean } = {}): Promise<Fit | 'cannot-fit'> {
  // One bit per pixel is a generous estimate for a quality-40 JPEG: start no larger, so a 12 MP photo is not
  // encoded at full size again and again.
  let pixels = opts.keepSize ? p : downscaleTo(p, (t.maxBytes * 8) / 1e6);
  let shrunk = pixels !== p;
  for (let round = 0; round <= MAX_ROUNDS; round++) {
    let found = await bestQuality(pixels, t.maxBytes, encode);
    // The starting size is a guess, and smooth photos compress far better than it assumes: while quality 92 fits
    // with room to spare, grow back toward the original, at quality 92 only, so detail is never traded for pixels.
    if (round === 0 && 'bytes' in found && found.quality === Q_MAX) {
      for (let grow = 0; grow < GROW_ROUNDS && pixels.width < p.width; grow++) {
        const factor = Math.min(p.width / pixels.width, Math.sqrt(t.maxBytes / found.bytes.length) * 0.97);
        const w = Math.min(p.width, Math.round(pixels.width * factor));
        if (w <= pixels.width) break;
        const next = w === p.width ? p : resizeBox(p, w, Math.max(1, Math.round((p.height * w) / p.width)));
        const bytes = await encode(next, Q_MAX);
        if (bytes.length > t.maxBytes) break;
        pixels = next;
        found = { bytes, quality: Q_MAX };
      }
      shrunk = pixels !== p;
    }
    if ('bytes' in found) {
      let { bytes, quality } = found;
      let underMinimum = false;
      if (t.minBytes !== undefined && bytes.length < t.minBytes) {
        if (!shrunk) {
          const most = await encode(pixels, 100);
          if (most.length <= t.maxBytes && most.length > bytes.length) {
            bytes = most;
            quality = 100;
          }
        }
        underMinimum = bytes.length < t.minBytes;
      }
      return { bytes, pixels, quality, shrunk, underMinimum };
    }
    if (round === MAX_ROUNDS) break;
    const scale = Math.sqrt(t.maxBytes / found.over) * 0.95;
    const w = Math.floor(pixels.width * scale);
    const h = Math.floor(pixels.height * scale);
    if (Math.max(w, h) < MIN_EDGE || Math.min(w, h) < 1) break;
    pixels = resizeBox(pixels, w, h);
    shrunk = true;
  }
  return 'cannot-fit';
}
