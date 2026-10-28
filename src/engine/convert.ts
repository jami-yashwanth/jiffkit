import { getImageTool, type InType, type OutFormat } from '../tools';
import { CodecLoadError, load } from './codecs';
import { DecodeError, decode, type Decoded, type Pixels } from './decode';
import { applyOrientation, downscaleTo, fitWithin, flattenOnWhite, resizeBox } from './pixels';
import { sniff } from './sniff';
import {
  MAX_MEGAPIXELS,
  THUMB_EDGE,
  type Done,
  type FailReason,
  type Failed,
  type Job,
  type Note,
  type Progress,
} from './types';

export interface Limits {
  maxMegapixels: number;
}

const OXIPNG_LEVEL = 2;

/** `IMG_2041.heic` + jpg -> `IMG_2041.jpg`. Only the last extension is replaced. */
export function outputName(inputName: string, format: OutFormat): string {
  return `${inputName.replace(/\.[^./\\]+$/, '')}.${format}`;
}

const OOM_MESSAGE = /alloc|\boom\b|enlarge memory|out ?of ?memory|maximum memory size exceeded/i;

/** Memory exhaustion surfaces as a RangeError or a wasm RuntimeError, possibly as the `cause` of a DecodeError. */
function isOutOfMemory(err: unknown): boolean {
  for (let e: unknown = err, depth = 0; e instanceof Error && depth < 5; e = e.cause, depth++) {
    const wasmError = typeof WebAssembly !== 'undefined' && e instanceof WebAssembly.RuntimeError;
    if ((e instanceof RangeError || wasmError) && OOM_MESSAGE.test(e.message)) return true;
  }
  return false;
}

function failReason(err: unknown): FailReason {
  if (err instanceof CodecLoadError) return 'codec-load';
  if (isOutOfMemory(err)) return 'oom';
  if (!(err instanceof DecodeError)) console.error('convert: unexpected error', err); // our bug, not a bad file
  return 'corrupt';
}

const megapixelsOf = (w: number, h: number): number => Math.floor((w * h) / 1e6);

/** Load every codec this job needs up front, so the `loading-codec` stage covers all of them. */
async function loadCodecs(input: InType, output: OutFormat): Promise<void> {
  const decoder = { heic: load.heif, jpg: load.jpeg, png: load.png, webp: load.webp }[input];
  const encoder = { jpg: load.jpegEnc, png: load.oxipng, webp: load.webpEnc }[output];
  await Promise.all([decoder(), encoder()]);
}

async function encode(p: Pixels, format: OutFormat, quality: number): Promise<Uint8Array> {
  const image = { data: p.data, width: p.width, height: p.height };
  switch (format) {
    case 'jpg':
      return (await load.jpegEnc()).encode(image, quality);
    case 'webp':
      return (await load.webpEnc()).encode(image, quality);
    case 'png':
      return (await load.oxipng()).optimise_raw(p.data, p.width, p.height, OXIPNG_LEVEL, false, false);
  }
}

const MIME: Record<OutFormat, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const THUMB_QUALITY = 70;

/**
 * A preview no bigger than THUMB_EDGE on the long edge, encoded with the output format's codec (already loaded;
 * JPG output was flattened, PNG/WebP keep their alpha).
 */
async function thumbnail(p: Pixels, format: OutFormat): Promise<Blob> {
  const long = Math.max(p.width, p.height);
  const small = long <= THUMB_EDGE ? p : downscaleTo(p, (THUMB_EDGE * THUMB_EDGE * Math.min(p.width, p.height)) / long / 1e6);
  return new Blob([(await encode(small, format, THUMB_QUALITY)) as BlobPart], { type: MIME[format] });
}

