import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sniff } from '../../src/engine/sniff';

const LARGE = new Set(['iphone-48mp.heic', 'huge-63mp.jpg']);

function fixture(name: string): Blob {
  const path = resolve(__dirname, '../fixtures', name);
  if (!existsSync(path)) {
    throw new Error(
      LARGE.has(name) ? 'Run `npm run fixtures` first' : `Missing fixture ${name}`,
    );
  }
  return new Blob([readFileSync(path)]);
}

describe('sniff', () => {
  it('detects a 12 MP HEIC with dimensions', async () => {
    expect(await sniff(fixture('iphone-12mp.heic'))).toMatchObject({
      type: 'heic',
      width: 4032,
      height: 3024,
    });
  });

  it('reads the primary image dimensions of a 48 MP HEIC', async () => {
    expect(await sniff(fixture('iphone-48mp.heic'))).toMatchObject({
      type: 'heic',
      width: 8064,
      height: 6048,
    });
  });

  it('reports stored (unrotated) HEIC dimensions', async () => {
    expect(await sniff(fixture('rotated-6.heic'))).toMatchObject({
      type: 'heic',
      width: 400,
      height: 300,
    });
  });

  it('uses the primary item of a multi-image HEIC', async () => {
    expect(await sniff(fixture('multi.heic'))).toMatchObject({
      type: 'heic',
      width: 400,
      height: 300,
    });
  });

  it('detects JPEG with dimensions', async () => {
    expect(await sniff(fixture('photo.jpg'))).toEqual({ type: 'jpg', width: 1600, height: 1200 });
  });

  it('reads dimensions of a 63 MP JPEG', async () => {
    expect(await sniff(fixture('huge-63mp.jpg'))).toEqual({ type: 'jpg', width: 9000, height: 7000 });
  });

  it.each(['alpha.png', 'png16.png', 'grey.png', 'palette.png'])('detects PNG %s', async (name) => {
    expect(await sniff(fixture(name))).toEqual({ type: 'png', width: 200, height: 150 });
  });

  it('detects lossy WebP as not animated', async () => {
    expect(await sniff(fixture('lossy.webp'))).toEqual({
      type: 'webp',
      width: 800,
      height: 600,
      animated: false,
    });
  });

  it('detects lossless WebP dimensions', async () => {
    expect(await sniff(fixture('lossless.webp'))).toEqual({
      type: 'webp',
      width: 800,
      height: 600,
      animated: false,
    });
  });

  it('detects alpha WebP', async () => {
    expect(await sniff(fixture('alpha.webp'))).toMatchObject({ type: 'webp', width: 200, height: 150 });
  });

  it('detects animated WebP', async () => {
    expect(await sniff(fixture('animated.webp'))).toEqual({
      type: 'webp',
      width: 200,
      height: 150,
      animated: true,
    });
  });

  it('trusts content over the file extension', async () => {
    expect((await sniff(fixture('heic-named.jpg'))).type).toBe('heic');
  });

  it('keeps type for a truncated HEIC, dimensions best effort', async () => {
    expect((await sniff(fixture('truncated.heic'))).type).toBe('heic');
  });

  it.each(['empty.heic', 'text-as.heic'])('returns unknown for %s', async (name) => {
    expect(await sniff(fixture(name))).toEqual({ type: 'unknown' });
  });

  describe('crafted HEIC', () => {
    const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
    const box = (type: string, payload: number[]) => [
      ...u32(8 + payload.length),
      ...[...type].map((c) => c.charCodeAt(0)),
      ...payload,
    ];
    const ftyp = box('ftyp', [...[...'heic'].map((c) => c.charCodeAt(0)), 0, 0, 0, 0]);
    const blob = (bytes: number[]) => new Blob([new Uint8Array(bytes)]);

    const brands = (...names: string[]) => names.flatMap((n) => [...n].map((c) => c.charCodeAt(0)));
    const ftypOf = (major: string, ...compatible: string[]) => box('ftyp', [...brands(major), 0, 0, 0, 0, ...brands(...compatible)]);

    it.each(['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx'])('detects the HEVC major brand %s', async (major) => {
      expect((await sniff(blob(ftypOf(major, 'mif1')))).type).toBe('heic');
    });

    it('detects a mif1/msf1 file as HEIC only when a compatible brand says HEVC', async () => {
      expect((await sniff(blob(ftypOf('mif1', 'mif1', 'heic')))).type).toBe('heic');
      expect((await sniff(blob(ftypOf('msf1', 'msf1', 'hevc')))).type).toBe('heic');
      expect((await sniff(blob(ftypOf('mif1', 'mif1', 'avif', 'miaf')))).type).toBe('unknown');
      expect((await sniff(blob(ftypOf('avif', 'mif1', 'miaf')))).type).toBe('unknown');
    });

    it('survives a short ipma', async () => {
      const iprp = box('iprp', [...box('ipco', []), ...box('ipma', [])]);
      const pitm = box('pitm', [0, 0, 0, 0, 0, 1]);
      const meta = box('meta', [0, 0, 0, 0, ...pitm, ...iprp]);
      expect(await sniff(blob([...ftyp, ...meta]))).toEqual({ type: 'heic' });
    });

    it('survives a version-1 pitm cut off at the end of the buffer', async () => {
      const pitm = box('pitm', [1, 0, 0, 0, 0, 0]);
      const iprp = box('iprp', []);
      const meta = box('meta', [0, 0, 0, 0, ...iprp, ...pitm]);
      expect(await sniff(blob([...ftyp, ...meta]))).toEqual({ type: 'heic' });
    });
  });
});
