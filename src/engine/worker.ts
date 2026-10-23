import { preload } from './codecs';
import { convert } from './convert';
import type { WorkerRequest, WorkerResponse } from './types';

// Minimal view of the worker global, so the DOM lib's `self` types stay untouched.
const scope = self as unknown as {
  onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(message: WorkerResponse): void;
};

const send = (message: WorkerResponse): void => scope.postMessage(message);

scope.onmessage = async (e) => {
  const msg = e.data;
  if (msg.kind === 'preload') {
    preload(msg.types);
    return;
  }
  const { job } = msg;
  try {
    const result = await convert(job, (p) => send({ kind: 'progress', ...p }));
    send('blob' in result ? { kind: 'done', ...result } : { kind: 'failed', ...result });
  } catch (err) {
    // convert() reports file problems as `failed`; reaching here is our bug. Still answer, so the queue never stalls.
    console.error('worker: unexpected error', err);
    send({ kind: 'failed', id: job.id, reason: 'corrupt' });
  }
};
