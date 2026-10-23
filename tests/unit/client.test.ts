import { describe, expect, it } from 'vitest';
import { createEngine } from '../../src/engine/client';
import type { Done, Failed, Job, Progress, WorkerRequest, WorkerResponse } from '../../src/engine/types';

class FakeWorker {
  posted: WorkerRequest[] = [];
  terminated = false;
  onmessage: ((e: MessageEvent<WorkerResponse>) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  postMessage(m: WorkerRequest) {
    this.posted.push(m);
  }
  terminate() {
    this.terminated = true;
  }
  reply(m: WorkerResponse) {
    this.onmessage?.({ data: m } as MessageEvent<WorkerResponse>);
  }
  crash() {
    this.onerror?.({} as ErrorEvent);
  }
  get jobIds() {
    return this.posted.flatMap((m) => (m.kind === 'job' ? [m.job.id] : []));
  }
}

const job = (id: string): Job => ({ id, file: new File([], `${id}.heic`), tool: 'heic-to-jpg', options: {} });
const done = (id: string): WorkerResponse => ({
  kind: 'done', id, blob: new Blob(), thumb: new Blob(), name: `${id}.jpg`, width: 1, height: 1, inBytes: 1, outBytes: 1, notes: [],
});
const failedMsg = (id: string): WorkerResponse => ({ kind: 'failed', id, reason: 'corrupt' });

function setup() {
  const workers: FakeWorker[] = [];
  const engine = createEngine(() => {
    const w = new FakeWorker();
    workers.push(w);
    return w as unknown as Worker;
  });
  const events: string[] = [];
  engine.on('done', (d: Done) => events.push(`done:${d.id}`));
  engine.on('failed', (f: Failed) => events.push(`failed:${f.id}:${f.reason}`));
  engine.on('progress', (p: Progress) => events.push(`progress:${p.id}:${p.stage}`));
  return { engine, workers, events };
}

describe('engine client', () => {
  it('posts jobs one at a time, in order', () => {
    const { engine, workers } = setup();
    ['a', 'b', 'c'].forEach((id) => engine.enqueue(job(id)));
    expect(workers).toHaveLength(1);
    expect(workers[0].jobIds).toEqual(['a']);
    workers[0].reply(done('a'));
    expect(workers[0].jobIds).toEqual(['a', 'b']);
    workers[0].reply(done('b'));
    workers[0].reply(done('c'));
    expect(workers[0].jobIds).toEqual(['a', 'b', 'c']);
    expect(engine.pending()).toBe(0);
  });

  it('appends a job enqueued mid-run and counts it in pending()', () => {
    const { engine, workers } = setup();
    engine.enqueue(job('a'));
    expect(engine.pending()).toBe(1);
    engine.enqueue(job('b'));
    expect(engine.pending()).toBe(2);
    expect(workers[0].jobIds).toEqual(['a']);
    workers[0].reply(done('a'));
    expect(engine.pending()).toBe(1);
    expect(workers[0].jobIds).toEqual(['a', 'b']);
  });

  it('starts the next job after a failed one', () => {
    const { engine, workers, events } = setup();
    engine.enqueue(job('a'));
    engine.enqueue(job('b'));
    workers[0].reply(failedMsg('a'));
    expect(events).toEqual(['failed:a:corrupt']);
    expect(workers[0].jobIds).toEqual(['a', 'b']);
  });

  it('forwards progress without advancing the queue', () => {
    const { engine, workers, events } = setup();
    engine.enqueue(job('a'));
    engine.enqueue(job('b'));
    workers[0].reply({ kind: 'progress', id: 'a', stage: 'decoding' });
    expect(events).toEqual(['progress:a:decoding']);
    expect(workers[0].jobIds).toEqual(['a']);
    expect(engine.pending()).toBe(2);
  });

  it('fails the in-flight job as oom when the worker crashes, then uses a fresh worker', () => {
    const { engine, workers, events } = setup();
    engine.enqueue(job('a'));
    engine.enqueue(job('b'));
    workers[0].crash();
    expect(events).toEqual(['failed:a:oom']);
    expect(workers[0].terminated).toBe(true);
    expect(workers).toHaveLength(2);
    expect(workers[1].jobIds).toEqual(['b']);
    workers[1].reply(done('b'));
    expect(events).toEqual(['failed:a:oom', 'done:b']);
    expect(engine.pending()).toBe(0);
  });

  it('creates the replacement worker lazily when nothing is queued', () => {
    const { engine, workers } = setup();
    engine.enqueue(job('a'));
    workers[0].crash();
    expect(workers).toHaveLength(1);
    engine.enqueue(job('b'));
    expect(workers).toHaveLength(2);
    expect(workers[1].jobIds).toEqual(['b']);
  });

  it('ignores a late message from a crashed worker', () => {
    const { engine, workers, events } = setup();
    engine.enqueue(job('a'));
    engine.enqueue(job('b'));
    const old = workers[0];
    old.crash();
    expect(workers[1].jobIds).toEqual(['b']);
    // A stale answer for the job the NEW worker is running must not complete it.
    old.reply(done('b'));
    expect(events).toEqual(['failed:a:oom']);
    expect(engine.pending()).toBe(1);
    workers[1].reply(done('b'));
    expect(events).toEqual(['failed:a:oom', 'done:b']);
  });

  it('keeps the queue moving when a listener throws', () => {
    const { engine, workers, events } = setup();
    const errors: unknown[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => errors.push(args);
    try {
      engine.on('done', () => {
        throw new Error('listener bug');
      });
      engine.on('progress', () => {
        throw new Error('listener bug');
      });
      engine.enqueue(job('a'));
      engine.enqueue(job('b'));
      workers[0].reply({ kind: 'progress', id: 'a', stage: 'decoding' });
      workers[0].reply(done('a'));
      expect(workers[0].jobIds).toEqual(['a', 'b']);
      workers[0].reply(done('b'));
      expect(events).toEqual(['progress:a:decoding', 'done:a', 'done:b']);
      expect(engine.pending()).toBe(0);
      expect(errors.length).toBe(3);
    } finally {
      console.error = original;
    }
  });

  it('fails jobs as codec-load instead of stalling when the worker cannot be created', () => {
    let calls = 0;
    const workers: FakeWorker[] = [];
    const engine = createEngine(() => {
      calls++;
      if (calls === 1) throw new Error('blocked');
      const w = new FakeWorker();
      workers.push(w);
      return w as unknown as Worker;
    });
    const events: string[] = [];
    engine.on('failed', (f: Failed) => events.push(`failed:${f.id}:${f.reason}`));
    const original = console.error;
    console.error = () => {};
    try {
      engine.enqueue(job('a'));
    } finally {
      console.error = original;
    }
    expect(events).toEqual(['failed:a:codec-load']);
    expect(engine.pending()).toBe(0);
    engine.enqueue(job('b'));
    expect(workers[0].jobIds).toEqual(['b']);
  });

  it('terminates a worker whose postMessage throws, and continues with a fresh one', () => {
    const workers: FakeWorker[] = [];
    const engine = createEngine(() => {
      const w = new FakeWorker();
      if (workers.length === 0) {
        w.postMessage = () => {
          throw new DOMException('could not clone', 'DataCloneError');
        };
      }
      workers.push(w);
      return w as unknown as Worker;
    });
    const events: string[] = [];
    engine.on('failed', (f: Failed) => events.push(`failed:${f.id}:${f.reason}`));
    const original = console.error;
    console.error = () => {};
    try {
      engine.enqueue(job('a'));
    } finally {
      console.error = original;
    }
    expect(events).toEqual(['failed:a:codec-load']);
    expect(workers[0].terminated).toBe(true);
    engine.enqueue(job('b'));
    expect(workers[1].jobIds).toEqual(['b']);
  });

  it('does not throw from preload when the worker cannot be created', () => {
    const engine = createEngine(() => {
      throw new Error('blocked');
    });
    const original = console.error;
    console.error = () => {};
    try {
      expect(() => engine.preload(['heic'])).not.toThrow();
    } finally {
      console.error = original;
    }
  });

  it('restart() replaces the worker and resends the in-flight job', () => {
    const { engine, workers, events } = setup();
    engine.enqueue(job('a'));
    engine.enqueue(job('b'));
    engine.restart();
    expect(workers[0].terminated).toBe(true);
    expect(workers[1].jobIds).toEqual(['a']);
    workers[0].reply(done('a')); // stale
    expect(events).toEqual([]);
    workers[1].reply(done('a'));
    expect(workers[1].jobIds).toEqual(['a', 'b']);
    expect(events).toEqual(['done:a']);
  });

  it('forwards preload to the worker', () => {
    const { engine, workers } = setup();
    engine.preload(['heic']);
    expect(workers[0].posted).toEqual([{ kind: 'preload', types: ['heic'] }]);
  });
});