export async function convert(
  job: Job,
  onProgress?: (p: Progress) => void,
  limits: Limits = { maxMegapixels: MAX_MEGAPIXELS },
): Promise<Done | Failed> {
  const { id, file, options } = job;
  const fail = (reason: FailReason, extra: Partial<Failed> = {}): Failed => ({ id, reason, ...extra });
  const progress = (stage: Progress['stage']) => onProgress?.({ id, stage });
  const tool = getImageTool(job.tool);

  if (file.size === 0) return fail('corrupt');

  let sniffed;
  try {
    sniffed = await sniff(file);
  } catch {
    return fail('corrupt');
  }
  if (sniffed.type === 'unknown' || !tool.accepts.includes(sniffed.type)) {
    return fail('wrong-type', sniffed.type === 'unknown' ? {} : { detectedType: sniffed.type });
  }
  const inType = sniffed.type;

  const requested = options.format;
  const format: OutFormat =
    tool.outputs === 'same'
      ? inType === 'heic' ? 'jpg' : inType
      : requested && tool.outputs.includes(requested)
        ? requested
        : (tool.defaults.format ?? tool.outputs[0]!);
  const positive = (n: number | undefined): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;
  const quality = Math.min(100, Math.max(1, Math.round(positive(options.quality) ? options.quality : tool.defaults.quality)));
  const target = positive(options.downscaleTo) ? options.downscaleTo : undefined;

  const tooLarge = (w: number, h: number): boolean => w * h > limits.maxMegapixels * 1e6;
  if (target === undefined && sniffed.width && sniffed.height && tooLarge(sniffed.width, sniffed.height)) {
    return fail('too-large', { megapixels: megapixelsOf(sniffed.width, sniffed.height) });
  }

  try {
    let bytes: ArrayBuffer;
    try {
      bytes = await file.arrayBuffer();
    } catch {
      return fail('corrupt');
    }

    progress('loading-codec');
    await loadCodecs(inType, format);

    progress('decoding');
    const decoded: Decoded = await decode(bytes, inType);
    bytes = new ArrayBuffer(0);
    if (target === undefined && !sniffed.width && tooLarge(decoded.width, decoded.height)) {
      return fail('too-large', { megapixels: megapixelsOf(decoded.width, decoded.height) });
    }

    const notes: Note[] = ['gps-removed'];
    if (decoded.firstFrameOnly) notes.push('first-frame-only');

    let pixels: Pixels = applyOrientation(decoded);
    if (target !== undefined) pixels = downscaleTo(pixels, target);
    const box = options.resize && {
      width: positive(options.resize.width) ? Math.round(options.resize.width) : undefined,
      height: positive(options.resize.height) ? Math.round(options.resize.height) : undefined,
    };
    if (box) {
      const [w, h] = fitWithin(pixels.width, pixels.height, box);
      if (w < pixels.width || h < pixels.height) pixels = resizeBox(pixels, w, h);
      else notes.push('not-enlarged');
    }
    if (format === 'jpg' && pixels.hasAlpha) {
      pixels = flattenOnWhite(pixels);
      notes.push('transparency-filled');
    }

    progress('encoding');
    const out = await encode(pixels, format, quality);
    const thumb = await thumbnail(pixels, format);

    const unscaled = pixels.width === decoded.width && pixels.height === decoded.height;
    if (tool.slug === 'compress-image' && out.byteLength >= file.size && unscaled) {
      // Re-encoding made it bigger: hand back the user's own bytes. They were not rewritten, so we cannot
      // claim their location data was removed.
      return {
        id,
        blob: file,
        thumb,
        name: file.name,
        width: pixels.width,
        height: pixels.height,
        inBytes: file.size,
        outBytes: file.size,
        notes: notes.filter((n) => n !== 'gps-removed').concat('already-optimized'),
      };
    }

    const blob = new Blob([out as BlobPart], { type: MIME[format] });
    return {
      id,
      blob,
      thumb,
      name: outputName(file.name, format),
      width: pixels.width,
      height: pixels.height,
      inBytes: file.size,
      outBytes: blob.size,
      notes,
    };
  } catch (err) {
    return fail(failReason(err));
  }
}
