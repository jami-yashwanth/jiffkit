import { CodecLoadError, load } from '../../engine/codecs';
import { DecodeError, decode, type Pixels } from '../../engine/decode';
import { sniff } from '../../engine/sniff';
import type { AiWorkerRequest, AiWorkerResponse } from '../client';
import { MODELS, modelUrl } from '../config';
import { AiError, reasonOf } from '../errors';
import { loadModel } from '../loader';
import { MODEL_SIZE, composeRGBA, normaliseMask, prepareInput, toModelInput, upsampleMask, type Background } from './compose';

// The Remove background worker. A `remove` job decodes the photo (upright, at most 25 MP), runs u2netp on it with
// onnxruntime-web, and answers with a transparent PNG. The photo and its mask stay here, so a `compose` job can put
// the cut-out on another background without running the model again. Protocol: ../client.ts.

export type BgRequest =
  | { op: 'remove'; image: ArrayBuffer; webgpu: boolean }
  | { op: 'compose'; bg: Background };

export interface BgResult {
  png: ArrayBuffer;
  width: number;
  height: number;
  /** The photo was over 25 MP and was processed at 25 MP. */
  downscaled: boolean;
}

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<AiWorkerRequest<BgRequest>>) => void) | null;
  postMessage(message: AiWorkerResponse<BgResult>, transfer?: Transferable[]): void;
  location: { href: string };
  crossOriginIsolated?: boolean;
};

type Progress = (stage: 'download' | 'work', done: number, total: number) => void;

/** Smallest zlib effort: a 25 MP cut-out encodes in seconds, not minutes. The pixels are lossless either way. */
const PNG_LEVEL = 1;

// --- the runtime and the model session, kept for the next photo ---

type Ort = typeof import('onnxruntime-web');
type Session = import('onnxruntime-web').InferenceSession;
let session: { key: string; ort: Ort; session: Session } | null = null;
/** Set once the WebGPU runtime failed to load or start here: later jobs go straight to WebAssembly. */
let webgpuUnavailable = false;

const absolute = (url: string) => new URL(url, scope.location.href).href;

/** Same-origin bytes of the runtime, fetched here so a failure reads as "network", not as a bad model. */
async function fetchBytes(url: string): Promise<ArrayBuffer> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    return await res.arrayBuffer();
  } catch {
    throw new AiError('network');
  }
}

function configure(ort: Ort, mjs: string, wasmBinary: ArrayBuffer): void {
  ort.env.logLevel = 'error';
  ort.env.wasm.proxy = false; // already off the main thread
  // Threads need cross-origin isolation (SharedArrayBuffer); without it, say so rather than let it try.
  ort.env.wasm.numThreads = scope.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
  ort.env.wasm.wasmPaths = { mjs: absolute(mjs) };
  ort.env.wasm.wasmBinary = wasmBinary;
}

/** The WebAssembly runtime: script and .wasm both ship with the site. */
async function wasmRuntime(): Promise<Ort> {
  try {
    const [ort, mjs, wasm] = await Promise.all([
      import('ort-wasm-runtime'),
      import('onnxruntime-web/ort-wasm-simd-threaded.mjs?url'),
      import('onnxruntime-web/ort-wasm-simd-threaded.wasm?url'),
    ]);
    await import(/* @vite-ignore */ absolute(mjs.default)); // a glue script that can't load is a network failure
    configure(ort, mjs.default, await fetchBytes(absolute(wasm.default)));
    return ort;
  } catch (err) {
    throw err instanceof AiError ? err : new AiError('network');
  }
}

/** The WebGPU runtime: its script ships with the site, its 27 MB .wasm comes from MODEL_BASE (and is cached). */
async function webgpuRuntime(): Promise<Ort> {
  const [ort, mjs] = await Promise.all([
    import('ort-webgpu-runtime'),
    import('onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url'),
  ]);
  await import(/* @vite-ignore */ absolute(mjs.default));
  const wasm = await loadModel(modelUrl('ortWebgpu'), { bytes: MODELS.ortWebgpu.bytes });
  configure(ort, mjs.default, wasm);
  return ort;
}

/** An ONNX file is a protobuf whose first field is ir_version (tag 0x08). Anything else is not a model. */
const looksLikeOnnx = (model: ArrayBuffer) => model.byteLength > 1024 && new Uint8Array(model, 0, 1)[0] === 0x08;

async function createSession(model: ArrayBuffer, webgpu: boolean): Promise<{ ort: Ort; session: Session }> {
  if (!looksLikeOnnx(model)) throw new AiError('network', { badModel: true });
  if (webgpu && !webgpuUnavailable) {
    try {
      const ort = await webgpuRuntime();
      return { ort, session: await ort.InferenceSession.create(new Uint8Array(model), { executionProviders: ['webgpu', 'wasm'] }) };
    } catch {
      webgpuUnavailable = true; // no WebGPU .wasm on this model host, or no usable adapter: use WebAssembly
    }
  }
  const ort = await wasmRuntime();
  try {
    return { ort, session: await ort.InferenceSession.create(new Uint8Array(model), { executionProviders: ['wasm'] }) };
  } catch {
    throw new AiError('network', { badModel: true }); // the runtime is up, so it's the model's bytes
  }
}

