import { CodecLoadError, load } from '../../engine/codecs';
import { DecodeError, decode, type Pixels } from '../../engine/decode';
import { downscaleTo, flattenOnWhite } from '../../engine/pixels';
import { sniff } from '../../engine/sniff';
import type { AiWorkerRequest, AiWorkerResponse } from '../client';
import { MODELS, modelUrl, type ModelKey } from '../config';
import { AiError, reasonOf } from '../errors';
import { evictModel, isCached, loadModel } from '../loader';
import { MODEL_SIZE, composeRGBA, normaliseMask, prepareInput, toModelInput, upsampleMask, type Background } from './compose';
import { createSession } from './session';

// The Remove background worker. A `remove` job decodes the photo (upright, at most 25 MP), runs u2netp on it with
// onnxruntime-web's WebAssembly backend, and answers with a transparent PNG and a small preview of the photo. The
// photo and the model's 320² mask stay here, so a `compose` job can put the cut-out on another background without
// running the model again. Protocol: ../client.ts.

export type BgRequest = { op: 'remove'; image: ArrayBuffer } | { op: 'compose'; bg: Background };

export interface BgResult {
  png: ArrayBuffer;
  /** `remove` only: the upright photo, long edge at most PREVIEW_EDGE, as a JPEG (the "before" of the comparison). */
  preview?: ArrayBuffer;
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
const PREVIEW_EDGE = 2048;
const PREVIEW_QUALITY = 85;

// --- the runtime and the model session, kept for the next photo ---

type Ort = typeof import('onnxruntime-web');
type Session = import('onnxruntime-web').InferenceSession;
let runtime: { ort: Ort; session: Session } | null = null;
/** Stub builds load the files but never start the runtime: this records that they are in. */
let stubLoaded = false;

/**
 * The runtime's .wasm and the model, through our loader (Cache Storage, progress). Their download is reported as
 * one: done and total count only the files not yet cached, as the page does.
 */
async function loadFiles(progress: Progress): Promise<{ wasm: ArrayBuffer; model: ArrayBuffer }> {
  const keys: ModelKey[] = ['ortWasm', 'bg'];
  const cached = await Promise.all(keys.map((k) => isCached(modelUrl(k))));
  const total = keys.reduce((n, k, i) => n + (cached[i] ? 0 : MODELS[k].bytes), 0);
  let before = 0;
  const load1 = async (k: ModelKey, i: number) => {
    const bytes = await loadModel(modelUrl(k), {
      bytes: MODELS[k].bytes,
      onProgress: (done) => {
        if (!cached[i]) progress('download', Math.min(total, before + done), total);
      },
    });
    if (!cached[i]) before += MODELS[k].bytes;
    return bytes;
  };
  const wasm = await load1('ortWasm', 0);
  const model = await load1('bg', 1);
  return { wasm, model };
}

/** Start onnxruntime on its WebAssembly backend. Its script ships with the site; the .wasm comes from loadFiles. */
async function startRuntime(wasm: ArrayBuffer, model: ArrayBuffer): Promise<{ ort: Ort; session: Session }> {
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

/** The model's mask for this input (MODEL_SIZE², 0..1 after normalising). Downloads the files on first use. */
async function predict(input: Float32Array, progress: Progress): Promise<Float32Array> {
  if (!runtime && !stubLoaded) {
    const { wasm, model } = await loadFiles(progress);
    if (import.meta.env.PUBLIC_AI_STUB === '1') {
      const { isStubBadModel } = await import('../stub');
      if (isStubBadModel(model)) throw new AiError('network', { badModel: true });
      stubLoaded = true;
    } else {
      progress('work', 0, 100);
      runtime = await startRuntime(wasm, model);
    }
  }
  progress('work', 20, 100);
  if (import.meta.env.PUBLIC_AI_STUB === '1') {
    const { stubBgMask } = await import('../stub');
    return stubBgMask(MODEL_SIZE);
  }
  const { ort, session } = runtime!;
  const feeds = { [session.inputNames[0]!]: new ort.Tensor('float32', input, [1, 3, MODEL_SIZE, MODEL_SIZE]) };
  const out = await session.run(feeds);
  const mask = new Float32Array(out[session.outputNames[0]!]!.data as Float32Array);
  for (const t of Object.values(out)) t.dispose();
  return mask;
}

// --- the photo and its 320² mask, kept for compose jobs ---

let kept: { pixels: Pixels; mask: Float32Array; downscaled: boolean } | null = null;

const own = (bytes: Uint8Array): ArrayBuffer =>
  bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength ? (bytes.buffer as ArrayBuffer) : (bytes.slice().buffer as ArrayBuffer);

/** The cut-out on `bg`, as a PNG. The mask is brought to full size only for as long as this takes. */
async function encodeCutout(bg: Background): Promise<ArrayBuffer> {
  const { pixels, mask } = kept!;
  const alpha = upsampleMask(mask, MODEL_SIZE, MODEL_SIZE, pixels.width, pixels.height);
  const out = composeRGBA(pixels, alpha, bg);
  return own((await load.oxipng()).optimise_raw(out.data, out.width, out.height, PNG_LEVEL, false, false));
}

/** The "before" image: the upright photo, at most PREVIEW_EDGE on its long edge, flattened onto white, as a JPEG. */
async function encodePreview(p: Pixels): Promise<ArrayBuffer> {
  const long = Math.max(p.width, p.height);
  const small = long > PREVIEW_EDGE ? downscaleTo(p, (p.width * p.height * (PREVIEW_EDGE / long) ** 2) / 1e6) : p;
  // flattenOnWhite works in place: never on the pixels kept for compose.
  const flat = p.hasAlpha ? flattenOnWhite(small === p ? { ...p, data: p.data.slice() } : small) : small;
  const image = { data: flat.data, width: flat.width, height: flat.height };
  return own((await load.jpegEnc()).encode(image, PREVIEW_QUALITY));
}

async function remove(req: Extract<BgRequest, { op: 'remove' }>, progress: Progress): Promise<BgResult> {
  kept = null; // the last photo's memory goes before this one's arrives
  const { type } = await sniff(new Blob([req.image]));
  if (type === 'unknown') throw new AiError('wrong-type');
  // Decode before any download: a damaged photo fails at once, not after the model arrives.
  const { pixels, downscaled } = prepareInput(await decode(req.image, type));
  const mask = normaliseMask(await predict(toModelInput(pixels), progress));
  kept = { pixels, mask, downscaled };
  progress('work', 70, 100);
  const png = await encodeCutout('transparent');
  progress('work', 90, 100);
  const preview = await encodePreview(pixels);
  progress('work', 100, 100);
  return { png, preview, width: pixels.width, height: pixels.height, downscaled };
}

async function compose(bg: Background): Promise<BgResult> {
  if (!kept) throw new AiError('device'); // this worker was replaced since (it ran out of memory or crashed)
  const { pixels, downscaled } = kept;
  return { png: await encodeCutout(bg), width: pixels.width, height: pixels.height, downscaled };
}

const OOM = /alloc|\boom\b|enlarge memory|out ?of ?memory|maximum memory size exceeded|array buffer allocation/i;

/** The AiError a failure stands for: decode failures are a damaged photo, memory exhaustion is the device. */
function toAiError(err: unknown, op: BgRequest['op']): AiError {
  if (err instanceof AiError) return err;
  if (err instanceof CodecLoadError) return new AiError('network');
  for (let e: unknown = err, depth = 0; e instanceof Error && depth < 5; e = e.cause, depth++) {
    const wasm = typeof WebAssembly !== 'undefined' && e instanceof WebAssembly.RuntimeError;
    if ((e instanceof RangeError || wasm) && OOM.test(e.message)) return new AiError('device');
  }
  if (err instanceof DecodeError) return new AiError('corrupt');
  console.error('bg worker: unexpected error', err);
  // Re-composing a photo that was already read: what fails there is the PNG build, so memory.
  return new AiError(op === 'compose' ? 'device' : 'corrupt');
}

scope.onmessage = async (e) => {
  const { id, req } = e.data;
  const progress: Progress = (stage, done, total) => scope.postMessage({ kind: 'progress', id, stage, done, total });
  try {
    const result = req.op === 'remove' ? await remove(req, progress) : await compose(req.bg);
    scope.postMessage({ kind: 'done', id, result }, result.preview ? [result.png, result.preview] : [result.png]);
  } catch (raw) {
    const err = toAiError(raw, req.op);
    scope.postMessage({
      kind: 'failed',
      id,
      reason: reasonOf(err),
      ...(err.badModel ? { badModel: true } : {}),
      ...(err.detectedType ? { detectedType: err.detectedType } : {}),
    });
  }
};
