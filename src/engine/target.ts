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

export async function fitToSize(p: Pixels, t: TargetBytes, encode: Encode): Promise<Fit | 'cannot-fit'> {
  // One bit per pixel is a generous estimate for a quality-40 JPEG: start no larger, so a 12 MP photo is not
  // encoded at full size again and again.
  let pixels = downscaleTo(p, (t.maxBytes * 8) / 1e6);
  let shrunk = pixels !== p;
  for (let round = 0; round <= MAX_ROUNDS; round++) {
    const found = await bestQuality(pixels, t.maxBytes, encode);
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
