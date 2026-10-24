// Where the AI models are downloaded from. Every model URL is `${MODEL_BASE}/<path>`; this is the one place the
// default is set. For launch the owner points PUBLIC_MODEL_BASE_URL at their own bucket holding the same paths.
const DEFAULT_MODEL_BASE = 'https://huggingface.co';

export const MODEL_BASE: string = (import.meta.env.PUBLIC_MODEL_BASE_URL || DEFAULT_MODEL_BASE).replace(/\/+$/, '');

export type ModelKey = 'bg' | 'bgSmall' | 'ortWebgpu' | 'upscale' | 'whisper' | 'tessdata';

/**
 * Each model's path under MODEL_BASE, its download size in bytes (shown before the first download) and its licence.
 * Paths and sizes are provisional until the task that ships each model checks the exact file and its licence.
 */
export const MODELS: Record<ModelKey, { path: string; bytes: number; licence: string; sameOrigin?: true }> = {
  // U²-Net general (Qin et al., Apache-2.0): rembg's ONNX export of the authors' u2net.pth, byte for byte (md5
  // 60024c5c889badc19c04ad937298a77b, the checksum rembg pins), as redistributed by BritishWerewolf/U-2-Net (Apache-2.0),
  // pinned to commit c08042b. sha256 8d10d2f3bb75ae3b6d527c77944fc5e7dcd94b29809d47a739a7a728a912b491. Verified in Task 5.
  bg: {
    path: 'BritishWerewolf/U-2-Net/resolve/c08042b462485d8597c89d3ce831d00be8582c5c/onnx/model.onnx',
    bytes: 175_997_641,
    licence: 'Apache-2.0',
  },
  // u2netp, for phones and low-memory devices: rembg's export (md5 8e83ca70e441ab06c318d82300c84806), from
  // BritishWerewolf/U-2-Netp (Apache-2.0) at commit 7112208. sha256 309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8.
  bgSmall: {
    path: 'BritishWerewolf/U-2-Netp/resolve/7112208dbac3a3642496c8d54e2f0f9bb3dc1dc8/onnx/model.onnx',
    bytes: 4_574_861,
    licence: 'Apache-2.0',
  },
  // onnxruntime-web's WebGPU runtime (MIT), 1.30.0, unchanged. At 26.8 MB it is over the 25 MB per-file cap of the
  // site's host, so it is read from MODEL_BASE, not shipped in dist; where MODEL_BASE doesn't hold it (the default),
  // Remove background runs on the WebAssembly runtime that ships with the site. Not a model: never asked about.
  ortWebgpu: { path: 'onnxruntime-web/1.30.0/ort-wasm-simd-threaded.asyncify.wasm', bytes: 26_781_914, licence: 'MIT' },
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
