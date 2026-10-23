import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import exifr from 'exifr';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { CodecLoadError, load } from '../../src/engine/codecs';
import { convert, outputName } from '../../src/engine/convert';
import { sniff } from '../../src/engine/sniff';
import { MAX_MEGAPIXELS, type Done, type Failed, type Job, type Progress } from '../../src/engine/types';
import type { ToolSlug } from '../../src/tools';
import { useNodeWasm } from '../helpers/node-codecs';

const path = (name: string) => resolve(__dirname, '../fixtures', name);
const file = (name: string, type = ''): File => new File([readFileSync(path(name))], name, { type });
const job = (name: string, tool: ToolSlug, options: Job['options'] = {}): Job => ({ id: name, file: file(name), tool, options });
const bytes = async (b: Blob) => new Uint8Array(await b.arrayBuffer());
const isDone = (r: Done | Failed): r is Done => 'blob' in r;
async function done(j: Job, limits?: { maxMegapixels: number }): Promise<Done> {
  const r = await convert(j, undefined, limits);
  if (!isDone(r)) throw new Error(`expected Done, got ${JSON.stringify(r)}`);
  return r;
}
const failed = async (j: Job, limits?: { maxMegapixels: number }): Promise<Failed> => {
  const r = await convert(j, undefined, limits);
  if (isDone(r)) throw new Error('expected Failed');
  return r;
};
const magic = async (b: Blob, n = 4) => [...(await bytes(b)).subarray(0, n)];

beforeAll(() => useNodeWasm());

describe('outputName', () => {
  it('swaps the extension', () => {
    expect(outputName('IMG_2041.heic', 'jpg')).toBe('IMG_2041.jpg');
    expect(outputName('a.b.webp', 'png')).toBe('a.b.png');
    expect(outputName('noext', 'jpg')).toBe('noext.jpg');
  });
});

describe('convert: HEIC to JPG', () => {
  it('converts the 12 MP photo, strips GPS and reports progress', async () => {
    const stages: Progress['stage'][] = [];
    const j = job('iphone-12mp.heic', 'heic-to-jpg');
    const r = await convert(j, (p) => stages.push(p.stage));
    expect(isDone(r)).toBe(true);
    const d = r as Done;
    expect((await magic(d.blob, 2))).toEqual([0xff, 0xd8]);
    expect([d.width, d.height]).toEqual([4032, 3024]);
    expect(d.notes).toContain('gps-removed');
    expect(d.name).toBe('iphone-12mp.jpg');
    expect(d.inBytes).toBe(j.file.size);
    expect(d.outBytes).toBe(d.blob.size);
    expect(await exifr.gps(await bytes(d.blob))).toBeUndefined();
    expect(stages).toEqual(['loading-codec', 'decoding', 'encoding']);
  }, 120_000);

  it('applies the stored EXIF orientation: rotated-6.heic becomes 300x400', async () => {
    const d = await done(job('rotated-6.heic', 'heic-to-jpg'));
    expect([d.width, d.height]).toEqual([300, 400]);
  }, 60_000);

  it('rejects the 48 MP photo over a 40 MP limit, and converts it when downscaled', async () => {
    const f = await failed(job('iphone-48mp.heic', 'heic-to-jpg'), { maxMegapixels: 40 });
    expect(f).toMatchObject({ reason: 'too-large', megapixels: 48 });
    const d = await done(job('iphone-48mp.heic', 'heic-to-jpg', { downscaleTo: 24 }), { maxMegapixels: 40 });
    expect(d.width * d.height).toBeLessThanOrEqual(24_000_000);
  }, 300_000);

  it.each([
    ['empty.heic', 'corrupt'],
    ['truncated.heic', 'corrupt'],
  ])('%s is %s', async (name, reason) => {
    expect((await failed(job(name, 'heic-to-jpg'))).reason).toBe(reason);
  });

  it('text-as.heic is wrong-type', async () => {
    expect((await failed(job('text-as.heic', 'heic-to-jpg'))).reason).toBe('wrong-type');
  });
});