/** The model's mask for this input (MODEL_SIZE², 0..1 after normalising). Downloads the model on first use. */
async function predict(input: Float32Array, req: Extract<BgRequest, { op: 'remove' }>, progress: Progress): Promise<Float32Array> {
  const url = modelUrl('bg');
  if (session?.key !== url) {
    session = null;
    const model = await loadModel(url, {
      bytes: MODELS.bg.bytes,
      onProgress: (done, total) => progress('download', done, total),
    });
    if (import.meta.env.PUBLIC_AI_STUB === '1') {
      const { isStubBadModel } = await import('../stub');
      if (isStubBadModel(model)) throw new AiError('network', { badModel: true });
    } else {
      progress('work', 0, 100);
      session = { key: url, ...(await createSession(model, req.webgpu)) };
    }
  }
  progress('work', 20, 100);
  if (import.meta.env.PUBLIC_AI_STUB === '1') {
    const { stubBgMask } = await import('../stub');
    return stubBgMask(MODEL_SIZE);
  }
  const { ort, session: s } = session!;
  const feeds = { [s.inputNames[0]!]: new ort.Tensor('float32', input, [1, 3, MODEL_SIZE, MODEL_SIZE]) };
  const out = await s.run(feeds);
  const first = out[s.outputNames[0]!]!;
  const mask = new Float32Array(first.data as Float32Array); // a copy: the tensor may be backed by GPU memory
  for (const t of Object.values(out)) t.dispose();
  return mask;
}

// --- the photo and its mask, kept for compose jobs ---

let kept: { pixels: Pixels; alpha: Uint8ClampedArray; downscaled: boolean } | null = null;

async function encode(p: Pixels): Promise<ArrayBuffer> {
  const png = (await load.oxipng()).optimise_raw(p.data, p.width, p.height, PNG_LEVEL, false, false);
  return png.byteOffset === 0 && png.byteLength === png.buffer.byteLength ? (png.buffer as ArrayBuffer) : (png.slice().buffer as ArrayBuffer);
}

async function remove(req: Extract<BgRequest, { op: 'remove' }>, progress: Progress): Promise<BgResult> {
  kept = null; // the last photo's memory goes before this one's arrives
  const { type } = await sniff(new Blob([req.image]));
  if (type === 'unknown') throw new AiError('wrong-type');
  // Decode before any download: a damaged photo fails at once, not after the model arrives.
  const { pixels, downscaled } = prepareInput(await decode(req.image, type));
  const input = toModelInput(pixels);
  const mask = normaliseMask(await predict(input, req, progress));
  progress('work', 70, 100);
  const alpha = upsampleMask(mask, MODEL_SIZE, MODEL_SIZE, pixels.width, pixels.height);
  kept = { pixels, alpha, downscaled };
  progress('work', 80, 100);
  const png = await encode(composeRGBA(pixels, alpha, 'transparent'));
  progress('work', 100, 100);
  return { png, width: pixels.width, height: pixels.height, downscaled };
}

async function compose(bg: Background): Promise<BgResult> {
  if (!kept) throw new AiError('corrupt'); // this worker was replaced since (a crash): the page starts over
  const { pixels, alpha, downscaled } = kept;
  return { png: await encode(composeRGBA(pixels, alpha, bg)), width: pixels.width, height: pixels.height, downscaled };
}

const OOM = /alloc|\boom\b|enlarge memory|out ?of ?memory|maximum memory size exceeded|array buffer allocation/i;

/** The AiError a failure stands for: decode failures are a damaged photo, memory exhaustion is the device. */
function toAiError(err: unknown): AiError {
  if (err instanceof AiError) return err;
  if (err instanceof CodecLoadError) return new AiError('network');
  for (let e: unknown = err, depth = 0; e instanceof Error && depth < 5; e = e.cause, depth++) {
    const wasm = typeof WebAssembly !== 'undefined' && e instanceof WebAssembly.RuntimeError;
    if ((e instanceof RangeError || wasm) && OOM.test(e.message)) return new AiError('device');
  }
  if (err instanceof DecodeError) return new AiError('corrupt');
  console.error('bg worker: unexpected error', err);
  return new AiError('corrupt');
}

scope.onmessage = async (e) => {
  const { id, req } = e.data;
  const progress: Progress = (stage, done, total) => scope.postMessage({ kind: 'progress', id, stage, done, total });
  try {
    const result = req.op === 'remove' ? await remove(req, progress) : await compose(req.bg);
    scope.postMessage({ kind: 'done', id, result }, [result.png]);
  } catch (raw) {
    const err = toAiError(raw);
    scope.postMessage({
      kind: 'failed',
      id,
      reason: reasonOf(err),
      ...(err.badModel ? { badModel: true } : {}),
      ...(err.detectedType ? { detectedType: err.detectedType } : {}),
    });
  }
};
