import { modelUrl, type ModelKey } from '../config';
import { AiError } from '../errors';
import { evictModel, loadModelFiles } from '../loader';
import { createSession } from './session';

// onnxruntime-web in a tool's worker (Remove background, Upscale image): download its .wasm and the tool's model
// through our loader, then start a session on the WebAssembly backend. Worker-only.

export type Ort = typeof import('onnxruntime-web');
export type Session = import('onnxruntime-web').InferenceSession;
export type Progress = (stage: 'download' | 'work', done: number, total: number) => void;

const scope = self as unknown as { location: { href: string }; crossOriginIsolated?: boolean };

/**
 * The runtime's .wasm and the model, through our loader (Cache Storage, progress). Their download is reported as
 * one: done and total count only the files not yet cached, as the page does.
 */
export async function loadFiles(model: ModelKey, progress: Progress): Promise<{ wasm: ArrayBuffer; model: ArrayBuffer }> {
  const files = await loadModelFiles(['ortWasm', model], (done, total) => progress('download', done, total));
  return { wasm: files.get(modelUrl('ortWasm'))!, model: files.get(modelUrl(model))! };
}

/** Start onnxruntime on its WebAssembly backend. Its script ships with the site; the .wasm comes from loadFiles. */
export async function startRuntime(wasm: ArrayBuffer, model: ArrayBuffer): Promise<{ ort: Ort; session: Session }> {
  let ort: Ort;
  let glue: string;
  try {
    const [mod, mjs] = await Promise.all([import('ort-wasm-runtime'), import('onnxruntime-web/ort-wasm-simd-threaded.mjs?url')]);
    ort = mod;
    glue = new URL(mjs.default, scope.location.href).href;
    await import(/* @vite-ignore */ glue); // a glue script that can't load is a network failure, not the device's
  } catch {
    throw new AiError('network');
  }
  ort.env.logLevel = 'error';
  ort.env.wasm.proxy = false; // already off the main thread
  // Threads need cross-origin isolation (SharedArrayBuffer); without it, say so rather than let it try.
  ort.env.wasm.numThreads = scope.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
  ort.env.wasm.wasmPaths = { mjs: glue };
  ort.env.wasm.wasmBinary = wasm;
  try {
    return { ort, session: await createSession(ort, model) };
  } catch (err) {
    // A runtime that won't start may be a damaged cached .wasm: drop it, so the next try downloads it afresh.
    if (err instanceof AiError && err.reason === 'device') await evictModel(modelUrl('ortWasm'));
    throw err;
  }
}

const OOM = /alloc|\boom\b|enlarge memory|out ?of ?memory|maximum memory size exceeded|array buffer allocation/i;

/** Is this failure (or one it wraps) memory running out? */
export function isOutOfMemory(err: unknown): boolean {
  for (let e: unknown = err, depth = 0; e instanceof Error && depth < 5; e = e.cause, depth++) {
    const wasm = typeof WebAssembly !== 'undefined' && e instanceof WebAssembly.RuntimeError;
    if ((e instanceof RangeError || wasm) && OOM.test(e.message)) return true;
  }
  return false;
}
