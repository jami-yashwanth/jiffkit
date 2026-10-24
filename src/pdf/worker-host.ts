import { PdfError } from './ops';
import type { PdfOut, PdfRequest, PdfResponse, RasterOut } from './types';

export type PdfResult = number | PdfOut | PdfOut[] | RasterOut;

// Minimal view of the worker global, so the DOM lib's `self` types stay untouched.
const scope = self as unknown as {
  onmessage: ((e: MessageEvent<PdfRequest>) => void) | null;
  postMessage(message: PdfResponse, transfer?: Transferable[]): void;
};

const isRaster = (r: PdfResult): r is RasterOut => typeof r === 'object' && !Array.isArray(r) && 'files' in r;
const buffersOf = (result: PdfResult): Transferable[] =>
  typeof result === 'number'
    ? []
    : isRaster(result)
      ? result.files.map((f) => f.bytes.buffer as ArrayBuffer)
      : [result].flat().map((o) => o.bytes.buffer as ArrayBuffer);

/** Answer every job posted to this worker with `run`'s result, or its failure reason. Always answers, so the queue never stalls. */
export function serve(run: (msg: PdfRequest) => Promise<PdfResult>): void {
  scope.onmessage = async (e) => {
    const msg = e.data;
    try {
      const result = await run(msg);
      scope.postMessage({ kind: 'done', id: msg.id, result }, buffersOf(result));
    } catch (err) {
      if (!(err instanceof PdfError)) console.error('pdf worker: unexpected error', err);
      scope.postMessage({ kind: 'failed', id: msg.id, reason: err instanceof PdfError ? err.reason : 'corrupt' });
    }
  };
}
