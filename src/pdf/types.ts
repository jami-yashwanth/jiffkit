export type PdfFail = 'encrypted' | 'corrupt' | 'codec-load';
export interface PdfOut {
  name: string;
  bytes: Uint8Array;
  pages: number;
}

export type SplitMode = { kind: 'every' } | { kind: 'ranges'; ranges: [number, number][] };

/** Page -> worker. File bytes travel as transferred ArrayBuffers. */
export type PdfRequest =
  | { kind: 'job'; id: string; op: 'count'; bytes: ArrayBuffer }
  | { kind: 'job'; id: string; op: 'merge'; files: ArrayBuffer[] }
  | { kind: 'job'; id: string; op: 'split'; bytes: ArrayBuffer; base: string; mode: SplitMode };

/** Worker -> page. */
export type PdfResponse =
  | { kind: 'done'; id: string; result: number | PdfOut | PdfOut[] }
  | { kind: 'failed'; id: string; reason: PdfFail };
