import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { CodecLoadError, load, resetCodecs, setWasmSource } from '../../src/engine/codecs';
import { DecodeError, decode } from '../../src/engine/decode';
import { useNodeWasm } from '../helpers/node-codecs';

const require = createRequire(import.meta.url);

function fixture(name: string): Buffer {
  return readFileSync(resolve(__dirname, '../fixtures', name));
}

function ab(b: Uint8Array): ArrayBuffer {
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

/** Insert an APP1 Exif segment carrying only an Orientation tag right after the JPEG SOI. */
function withJpegOrientation(jpeg: Uint8Array, orientation: number, bigEndian: boolean): Uint8Array {
  const tiff = new DataView(new ArrayBuffer(26));
  const le = !bigEndian;
  tiff.setUint16(0, bigEndian ? 0x4d4d : 0x4949);
  tiff.setUint16(2, 42, le);
  tiff.setUint32(4, 8, le);
  tiff.setUint16(8, 1, le); // one IFD entry
  tiff.setUint16(10, 0x0112, le);
  tiff.setUint16(12, 3, le); // SHORT
  tiff.setUint32(14, 1, le);
  tiff.setUint16(18, orientation, le);
  const payload = new Uint8Array([...new TextEncoder().encode('Exif\0\0'), ...new Uint8Array(tiff.buffer)]);
  const seg = new Uint8Array(4 + payload.length);
  seg.set([0xff, 0xe1, (payload.length + 2) >> 8, (payload.length + 2) & 0xff]);
  seg.set(payload, 4);
  const out = new Uint8Array(jpeg.length + seg.length);
  out.set(jpeg.subarray(0, 2));
  out.set(seg, 2);
  out.set(jpeg.subarray(2), 2 + seg.length);
  return out;
}

beforeAll(useNodeWasm);

describe('decode: HEIC', () => {
  it('decodes a 12 MP HEIC to raw RGBA', async () => {
    const px = await decode(ab(fixture('iphone-12mp.heic')), 'heic');
    expect([px.width, px.height]).toEqual([4032, 3024]);
    expect(px.data.length).toBe(4032 * 3024 * 4);
    expect(px.orientation).toBe(1);
    expect(px.hasAlpha).toBe(false);
  }, 60_000);

  it('keeps stored dimensions and reports the EXIF orientation', async () => {
    const px = await decode(ab(fixture('rotated-6.heic')), 'heic');
    expect([px.width, px.height, px.orientation]).toEqual([400, 300, 6]);
  });

  it('decodes the primary image of a multi-image HEIC', async () => {
    const px = await decode(ab(fixture('multi.heic')), 'heic');
    expect([px.width, px.height]).toEqual([400, 300]);
  });

  it('lets an irot box win over stale EXIF: libheif rotates, orientation resets to 1', async () => {
    const file = fixture('rotated-6.heic');
    const at = file.indexOf('irot');
    expect(file[at + 4]).toBe(0); // fixture ships with a no-op irot
    file[at + 4] = 1; // 90 degrees counter-clockwise
    const px = await decode(ab(file), 'heic');
    expect([px.width, px.height, px.orientation]).toEqual([300, 400, 1]);
  });

  it.each(['truncated.heic', 'empty.heic', 'text-as.heic'])('rejects %s with DecodeError', async (name) => {
    await expect(decode(ab(fixture(name)), 'heic')).rejects.toBeInstanceOf(DecodeError);
  });
});

describe('decode: JPEG', () => {
  it('decodes photo.jpg without an orientation tag', async () => {
    const px = await decode(ab(fixture('photo.jpg')), 'jpg');
    expect(px.data.length).toBe(px.width * px.height * 4);
    expect(px.width).toBeGreaterThan(0);
    expect(px.orientation).toBe(1);
    expect(px.hasAlpha).toBe(false);
  });

  it.each([
    [6, false],
    [8, true],
    [3, false],
  ])('reads EXIF orientation %i (bigEndian=%s) and keeps stored pixels', async (o, be) => {
    const plain = await decode(ab(fixture('photo.jpg')), 'jpg');
    const tagged = await decode(ab(withJpegOrientation(fixture('photo.jpg'), o, be)), 'jpg');
    expect(tagged.orientation).toBe(o);
    expect([tagged.width, tagged.height]).toEqual([plain.width, plain.height]);
    expect(Buffer.from(tagged.data.buffer).equals(Buffer.from(plain.data.buffer))).toBe(true); // toEqual would print megabytes on failure
  });

  it('treats an out-of-range orientation as 1', async () => {
    const px = await decode(ab(withJpegOrientation(fixture('photo.jpg'), 9, false)), 'jpg');
    expect(px.orientation).toBe(1);
  });

  it('rejects garbage with DecodeError', async () => {
    await expect(decode(ab(Uint8Array.of(0xff, 0xd8, 0xff, 1, 2, 3)), 'jpg')).rejects.toBeInstanceOf(DecodeError);
  });
});

describe('decode: PNG', () => {
  it('reports alpha for alpha.png', async () => {
    const px = await decode(ab(fixture('alpha.png')), 'png');
    expect(px.hasAlpha).toBe(true);
    expect(px.data.length).toBe(px.width * px.height * 4);
  });

  it.each(['png16.png', 'grey.png', 'palette.png'])('%s decodes to RGBA8', async (name) => {
    const px = await decode(ab(fixture(name)), 'png');
    expect(px.data).toBeInstanceOf(Uint8ClampedArray);
    expect(px.data.length).toBe(px.width * px.height * 4);
    expect(px.orientation).toBe(1);
  });

  it('rejects garbage with DecodeError', async () => {
    await expect(decode(ab(Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0, 0)), 'png')).rejects.toBeInstanceOf(DecodeError);
  });
});

