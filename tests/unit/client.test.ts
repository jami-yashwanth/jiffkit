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
  kind: 'done', id, blob: new Blob(), name: `${id}.jpg`, width: 1, height: 1, inBytes: 1, outBytes: 1, notes: [],
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
    old.reply(done('a'));
    expect(events).toEqual(['failed:a:oom']);
    expect(engine.pending()).toBe(1);
  });

  it('forwards preload to the worker', () => {
    const { engine, workers } = setup();
    engine.preload(['heic']);
    expect(workers[0].posted).toEqual([{ kind: 'preload', types: ['heic'] }]);
  });
});
