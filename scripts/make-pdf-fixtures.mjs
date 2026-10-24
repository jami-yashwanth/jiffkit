// Writes the plain PDF fixtures. Page order is checkable by size: three-pages page n is (200+n) pt wide,
// two-pages page n is (300+n) pt wide. Each page also has its label drawn on it ("A1".."A3", "B1".."B2").
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDocument, StandardFonts } from 'pdf-lib';

const out = process.argv[2];
if (!out) throw new Error('usage: make-pdf-fixtures.mjs <output dir>');
mkdirSync(out, { recursive: true });

async function make(name, prefix, baseWidth, pages) {
  const doc = await PDFDocument.create();
  doc.setCreationDate(new Date(0));
  doc.setModificationDate(new Date(0));
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let n = 1; n <= pages; n++) {
    const page = doc.addPage([baseWidth + n, 300]);
    page.drawText(`${prefix}${n}`, { x: 20, y: 140, size: 48, font });
  }
  writeFileSync(join(out, name), await doc.save());
}

await make('three-pages.pdf', 'A', 200, 3);
await make('two-pages.pdf', 'B', 300, 2);
