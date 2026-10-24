// Where the AI models are downloaded from. Every model URL is `${MODEL_BASE}/<path>`; this is the one place the
// default is set. For launch the owner points PUBLIC_MODEL_BASE_URL at their own bucket holding the same paths.
const DEFAULT_MODEL_BASE = 'https://huggingface.co';

export const MODEL_BASE: string = (import.meta.env.PUBLIC_MODEL_BASE_URL || DEFAULT_MODEL_BASE).replace(/\/+$/, '');

export type ModelKey = 'bg' | 'bgSmall' | 'upscale' | 'whisper' | 'tessdata';

/**
 * Each model's path under MODEL_BASE, its download size in bytes (shown before the first download) and its licence.
 * Paths and sizes are provisional until the task that ships each model checks the exact file and its licence.
 */
export const MODELS: Record<ModelKey, { path: string; bytes: number; licence: string; sameOrigin?: true }> = {
  // U²-Net general. Verified in Task 5.
  bg: { path: 'tomjackson2023/rembg/resolve/main/u2net.onnx', bytes: 45_000_000, licence: 'Apache-2.0' },
  // u2netp, for phones and low-memory devices. Verified in Task 5.
  bgSmall: { path: 'tomjackson2023/rembg/resolve/main/u2netp.onnx', bytes: 4_600_000, licence: 'Apache-2.0' },
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
