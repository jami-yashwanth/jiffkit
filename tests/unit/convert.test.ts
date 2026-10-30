import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import exifr from 'exifr';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { CodecLoadError, load } from '../../src/engine/codecs';
import { convert, outputName } from '../../src/engine/convert';
import { sniff } from '../../src/engine/sniff';
import { MAX_MEGAPIXELS, type Done, type Failed, type Job, type Progress } from '../../src/engine/types';
import type { ImageSlug } from '../../src/tools';
import { useNodeWasm } from '../helpers/node-codecs';

const path = (name: string) => resolve(__dirname, '../fixtures', name);
const file = (name: string, type = ''): File => new File([readFileSync(path(name))], name, { type });
const job = (name: string, tool: ImageSlug, options: Job['options'] = {}): Job => ({ id: name, file: file(name), tool, options });
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

describe('convert: PNG to JPG and JPG to PNG', () => {
  it('png-to-jpg makes a JPG, fills transparency with white and drops the metadata', async () => {
    const d = await done(job('alpha.png', 'png-to-jpg'));
    expect(await magic(d.blob, 2)).toEqual([0xff, 0xd8]);
    expect(d.name).toBe('alpha.jpg');
    expect([d.width, d.height]).toEqual([200, 150]);
    expect(d.notes).toEqual(expect.arrayContaining(['gps-removed', 'transparency-filled']));
  });

  it('png-to-jpg rejects a JPG with its detected type', async () => {
    expect(await failed(job('photo.jpg', 'png-to-jpg'))).toMatchObject({ reason: 'wrong-type', detectedType: 'jpg' });
  });

  it('jpg-to-png makes a PNG of the same size with no GPS left', async () => {
    const d = await done(job('photo.jpg', 'jpg-to-png'));
    expect(await magic(d.blob)).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(d.name).toBe('photo.png');
    expect([d.width, d.height]).toEqual([1600, 1200]);
    expect(d.notes).toContain('gps-removed');
    expect(await exifr.gps(await bytes(d.blob))).toBeUndefined();
  }, 60_000);

  it('jpg-to-png applies the EXIF orientation', async () => {
    const d = await done(job('rotated-6.jpg', 'jpg-to-png'));
    expect([d.width, d.height]).toEqual([300, 400]);
  });

  it('jpg-to-png rejects a PNG with its detected type', async () => {
    expect(await failed(job('alpha.png', 'jpg-to-png'))).toMatchObject({ reason: 'wrong-type', detectedType: 'png' });
  });
});

describe('convert: target size', () => {
  it('a 1600 × 1200 JPG to 20 KB is a JPG of at most 20,000 bytes', async () => {
    const d = await done(job('photo.jpg', 'compress-image-to-kb', { target: { maxKB: 20 } }));
    expect(await magic(d.blob, 2)).toEqual([0xff, 0xd8]);
    expect(d.name).toBe('photo.jpg');
    expect(d.outBytes).toBeLessThanOrEqual(20_000);
    expect(d.quality).toBeGreaterThanOrEqual(40);
    expect(d.quality).toBeLessThanOrEqual(92);
  }, 60_000);

  it('a HEIC to 50 KB is a JPG with no GPS, made smaller to fit', async () => {
    const d = await done(job('iphone-12mp.heic', 'compress-image-to-kb', { target: { maxKB: 50 } }));
    expect(await magic(d.blob, 2)).toEqual([0xff, 0xd8]);
    expect(d.name).toBe('iphone-12mp.jpg');
    expect(d.outBytes).toBeLessThanOrEqual(50_000);
    expect(d.notes).toContain('shrunk-to-fit');
    expect(await exifr.gps(await bytes(d.blob))).toBeUndefined();
  }, 120_000);

  it('a transparent PNG becomes a JPG on white', async () => {
    const d = await done(job('alpha.png', 'compress-image-to-kb', { target: { maxKB: 20 } }));
    expect(await magic(d.blob, 2)).toEqual([0xff, 0xd8]);
    expect(d.notes).toContain('transparency-filled');
  });

  it('re-encodes a JPG that already fits and strips GPS', async () => {
    const j = job('photo.jpg', 'compress-image-to-kb', { target: { maxKB: 5000 } });
    const d = await done(j);
    expect(d.blob).not.toBe(j.file);
    expect(d.notes).toContain('gps-removed');
    expect(d.notes).not.toContain('shrunk-to-fit');
    expect(await exifr.gps(await bytes(d.blob))).toBeUndefined();
  }, 60_000);

  it('a small image under a 10 KB minimum is reported, not padded', async () => {
    const d = await done(job('grey.png', 'compress-image-to-kb', { target: { maxKB: 20, minKB: 10 } }));
    expect(d.notes).toContain('under-minimum');
    expect(d.outBytes).toBeLessThan(10_240);
  });

  it('a fit-within box larger than the image adds no "kept" note to a size job', async () => {
    const d = await done(job('photo.jpg', 'compress-image-to-kb', { target: { maxKB: 5 }, resize: { width: 5000 } }));
    expect(d.notes).toContain('shrunk-to-fit');
    expect(d.notes).not.toContain('not-enlarged');
  }, 60_000);

  it('a JPG that already fits keeps its pixel size', async () => {
    const j = job('photo.jpg', 'compress-image-to-kb');
    j.options = { target: { maxKB: Math.ceil(j.file.size / 1000) + 1 } };
    const d = await done(j);
    expect([d.width, d.height]).toEqual([1600, 1200]);
    expect(d.notes).not.toContain('shrunk-to-fit');
    expect(d.outBytes).toBeLessThanOrEqual(j.options.target!.maxKB * 1000);
  }, 60_000);

  it('an impossible target is cannot-fit', async () => {
    expect((await failed(job('photo.jpg', 'compress-image-to-kb', { target: { maxKB: 0.05 } }))).reason).toBe('cannot-fit');
  }, 60_000);
});

