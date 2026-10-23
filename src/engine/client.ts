import type { InType } from '../tools';
import type { Done, Failed, Job, Progress, WorkerRequest, WorkerResponse } from './types';

export interface EngineClient {
  enqueue(job: Job): void;
  preload(types: InType[]): void;
  on(e: 'progress', cb: (p: Progress) => void): void;
  on(e: 'done', cb: (d: Done) => void): void;
  on(e: 'failed', cb: (f: Failed) => void): void;
  pending(): number;
  /** Throw away the worker (and the codec modules it loaded) and continue with a fresh one. Used by "Try again". */
  restart(): void;
}

const defaultWorkerFactory = (): Worker => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });

/** Main-thread wrapper around the engine worker. Runs jobs strictly one at a time, in order. */
export function createEngine(workerFactory: () => Worker = defaultWorkerFactory): EngineClient {
  const queue: Job[] = [];
  let inFlight: Job | null = null;
  let worker: Worker | null = null;
  /** Has the current worker posted anything yet? An error before its first message means the script never loaded. */
  let heardFromWorker = false;
  const listeners: { progress: ((p: Progress) => void)[]; done: ((d: Done) => void)[]; failed: ((f: Failed) => void)[] } = {
    progress: [],
    done: [],
    failed: [],
  };

  const post = (message: WorkerRequest): void => getWorker().postMessage(message);

  function getWorker(): Worker {
    if (worker) return worker;
    const w = workerFactory();
    heardFromWorker = false;
    w.onmessage = (e: MessageEvent<WorkerResponse>) => {
      if (w !== worker) return;
      heardFromWorker = true;
      handle(e.data);
    };
    w.onerror = () => {
      if (w === worker) crash();
    };
    worker = w;
    return w;
  }

  /** Call every listener; one that throws is logged and must never stop the queue. */
  function emit<T>(cbs: ((x: T) => void)[], x: T): void {
    for (const cb of cbs) {
      try {
        cb(x);
      } catch (err) {
        console.error('engine: listener failed', err);
      }
    }
  }

  function next(): void {
    while (!inFlight && queue.length) {
      const job = queue.shift()!;
      inFlight = job;
      try {
        post({ kind: 'job', job });
      } catch (err) {
        // The worker could not even be created (blocked script, CSP, no Worker support): fail this job and move on.
        console.error('engine: could not start the worker', err);
        worker?.terminate();
        worker = null;
        inFlight = null;
        emit(listeners.failed, { id: job.id, reason: 'codec-load' });
      }
    }
  }

  function handle(m: WorkerResponse): void {
    if (m.kind === 'progress') {
      const { kind: _, ...p } = m;
      emit(listeners.progress, p);
      return;
    }
    if (!inFlight || m.id !== inFlight.id) return;
    inFlight = null;
    if (m.kind === 'done') {
      const { kind: _, ...d } = m;
      emit(listeners.done, d);
    } else {
      const { kind: _, ...f } = m;
      emit(listeners.failed, f);
    }
    next();
  }

  /**
   * The worker raised an error event. Before its first message that means its script failed to load (codec-load);
   * after it, the worker died mid-job (most likely out of memory). Fail the job and start over with a fresh worker.
   */
  function crash(): void {
    const reason = heardFromWorker ? 'oom' : 'codec-load';
    worker?.terminate();
    worker = null;
    const lost = inFlight;
    inFlight = null;
    if (lost) emit(listeners.failed, { id: lost.id, reason });
    next();
  }

  return {
    enqueue(job) {
      queue.push(job);
      next();
    },
    preload(types) {
      try {
        post({ kind: 'preload', types });
      } catch (err) {
        console.error('engine: could not start the worker', err); // the real job will report it
      }
    },
    on(e: 'progress' | 'done' | 'failed', cb: never) {
      (listeners[e] as unknown[]).push(cb);
    },
    pending: () => queue.length + (inFlight ? 1 : 0),
    restart() {
      worker?.terminate();
      worker = null;
      if (inFlight) queue.unshift(inFlight);
      inFlight = null;
      next();
    },
  };
}