describe('decode: WebP', () => {
  it('decodes lossless.webp', async () => {
    const px = await decode(ab(fixture('lossless.webp')), 'webp');
    expect(px.data.length).toBe(px.width * px.height * 4);
    expect(px.firstFrameOnly).toBeUndefined();
  });

  it('decodes lossy.webp', async () => {
    const px = await decode(ab(fixture('lossy.webp')), 'webp');
    expect(px.data.length).toBe(px.width * px.height * 4);
  });

  it('reports alpha for alpha.webp', async () => {
    expect((await decode(ab(fixture('alpha.webp')), 'webp')).hasAlpha).toBe(true);
  });

  it('animated.webp is rejected by the wasm decoder, so Node (no createImageBitmap) gets a DecodeError', async () => {
    await expect(decode(ab(fixture('animated.webp')), 'webp')).rejects.toBeInstanceOf(DecodeError);
  });

  it('rejects garbage with DecodeError when no browser fallback exists', async () => {
    await expect(decode(ab(new TextEncoder().encode('RIFF....WEBPnope')), 'webp')).rejects.toBeInstanceOf(DecodeError);
  });
});

describe('codec loading', () => {
  afterEach(() => {
    resetCodecs();
    useNodeWasm();
  });

  it('maps an instantiate failure to CodecLoadError, then retries cleanly', async () => {
    resetCodecs();
    let fail = true;
    setWasmSource(async () => {
      if (fail) throw new Error('offline');
      return WebAssembly.compile(readFileSync(require.resolve('@jsquash/webp/codec/dec/webp_dec.wasm')));
    });
    await expect(load.webp()).rejects.toBeInstanceOf(CodecLoadError);
    await expect(decode(ab(fixture('lossless.webp')), 'webp')).rejects.toBeInstanceOf(CodecLoadError);
    fail = false;
    await expect(decode(ab(fixture('lossless.webp')), 'webp')).resolves.toMatchObject({ hasAlpha: expect.any(Boolean) });
  });

  it('memoises a successful load', async () => {
    expect(load.png()).toBe(load.png());
  });
});
