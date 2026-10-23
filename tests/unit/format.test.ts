import { describe, expect, it } from 'vitest';
import { formatBytes, middleTruncate, uniqueNames } from '../../src/ui/format';
import { zipFiles } from '../../src/ui/zip';
import { unzipSync, strFromU8 } from 'fflate';

describe('formatBytes', () => {
  it('uses MB with one decimal', () => expect(formatBytes(2_400_000)).toBe('2.4 MB'));
  it('uses whole KB under a megabyte', () => expect(formatBytes(820_000)).toBe('820 KB'));
  it('shows small files in KB, at least 1', () => expect(formatBytes(34)).toBe('1 KB'));
  it('handles zero', () => expect(formatBytes(0)).toBe('0 KB'));
  it('rolls 999.6 KB over to MB', () => expect(formatBytes(999_600)).toBe('1.0 MB'));
});

describe('middleTruncate', () => {
  it('matches the spec example', () =>
    expect(middleTruncate('IMG_20261023_123456_final.heic', 28)).toBe('IMG_20261023_…_final.heic'));
  it('leaves short names alone', () => expect(middleTruncate('a.jpg', 28)).toBe('a.jpg'));
  it('never exceeds max and keeps the extension', () => {
    const out = middleTruncate('a-very-long-file-name-without-many-breaks-at-all.jpeg', 20);
    expect(out.length).toBeLessThanOrEqual(20);
    expect(out.endsWith('.jpeg')).toBe(true);
    expect(out).toContain('…');
  });
});

describe('uniqueNames', () => {
  it('numbers duplicates', () => expect(uniqueNames(['a.jpg', 'a.jpg', 'a.jpg'])).toEqual(['a.jpg', 'a-1.jpg', 'a-2.jpg']));
  it('avoids clashing with an existing suffixed name', () =>
    expect(uniqueNames(['a.jpg', 'a-1.jpg', 'a.jpg'])).toEqual(['a.jpg', 'a-1.jpg', 'a-2.jpg']));
  it('is case-insensitive, as most file systems are', () =>
    expect(uniqueNames(['A.jpg', 'a.jpg'])).toEqual(['A.jpg', 'a-1.jpg']));
  it('handles names without an extension', () => expect(uniqueNames(['x', 'x'])).toEqual(['x', 'x-1']));
});

describe('zipFiles', () => {
  it('stores every file under its name', async () => {
    const zip = await zipFiles([
      { name: 'a.jpg', blob: new Blob(['one']) },
      { name: 'a-1.jpg', blob: new Blob(['two']) },
    ]);
    const files = unzipSync(new Uint8Array(await zip.arrayBuffer()));
    expect(Object.keys(files)).toEqual(['a.jpg', 'a-1.jpg']);
    expect(strFromU8(files['a-1.jpg']!)).toBe('two');
    expect(zip.type).toBe('application/zip');
  });
});
