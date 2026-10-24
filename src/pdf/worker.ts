import { loadLib, merge, pageCount, PdfError, split } from './ops';
import type { PdfOut, PdfRequest, PdfResponse } from './types';

// Minimal view of the worker global, so the DOM lib's `self` types stay untouched.
const scope = self as unknown as {
  onmessage: ((e: MessageEvent<PdfRequest>) => void) | null;
  postMessage(message: PdfResponse, transfer?: Transferable[]): void;
};

const buffersOf = (result: number | PdfOut | PdfOut[]): Transferable[] =>
  typeof result === 'number' ? [] : [result].flat().map((o) => o.bytes.buffer as ArrayBuffer);

async function run(msg: PdfRequest): Promise<number | PdfOut | PdfOut[]> {
  switch (msg.op) {
    case 'warm':
      await loadLib();
      return 0;
    case 'count':
      return pageCount(msg.bytes);
    case 'merge':
      return merge(msg.files);
    case 'split':
      return split(msg.bytes, msg.base, msg.mode);
  }
}

scope.onmessage = async (e) => {
  const msg = e.data;
  try {
    const result = await run(msg);
    scope.postMessage({ kind: 'done', id: msg.id, result }, buffersOf(result));
  } catch (err) {
    if (!(err instanceof PdfError)) console.error('pdf worker: unexpected error', err);
    // Always answer, so the queue never stalls.
    scope.postMessage({ kind: 'failed', id: msg.id, reason: err instanceof PdfError ? err.reason : 'corrupt' });
  }
};
