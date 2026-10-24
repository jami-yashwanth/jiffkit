import { AiError } from '../errors';

// Creating the onnxruntime session for Remove background, and what its failures mean. Kept apart from the worker
// so the mapping can be tested with a stand-in runtime.

type Ort = typeof import('onnxruntime-web');
type Session = import('onnxruntime-web').InferenceSession;

/**
 * onnxruntime's own codes for a model it could not read: 2 INVALID_ARGUMENT, 4 NO_MODEL, 7 INVALID_PROTOBUF,
 * 10 INVALID_GRAPH (its errors read "Can't create a session. ERROR_CODE: 7, ERROR_MESSAGE: Failed to load model
 * because protobuf parsing failed.").
 */
const MODEL_UNREADABLE = /ERROR_CODE: (?:2|4|7|10)\b|protobuf parsing failed|invalid (?:model|graph)/i;

/** An ONNX file is a protobuf whose first field is ir_version (tag 0x08). Anything else is not a model. */
export const looksLikeOnnx = (model: ArrayBuffer): boolean => model.byteLength > 1024 && new Uint8Array(model, 0, 1)[0] === 0x08;

/**
 * What a failure to create the session means. Only a model the runtime could not parse is a bad model (dropped
 * from the cache and downloaded again). Everything else is the runtime failing to start on this device: no usable
 * backend, a WebAssembly module that won't compile or instantiate, or memory running out.
 */
export function sessionFailure(err: unknown): AiError {
  if (err instanceof AiError) return err;
  const message = err instanceof Error ? err.message : String(err);
  if (MODEL_UNREADABLE.test(message)) return new AiError('network', { badModel: true });
  return new AiError('device');
}

/** A session on the WebAssembly backend. Rejects with AiError: network + badModel, or device. */
export async function createSession(ort: Pick<Ort, 'InferenceSession'>, model: ArrayBuffer): Promise<Session> {
  if (!looksLikeOnnx(model)) throw new AiError('network', { badModel: true });
  try {
    return await ort.InferenceSession.create(new Uint8Array(model), { executionProviders: ['wasm'] });
  } catch (err) {
    throw sessionFailure(err);
  }
}
