import type { InType } from '../tools';
import { CodecLoadError, load, type HeifImageHandle, type RawImage } from './codecs';
import { heicOrientation, jpegOrientation } from './orientation';

export { CodecLoadError };

/** Thrown when a file is recognised but its bytes cannot be decoded (corrupt, truncated, unsupported). */
export class DecodeError extends Error {
  override name = 'DecodeError';
}

/**
 * Raw RGBA8 pixels exactly as stored in the file, plus the EXIF orientation (1-8) still to be applied.
 * Nothing here rotates; Task 4's `applyOrientation` does. The one exception is HEIC container transforms
 * (irot/imir): libheif applies those itself, and `orientation` is then 1.
 */
export interface Pixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  orientation: number;
  hasAlpha: boolean;
}

/** Animated WebP is decoded as its first frame only by the browser fallback. */
export type Decoded = Pixels & { firstFrameOnly?: boolean };

/** Browsers cap OffscreenCanvas / createImageBitmap use at 16 MP (global constraints). */
const BITMAP_MAX_PIXELS = 16_000_000;

export async function decode(bytes: ArrayBuffer, type: InType): Promise<Decoded> {
  switch (type) {
    case 'heic':
      return decodeHeic(bytes);
    case 'jpg':
      return decodeJpeg(bytes);
    case 'png':
      return decodePng(bytes);
    case 'webp':
      return decodeWebp(bytes);
  }
}

function usesAlpha(data: Uint8ClampedArray): boolean {
  for (let i = 3; i < data.length; i += 4) if (data[i] !== 255) return true;
  return false;
}

function toPixels(img: RawImage, orientation: number, hasAlpha: boolean): Pixels {
  if (!(img.width > 0 && img.height > 0) || img.data.length !== img.width * img.height * 4) {
    throw new DecodeError('The decoder returned an image of the wrong size');
  }
  return { data: img.data, width: img.width, height: img.height, orientation, hasAlpha };
}

/** Run a decoder call, keeping our own load errors but wrapping anything the decoder throws. */
async function guard<T>(what: string, fn: () => T | Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (cause) {
    if (cause instanceof CodecLoadError || cause instanceof DecodeError) throw cause;
    throw new DecodeError(`Could not read this ${what} file`, { cause });
  }
}

async function decodeJpeg(bytes: ArrayBuffer): Promise<Decoded> {
  const codec = await load.jpeg();
  return guard('JPG', () => {
    // Despite its name, jSquash's `preserveOrientation: true` rotates by the EXIF tag. We want stored pixels.
    const img = codec.decode(bytes, false);
    if (!img) throw new DecodeError('Could not read this JPG file');
    return toPixels(img, jpegOrientation(new Uint8Array(bytes)), false);
  });
}

async function decodePng(bytes: ArrayBuffer): Promise<Decoded> {
  const codec = await load.png();
  return guard('PNG', () => {
    const img = codec.decode(new Uint8Array(bytes));
    return toPixels(img, 1, usesAlpha(img.data));
  });
}

async function decodeWebp(bytes: ArrayBuffer): Promise<Decoded> {
  const codec = await load.webp();
  try {
    const img = await guard('WebP', () => {
      const out = codec.decode(bytes);
      if (!out) throw new DecodeError('Could not read this WebP file');
      return out;
    });
    return toPixels(img, 1, usesAlpha(img.data));
  } catch (err) {
    if (err instanceof CodecLoadError) throw err;
    // The wasm decoder rejects animated WebP. The browser can still give us the first frame.
    if (typeof createImageBitmap === 'function' && typeof OffscreenCanvas === 'function') {
      const first = await firstFrameViaBrowser(bytes).catch(() => null);
      if (first) return { ...first, firstFrameOnly: true };
    }
    throw err;
  }
}

async function firstFrameViaBrowser(bytes: ArrayBuffer): Promise<Pixels> {
  const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/webp' }));
  try {
    if (bitmap.width * bitmap.height > BITMAP_MAX_PIXELS) throw new DecodeError('Too large for the browser decoder');
    const ctx = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d');
    if (!ctx) throw new DecodeError('No 2D context');
    ctx.drawImage(bitmap, 0, 0);
    const { data, width, height } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    return toPixels({ data, width, height }, 1, usesAlpha(data));
  } finally {
    bitmap.close();
  }
}

/** libheif reports failures with console.log; keep workers and test output quiet. */
async function quietly<T>(fn: () => Promise<T> | T): Promise<T> {
  const log = console.log;
  console.log = () => {};
  try {
    return await fn();
  } finally {
    console.log = log;
  }
}

async function decodeHeic(bytes: ArrayBuffer): Promise<Decoded> {
  const heif = await load.heif();
  const view = new Uint8Array(bytes);
  const meta = heicOrientation(view);
  return guard('HEIC', () =>
    quietly(async () => {
      const decoder = new heif.HeifDecoder();
      const handles = decoder.decode(view);
      try {
        const primary: HeifImageHandle | undefined = handles.find((h) => h.is_primary()) ?? handles[0];
        if (!primary) throw new DecodeError('Could not read this HEIC file');
        const width = primary.get_width();
        const height = primary.get_height();
        if (!(width > 0 && height > 0)) throw new DecodeError('Could not read this HEIC file');
        const target: RawImage = { data: new Uint8ClampedArray(width * height * 4), width, height };
        const out = await new Promise<RawImage | null>((resolve) => primary.display(target, resolve));
        if (!out) throw new DecodeError('Could not read this HEIC file');
        // libheif already applied irot/imir, so EXIF must not be applied on top of it.
        return toPixels(out, meta.hasTransform ? 1 : meta.exif, usesAlpha(out.data));
      } finally {
        for (const h of handles) h.free();
        if (decoder.decoder) heif.heif_context_free(decoder.decoder);
      }
    }),
  );
}
