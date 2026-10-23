import { readFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { merge, pageCount, PdfError, split } from '../../src/pdf/ops';

const fx = (name: string): ArrayBuffer => {
  const b = readFileSync(`tests/fixtures/pdf/${name}`);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};
const widths = async (bytes: Uint8Array) => {
  const doc = await PDFDocument.load(bytes);
  return doc.getPages().map((p) => Math.round(p.getSize().width));
};
const reasonOf = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(PdfError);
    return (e as PdfError).reason;
  }
  return null;
};

describe('pdf ops', () => {
  it('counts pages', async () => {
    expect(await pageCount(fx('three-pages.pdf'))).toBe(3);
  });

  it('merges in the given order', async () => {
    const out = await merge([fx('three-pages.pdf'), fx('two-pages.pdf')]);
    expect(out.name).toBe('merged.pdf');
    expect(out.pages).toBe(5);
    expect(await widths(out.bytes)).toEqual([201, 202, 203, 301, 302]);
    const reversed = await merge([fx('two-pages.pdf'), fx('three-pages.pdf')]);
    expect(await widths(reversed.bytes)).toEqual([301, 302, 201, 202, 203]);
  });

  it('merges the same file twice', async () => {
    const out = await merge([fx('two-pages.pdf'), fx('two-pages.pdf')]);
    expect(out.pages).toBe(4);
    expect(await widths(out.bytes)).toEqual([301, 302, 301, 302]);
  });

  it('splits every page into its own file', async () => {
    const out = await split(fx('three-pages.pdf'), 'report', { kind: 'every' });
    expect(out.map((o) => o.name)).toEqual(['report-page-1.pdf', 'report-page-2.pdf', 'report-page-3.pdf']);
    expect(out.map((o) => o.pages)).toEqual([1, 1, 1]);
    expect(await Promise.all(out.map((o) => widths(o.bytes)))).toEqual([[201], [202], [203]]);
  });

  it('extracts ranges into one file, in the order given', async () => {
    const one = await split(fx('three-pages.pdf'), 'report', { kind: 'ranges', ranges: [[1, 2]] });
    expect(one).toHaveLength(1);
    expect(one[0].name).toBe('report-pages-1-2.pdf');
    expect(one[0].pages).toBe(2);
    expect(await widths(one[0].bytes)).toEqual([201, 202]);

    const several = await split(fx('three-pages.pdf'), 'report', { kind: 'ranges', ranges: [[1, 1], [3, 3]] });
    expect(several).toHaveLength(1);
    expect(several[0].name).toBe('report-pages-1-3.pdf');
    expect(await widths(several[0].bytes)).toEqual([201, 203]);
  });

  it('refuses to merge nothing', async () => {
    expect(await reasonOf(merge([]))).toBe('corrupt');
  });

  it('keeps a damaged, unencrypted file corrupt even if its content mentions /Encrypt', async () => {
    const filler = new TextEncoder().encode(`%PDF-1.7\n${'x'.repeat(200_000)} /Encrypt ${'y'.repeat(200_000)}\n`);
    expect(await reasonOf(pageCount(filler.buffer as ArrayBuffer))).toBe('corrupt');
  });

  it('reports an encrypted file as encrypted', async () => {
    expect(await reasonOf(pageCount(fx('encrypted.pdf')))).toBe('encrypted');
    expect(await reasonOf(merge([fx('three-pages.pdf'), fx('encrypted.pdf')]))).toBe('encrypted');
    expect(await reasonOf(split(fx('encrypted.pdf'), 'x', { kind: 'every' }))).toBe('encrypted');
  });

  it.each(['not-a.pdf', 'truncated.pdf'])('reports %s as corrupt', async (name) => {
    expect(await reasonOf(pageCount(fx(name)))).toBe('corrupt');
    expect(await reasonOf(merge([fx(name)]))).toBe('corrupt');
  });
});

describe('pdf ops when the pdf-lib chunk fails to load', () => {
  afterEach(() => {
    vi.doUnmock('pdf-lib');
    vi.resetModules();
  });

  it('fails every op as codec-load, not corrupt', async () => {
    vi.resetModules();
    vi.doMock('pdf-lib', () => {
      throw new TypeError('Failed to fetch dynamically imported module');
    });
    const ops = await import('../../src/pdf/ops');
    const reason = (p: Promise<unknown>) => p.then(() => null, (e: { reason?: string }) => e.reason);
    expect(await reason(ops.loadLib())).toBe('codec-load');
    expect(await reason(ops.pageCount(fx('three-pages.pdf')))).toBe('codec-load');
    expect(await reason(ops.merge([fx('three-pages.pdf'), fx('two-pages.pdf')]))).toBe('codec-load');
    expect(await reason(ops.split(fx('three-pages.pdf'), 'x', { kind: 'every' }))).toBe('codec-load');
  });
});
