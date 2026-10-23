import { rangesLabel } from './ranges';
import type { PdfFail, PdfOut, SplitMode } from './types';

export class PdfError extends Error {
  constructor(public reason: PdfFail) {
    super(reason);
    this.name = 'PdfError';
  }
}

// pdf-lib is large: load it on first use, so it never counts toward a page's first-load budget.
const lib = () => import('pdf-lib');
type Lib = Awaited<ReturnType<typeof lib>>;

async function open(L: Lib, bytes: ArrayBuffer) {
  try {
    // No ignoreEncryption: we must never write out a file we could not really read.
    return await L.PDFDocument.load(bytes);
  } catch (err) {
    // pdf-lib only raises EncryptedPDFError once it has parsed the file. With AES-256 it often fails earlier, on the
    // encrypted objects, so fall back to looking for the /Encrypt entry in the trailer or xref stream dictionary.
    const encrypted = err instanceof L.EncryptedPDFError || /\/Encrypt\b/.test(new TextDecoder('latin1').decode(bytes));
    throw new PdfError(encrypted ? 'encrypted' : 'corrupt');
  }
}

async function build(L: Lib, name: string, sources: { doc: Awaited<ReturnType<typeof open>>; indices: number[] }[]): Promise<PdfOut> {
  try {
    const out = await L.PDFDocument.create();
    for (const { doc, indices } of sources) {
      for (const page of await out.copyPages(doc, indices)) out.addPage(page);
    }
    return { name, bytes: await out.save(), pages: out.getPageCount() };
  } catch {
    throw new PdfError('corrupt');
  }
}

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from - 1 + i);

export async function pageCount(bytes: ArrayBuffer): Promise<number> {
  const L = await lib();
  return (await open(L, bytes)).getPageCount();
}

export async function merge(files: ArrayBuffer[]): Promise<PdfOut> {
  const L = await lib();
  const sources = [];
  for (const bytes of files) {
    const doc = await open(L, bytes);
    sources.push({ doc, indices: doc.getPageIndices() });
  }
  return build(L, 'merged.pdf', sources);
}

export async function split(bytes: ArrayBuffer, base: string, mode: SplitMode): Promise<PdfOut[]> {
  const L = await lib();
  const doc = await open(L, bytes);
  if (mode.kind === 'every') {
    return Promise.all(doc.getPageIndices().map((i) => build(L, `${base}-page-${i + 1}.pdf`, [{ doc, indices: [i] }])));
  }
  const indices = mode.ranges.flatMap(([s, e]) => range(s, e));
  return [await build(L, `${base}-pages-${rangesLabel(mode.ranges)}.pdf`, [{ doc, indices }])];
}
