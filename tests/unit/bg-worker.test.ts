import { afterEach, describe, expect, it, vi } from 'vitest';

// The Remove background worker in a stub build, around faked decoding, model files and encoding: what it keeps.
vi.mock('../../src/engine/sniff', () => ({ sniff: async () => ({ type: 'png' }) }));
vi.mock('../../src/engine/decode', async (real) => ({
  ...(await real<typeof import('../../src/engine/decode')>()),
  decode: async () => ({ width: 4, height: 4, data: new Uint8ClampedArray(64).fill(255) }),
}));
vi.mock('../../src/ai/ort/runtime', async (real) => ({
  ...(await real<typeof import('../../src/ai/ort/runtime')>()),
  loadFiles: async () => ({ wasm: new ArrayBuffer(1), model: new Uint8Array([1]).buffer }),
}));
vi.mock('../../src/ai/encode', () => ({ encodePng: async () => new ArrayBuffer(1), encodePreview: async () => new ArrayBuffer(1) }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('bg worker', () => {
  it('lets go of the kept photo and mask on forget (Start over)', async () => {
    vi.stubEnv('PUBLIC_AI_STUB', '1');
    const posted: { kind: string; reason?: string }[] = [];
    const scope: { onmessage: ((e: unknown) => Promise<void>) | null; postMessage: (m: never) => void } = {
      onmessage: null,
      postMessage: (m) => posted.push(m),
    };
    vi.stubGlobal('self', scope);
    await import('../../src/ai/bg/worker');
    const job = async (req: unknown) => {
      await scope.onmessage!({ data: { kind: 'job', id: 'j', req } });
      return posted.at(-1)!;
    };
    expect(await job({ op: 'remove', image: new ArrayBuffer(8) })).toMatchObject({ kind: 'done' });
    expect(await job({ op: 'compose', bg: 'transparent' })).toMatchObject({ kind: 'done' });
    expect(await job({ op: 'forget' })).toMatchObject({ kind: 'done' });
    // Nothing kept: composing again is the "worker was replaced" failure.
    expect(await job({ op: 'compose', bg: 'transparent' })).toMatchObject({ kind: 'failed', reason: 'device' });
  });
});
