export type PdfFail = 'encrypted' | 'corrupt' | 'codec-load';
export interface PdfOut {
  name: string;
  bytes: Uint8Array;
  pages: number;
}

/** PDF to JPG: one image per page, named `<base>-page-<n>.<ext>`. */
export interface RasterOut {
  files: { name: string; bytes: Uint8Array }[];
  /** At least one page was too big for the dpi asked for and was drawn smaller. */
  capped: boolean;
}
export type ImageFormat = 'jpg' | 'png';
export type PageSize = 'fit' | 'a4' | 'letter';
/** An image on its way into a PDF: JPEG or PNG bytes, with the pixel size they decode to. */
export interface ImageIn {
  bytes: ArrayBuffer;
  kind: ImageFormat;
  width: number;
  height: number;
}

export type SplitMode = { kind: 'every' } | { kind: 'ranges'; ranges: [number, number][] };

/** Page -> worker. File bytes travel as transferred ArrayBuffers. */
export type PdfRequest =
  | { kind: 'job'; id: string; op: 'warm' }
  | { kind: 'job'; id: string; op: 'count'; bytes: ArrayBuffer }
  | { kind: 'job'; id: string; op: 'merge'; files: ArrayBuffer[] }
  | { kind: 'job'; id: string; op: 'split'; bytes: ArrayBuffer; base: string; mode: SplitMode }
  | { kind: 'job'; id: string; op: 'rasterize'; bytes: ArrayBuffer; base: string; format: ImageFormat; dpi: 150 | 300 }
  | { kind: 'job'; id: string; op: 'images'; images: ImageIn[]; size: PageSize };

/** Worker -> page. */
export type PdfResponse =
  | { kind: 'done'; id: string; result: number | PdfOut | PdfOut[] | RasterOut }
  | { kind: 'failed'; id: string; reason: PdfFail };