describe('convert: Resize image', () => {
  it('fits a JPG to a width, keeping its format and proportions', async () => {
    const d = await done(job('photo.jpg', 'resize-image', { resize: { width: 400 } }));
    expect(await magic(d.blob, 2)).toEqual([0xff, 0xd8]);
    expect(d.name).toBe('photo.jpg');
    expect([d.width, d.height]).toEqual([400, 300]);
    expect(d.notes).not.toContain('not-enlarged');
  });

  it('fits a PNG to a height and keeps it a PNG with its transparency', async () => {
    const d = await done(job('alpha.png', 'resize-image', { resize: { height: 75 } }));
    expect(await magic(d.blob)).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect([d.width, d.height]).toEqual([100, 75]);
    expect(d.notes).not.toContain('transparency-filled');
  });

  it('fits a WebP inside a box by its tighter side', async () => {
    const d = await done(job('lossy.webp', 'resize-image', { resize: { width: 50, height: 50 } }));
    expect(Math.max(d.width, d.height)).toBe(50);
    expect(d.name).toMatch(/\.webp$/);
  });

  it('measures the box after the EXIF orientation: rotated-6.jpg (shown 300x400) to 200 wide is 200x267', async () => {
    const d = await done(job('rotated-6.jpg', 'resize-image', { resize: { width: 200 } }));
    expect([d.width, d.height]).toEqual([200, 267]);
  });

  it('never enlarges: an image already inside the box keeps its size and says so', async () => {
    const d = await done(job('alpha.png', 'resize-image', { resize: { width: 4000 } }));
    expect([d.width, d.height]).toEqual([200, 150]);
    expect(d.notes).toContain('not-enlarged');
  });

  it('ignores a side that is not a positive number', async () => {
    const d = await done(job('photo.jpg', 'resize-image', { resize: { width: -5, height: 600 } }));
    expect([d.width, d.height]).toEqual([800, 600]);
  });

  it('rejects a HEIC with its detected type', async () => {
    expect(await failed(job('iphone-12mp.heic', 'resize-image', { resize: { width: 100 } }))).toMatchObject({
      reason: 'wrong-type',
      detectedType: 'heic',
    });
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

    it.each([
      ['Aborted(OOM)', 'oom'],
      ['Cannot enlarge memory arrays', 'oom'],
      ['WebAssembly.Memory.grow(): Maximum memory size exceeded', 'oom'],
      ['OutOfMemory', 'oom'],
      ['memory access out of bounds', 'corrupt'],
    ])('maps a wrapped WebAssembly error "%s" to %s', async (message, reason) => {
      const cause = new WebAssembly.RuntimeError(message);
      vi.spyOn(load, 'jpegEnc').mockResolvedValue({
        encode: () => {
          throw new Error('wrapped', { cause });
        },
      });
      const err = vi.spyOn(console, 'error').mockImplementation(() => {});
      expect((await failed(job('photo.jpg', 'compress-image'))).reason).toBe(reason);
      expect(err).toHaveBeenCalledTimes(reason === 'corrupt' ? 1 : 0);
    });

    it('maps a codec that cannot load to codec-load', async () => {
      vi.spyOn(load, 'jpeg').mockRejectedValue(new CodecLoadError('offline'));
      expect((await failed(job('photo.jpg', 'compress-image'))).reason).toBe('codec-load');
    });
  });

  it('ignores invalid quality and downscaleTo', async () => {
    for (const bad of [NaN, 0, -5, Infinity]) {
      const d = await done(job('photo.jpg', 'compress-image', { quality: bad, downscaleTo: bad }));
      expect([d.width, d.height]).toEqual([1600, 1200]);
      expect(d.outBytes).toBeGreaterThan(1000);
    }
    const q = await done(job('photo.jpg', 'compress-image', { quality: NaN }));
    const dflt = await done(job('photo.jpg', 'compress-image'));
    expect(q.outBytes).toBe(dflt.outBytes);
  });
});

describe('convert: thumbnail', () => {
  const dims = async (b: Blob) => {
    const s = await sniff(b);
    return { type: s.type, w: s.width!, h: s.height! };
  };

  it('returns a small JPEG thumbnail of the oriented output for HEIC to JPG', async () => {
    const d = await done(job('rotated-6.heic', 'heic-to-jpg'));
    const t = await dims(d.thumb);
    expect(t.type).toBe('jpg');
    expect(Math.max(t.w, t.h)).toBeLessThanOrEqual(96);
    expect(Math.max(t.w, t.h)).toBeGreaterThanOrEqual(90);
    expect(t.h).toBeGreaterThan(t.w); // portrait, like the 300x400 output
    expect(d.thumb.size).toBeLessThan(20_000);
  });

  it('keeps transparency in a PNG thumbnail for PNG output', async () => {
    const d = await done(job('alpha.webp', 'webp-to-jpg', { format: 'png' }));
    expect((await dims(d.thumb)).type).toBe('png');
  });

  it('has a thumbnail for an already-optimized result too', async () => {
    const once = await done(job('lossless.webp', 'webp-to-jpg', { format: 'png' }));
    const again: Job = { id: 'again', file: new File([once.blob], 'x.png'), tool: 'compress-image', options: {} };
    const d = await done(again);
    expect(d.notes).toContain('already-optimized');
    const t = await dims(d.thumb);
    expect(Math.max(t.w, t.h)).toBeLessThanOrEqual(96);
  });
});