describe('convert: WebP', () => {
  it('rejects a PNG on webp-to-jpg with its detected type', async () => {
    expect(await failed(job('alpha.png', 'webp-to-jpg'))).toMatchObject({ reason: 'wrong-type', detectedType: 'png' });
  });

  it('writes PNG when asked', async () => {
    const d = await done(job('lossless.webp', 'webp-to-jpg', { format: 'png' }));
    expect(await magic(d.blob)).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect([d.width, d.height]).toEqual([800, 600]);
    expect(d.name).toBe('lossless.png');
  });

  it('fills transparency on white for JPG output', async () => {
    const d = await done(job('alpha.webp', 'webp-to-jpg'));
    expect(d.notes).toContain('transparency-filled');
    expect((await magic(d.blob, 2))).toEqual([0xff, 0xd8]);
  });
});

describe('convert: compress-image', () => {
  it('returns the original bytes when re-encoding would not make a PNG smaller', async () => {
    const once = await done(job('lossless.webp', 'webp-to-jpg', { format: 'png' })); // already OxiPNG output
    const again: Job = { id: 'again', file: new File([once.blob], 'x.png'), tool: 'compress-image', options: {} };
    const d = await done(again);
    expect(d.notes).toContain('already-optimized');
    expect(d.notes).not.toContain('gps-removed');
    expect(d.outBytes).toBe(d.inBytes);
    expect(await bytes(d.blob)).toEqual(await bytes(again.file));
    expect(d.name).toBe('x.png');
  });

  it('shrinks photo.jpg at quality 75 and stays JPEG', async () => {
    const d = await done(job('photo.jpg', 'compress-image', { quality: 75 }));
    expect(d.outBytes).toBeLessThan(d.inBytes);
    expect((await magic(d.blob, 2))).toEqual([0xff, 0xd8]);
    expect(d.notes).toContain('gps-removed');
    expect(await exifr.gps(await bytes(d.blob))).toBeUndefined();
  });

  it.each(['png16.png', 'grey.png', 'palette.png'])('%s stays a PNG with the same dimensions', async (name) => {
    const d = await done(job(name, 'compress-image'));
    expect(await magic(d.blob)).toEqual([0x89, 0x50, 0x4e, 0x47]);
    const { width, height } = await sniff(file(name));
    expect([d.width, d.height]).toEqual([width, height]);
  });

  it('compresses WebP to WebP', async () => {
    const d = await done(job('lossless.webp', 'compress-image'));
    expect(d.name).toBe('lossless.webp');
    expect(new TextDecoder().decode((await bytes(d.blob)).subarray(8, 12))).toBe('WEBP');
  });

  it('rejects the 63 MP JPEG with default limits', async () => {
    expect(MAX_MEGAPIXELS).toBe(50);
    expect(await failed(job('huge-63mp.jpg', 'compress-image'))).toMatchObject({ reason: 'too-large', megapixels: 63 });
  });
});

describe('convert: failure mapping', () => {
  it('maps a file that cannot be read to corrupt', async () => {
    const f = file('photo.jpg');
    Object.defineProperty(f, 'slice', { value: () => ({ arrayBuffer: () => Promise.reject(new Error('io')) }) });
    expect((await failed({ id: 'x', file: f, tool: 'compress-image', options: {} })).reason).toBe('corrupt');
  });

  describe('with a failing codec', () => {
    afterEach(() => vi.restoreAllMocks());

    it('maps memory exhaustion to oom', async () => {
      vi.spyOn(load, 'jpegEnc').mockRejectedValue(new RangeError('Array buffer allocation failed'));
      expect((await failed(job('photo.jpg', 'compress-image'))).reason).toBe('oom');
    });

    it('maps a WebAssembly memory error wrapped as a cause to oom', async () => {
      const cause = new WebAssembly.RuntimeError('memory access out of bounds');
      vi.spyOn(load, 'jpegEnc').mockResolvedValue({
        encode: () => {
          throw new Error('wrapped', { cause });
        },
      });
      expect((await failed(job('photo.jpg', 'compress-image'))).reason).toBe('oom');
    });

    it('maps a codec that cannot load to codec-load', async () => {
      vi.spyOn(load, 'jpeg').mockRejectedValue(new CodecLoadError('offline'));
      expect((await failed(job('photo.jpg', 'compress-image'))).reason).toBe('codec-load');
    });
  });
});
