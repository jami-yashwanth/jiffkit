import type { InType } from '../tools';
import type { Done, Failed, Job, Progress, WorkerRequest, WorkerResponse } from './types';

export interface EngineClient {
  enqueue(job: Job): void;
  preload(types: InType[]): void;
  on(e: 'progress', cb: (p: Progress) => void): void;
  on(e: 'done', cb: (d: Done) => void): void;
  on(e: 'failed', cb: (f: Failed) => void): void;
  pending(): number;
}

const defaultWorkerFactory = (): Worker => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });

/** Main-thread wrapper around the engine worker. Runs jobs strictly one at a time, in order. */
export function createEngine(workerFactory: () => Worker = defaultWorkerFactory): EngineClient {
  const queue: Job[] = [];
  let inFlight: Job | null = null;
  let worker: Worker | null = null;
  const listeners: { progress: ((p: Progress) => void)[]; done: ((d: Done) => void)[]; failed: ((f: Failed) => void)[] } = {
    progress: [],
    done: [],
    failed: [],
  };

  const post = (message: WorkerRequest): void => getWorker().postMessage(message);

  function getWorker(): Worker {
    if (worker) return worker;
    const w = workerFactory();
    w.onmessage = (e: MessageEvent<WorkerResponse>) => {
      if (w === worker) handle(e.data);
    };
    w.onerror = () => {
      if (w === worker) crash();
    };
    worker = w;
    return w;
  }

  function next(): void {
    if (inFlight) return;
    inFlight = queue.shift() ?? null;
    if (inFlight) post({ kind: 'job', job: inFlight });
  }

  function handle(m: WorkerResponse): void {
    if (m.kind === 'progress') {
      const { kind: _, ...p } = m;
      listeners.progress.forEach((cb) => cb(p));
      return;
    }
    if (!inFlight || m.id !== inFlight.id) return;
    inFlight = null;
    if (m.kind === 'done') {
      const { kind: _, ...d } = m;
      listeners.done.forEach((cb) => cb(d));
    } else {
      const { kind: _, ...f } = m;
      listeners.failed.forEach((cb) => cb(f));
    }
    next();
  }

  /** The worker died (most likely out of memory). Fail the job it was running and start over with a fresh worker. */
  function crash(): void {
    worker?.terminate();
    worker = null;
    const lost = inFlight;
    inFlight = null;
    if (lost) listeners.failed.forEach((cb) => cb({ id: lost.id, reason: 'oom' }));
    next();
  }

  return {
    enqueue(job) {
      queue.push(job);
      next();
    },
    preload(types) {
      post({ kind: 'preload', types });
    },
    on(e: 'progress' | 'done' | 'failed', cb: never) {
      (listeners[e] as unknown[]).push(cb);
    },
    pending: () => queue.length + (inFlight ? 1 : 0),
  };
}
