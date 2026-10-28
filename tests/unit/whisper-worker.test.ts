import { afterEach, describe, expect, it, vi } from 'vitest';
import { modelFiles, type ModelKey } from '../../src/ai/config';
import { AiError } from '../../src/ai/errors';

// The Transcribe audio worker in a stub build (no model runs), with the loader faked: which files it fetches.
const loaded: ModelKey[][] = [];
vi.mock('../../src/ai/loader', () => ({
  isCached: async () => true,
  evictModel: async () => {},
  loadModelFiles: async (keys: ModelKey[]) => {
    loaded.push(keys);
    if (keys.includes('ortWebgpu')) throw new AiError('network'); // a model host without the WebGPU runtime
    return new Map(keys.flatMap(modelFiles).map((f) => [f.url, new Uint8Array([1]).buffer]));
  },
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
  loaded.length = 0;
});

describe('whisper worker', () => {
  it('falls back from WebGPU to WebAssembly with the WebAssembly (q8) files, not the q4f16 ones', async () => {
    vi.stubEnv('PUBLIC_AI_STUB', '1');
    const posted: { kind: string; reason?: string }[] = [];
    const scope: { onmessage: ((e: unknown) => Promise<void>) | null; postMessage: (m: never) => void } = {
      onmessage: null,
      postMessage: (m) => posted.push(m),
    };
    vi.stubGlobal('self', scope);
    await import('../../src/ai/whisper/worker');
    await scope.onmessage!({ data: { kind: 'job', id: 'a', req: { audio: new ArrayBuffer(0), webgpu: true } } });
    expect(loaded).toEqual([
      ['whisperGpu', 'ortWebgpu'],
      ['whisper', 'ortWasm'],
    ]);
    expect(posted.at(-1)).toMatchObject({ kind: 'done' });
  });
});
