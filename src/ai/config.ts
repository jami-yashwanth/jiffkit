import ORT_WASM_URL from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';

// Where the AI models are downloaded from. Every model URL is `${MODEL_BASE}/<path>`; this is the one place the
// default is set. For launch the owner points PUBLIC_MODEL_BASE_URL at their own bucket holding the same paths.
const DEFAULT_MODEL_BASE = 'https://huggingface.co';

export const MODEL_BASE: string = (import.meta.env.PUBLIC_MODEL_BASE_URL || DEFAULT_MODEL_BASE).replace(/\/+$/, '');

export type ModelKey = 'bg' | 'ortWasm' | 'upscale' | 'whisper' | 'tessdata';

/**
 * Each model's path under MODEL_BASE, its download size in bytes (shown before the first download) and its licence.
 * Paths and sizes are provisional until the task that ships each model checks the exact file and its licence.
 */
export const MODELS: Record<ModelKey, { path: string; bytes: number; licence: string; sameOrigin?: true }> = {
  // u2netp, U²-Net's small model (Qin et al., Apache-2.0), for everyone: rembg's ONNX export of the authors' weights,
  // byte for byte (md5 8e83ca70e441ab06c318d82300c84806, the checksum rembg pins), as redistributed by
  // BritishWerewolf/U-2-Netp (Apache-2.0), pinned to commit 7112208.
  // sha256 309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8. Verified in Task 5. (Full U²-Net is
  // 176 MB: too large a first download for this tool; ruled out in Task 5.)
  bg: {
    path: 'BritishWerewolf/U-2-Netp/resolve/7112208dbac3a3642496c8d54e2f0f9bb3dc1dc8/onnx/model.onnx',
    bytes: 4_574_861,
    licence: 'Apache-2.0',
  },
  // onnxruntime-web's WebAssembly runtime (MIT), the .wasm Remove background runs the model with. It ships with the
  // site (14 MB, under the host's 25 MB file cap) and is downloaded and cached like a model, so its first download
  // is shown and counted with the model's.
  ortWasm: { path: ORT_WASM_URL.replace(/^\/+/, ''), bytes: 14_239_897, licence: 'MIT', sameOrigin: true },
  // realesr-general-x4v3. Verified in Task 6.
  upscale: { path: 'xinntao/Real-ESRGAN/resolve/main/realesr-general-x4v3.onnx', bytes: 4_900_000, licence: 'BSD-3-Clause' },
  // Whisper base, quantised (a directory of files). Verified in Task 7.
  whisper: { path: 'onnx-community/whisper-base/resolve/main', bytes: 80_000_000, licence: 'MIT' },
  // tessdata_fast `eng` 4.1.0, gzipped (its sha256 is on /licenses/). At 2 MB it ships with the site, from
  // public/models/tessdata/ (a .bin name, so no server adds Content-Encoding: gzip and unpacks it in transit), so it is the one model not read from MODEL_BASE. Verified in Task 4.
  tessdata: { path: 'models/tessdata/eng-fast.traineddata.gz.bin', bytes: 1_967_599, licence: 'Apache-2.0', sameOrigin: true },
};

export const modelUrl = (key: ModelKey): string => {
  const { path, sameOrigin } = MODELS[key];
  // Absolute, because Cache Storage keys are. (No location outside a browser: unit tests, where the path stands.)
  return sameOrigin ? `${globalThis.location?.origin ?? ''}/${path}` : `${MODEL_BASE}/${path}`;
};

/** Models above this size ask before their first download (spec §4). */
export const CONSENT_BYTES = 20_000_000;

/** Whole megabytes, as the AI states show sizes: "45 MB". */
export const megabytes = (bytes: number): string => `${Math.round(bytes / 1e6)} MB`;
