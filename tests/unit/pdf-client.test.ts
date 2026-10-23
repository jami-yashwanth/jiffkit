import { describe, expect, it } from 'vitest';
import { createPdfEngine } from '../../src/pdf/client';
import { PdfError } from '../../src/pdf/ops';
import type { PdfRequest, PdfResponse } from '../../src/pdf/types';

class FakeWorker {
  posted: PdfRequest[] = [];
  terminated = false;
  onmessage: ((e: MessageEvent<PdfResponse>) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  postMessage(m: PdfRequest) {
    this.posted.push(m);
  }
  terminate() {
    this.terminated = true;
  }
  reply(m: PdfResponse) {
    this.onmessage?.({ data: m } as MessageEvent<PdfResponse>);
  }
  crash() {
    this.onerror?.({} as ErrorEvent);
  }
  get ids() {
    return this.posted.map((m) => m.id);
  }
}

function setup() {
  const workers: FakeWorker[] = [];
  const engine = createPdfEngine(() => {
    const w = new FakeWorker();
    workers.push(w);
    return w as unknown as Worker;
  });
  return { engine, workers };
}
const file = (n = 'a.pdf') => new File([new Uint8Array([1, 2, 3])], n);
const out = { name: 'merged.pdf', bytes: new Uint8Array([1]), pages: 1 };
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async <T>(p: Promise<T>) => p.then((v) => ({ ok: true as const, v }), (e: unknown) => ({ ok: false as const, e }));

describe('pdf client', () => {
  it('runs jobs one at a time, in order, and resolves each', async () => {
    const { engine, workers } = setup();
    const a = engine.count('1', file());
    const b = engine.merge([file(), file()]);
    await tick();
    expect(workers).toHaveLength(1);
    expect(workers[0].posted).toHaveLength(1);
    const first = workers[0].posted[0];
    expect(first).toMatchObject({ kind: 'job', op: 'count' });
    workers[0].reply({ kind: 'done', id: first.id, result: 7 });
    expect(await a).toBe(7);
    await tick();
    expect(workers[0].posted).toHaveLength(2);
    const second = workers[0].posted[1];
    expect(second).toMatchObject({ kind: 'job', op: 'merge' });
    workers[0].reply({ kind: 'done', id: second.id, result: out });
    expect(await b).toEqual(out);
  });

  it('rejects with a PdfError carrying the worker reason and keeps the worker', async () => {
    const { engine, workers } = setup();
    const a = settle(engine.count('1', file()));
    await tick();
    workers[0].reply({ kind: 'failed', id: workers[0].posted[0].id, reason: 'encrypted' });
    const r = await a;
    expect(r.ok === false && r.e).toBeInstanceOf(PdfError);
    expect(r.ok === false && (r.e as PdfError).reason).toBe('encrypted');
    const b = engine.count('2', file());
    await tick();
    expect(workers).toHaveLength(1);
    workers[0].reply({ kind: 'done', id: workers[0].posted[1].id, result: 1 });
    expect(await b).toBe(1);
  });

  it('a crash before the first message is codec-load, and the next job gets a fresh worker', async () => {
    const { engine, workers } = setup();
    const a = settle(engine.count('1', file()));
    const b = engine.count('2', file());
    await tick();
    workers[0].crash();
    const r = await a;
    expect(r.ok === false && (r.e as PdfError).reason).toBe('codec-load');
    expect(workers[0].terminated).toBe(true);
    await tick();
    expect(workers).toHaveLength(2);
    workers[1].reply({ kind: 'done', id: workers[1].posted[0].id, result: 4 });
    expect(await b).toBe(4);
  });

  it('a crash after the worker has spoken is corrupt', async () => {
    const { engine, workers } = setup();
    const a = engine.count('1', file());
    await tick();
    workers[0].reply({ kind: 'done', id: workers[0].posted[0].id, result: 1 });
    await a;
    const b = settle(engine.count('2', file()));
    await tick();
    workers[0].crash();
    const r = await b;
    expect(r.ok === false && (r.e as PdfError).reason).toBe('corrupt');
    const c = engine.count('3', file());
    await tick();
    expect(workers).toHaveLength(2);
    workers[1].reply({ kind: 'done', id: workers[1].posted[0].id, result: 2 });
    expect(await c).toBe(2);
  });

  it('ignores a stale crash from a replaced worker and unrelated replies', async () => {
    const { engine, workers } = setup();
    const a = settle(engine.count('1', file()));
    await tick();
    workers[0].crash();
    await a;
    const b = engine.count('2', file());
    await tick();
    workers[0].crash(); // old worker: must not fail job 2
    workers[1].reply({ kind: 'done', id: 'nope', result: 9 });
    workers[1].reply({ kind: 'done', id: workers[1].posted[0].id, result: 5 });
    expect(await b).toBe(5);
  });
});
