/** Why an on-device AI job failed. These are also the analytics reasons (`convert_error {tool, reason}`). */
export type AiFail = 'network' | 'cancelled' | 'unsupported' | 'too-large' | 'too-long' | 'corrupt' | 'wrong-type' | 'device' | 'encrypted';

export class AiError extends Error {
  constructor(
    readonly reason: AiFail,
    /** For wrong-type: the type the file really is, when known (a short code such as "heic"). */
    readonly detectedType?: string,
  ) {
    super(reason);
    this.name = 'AiError';
  }
}

/** The reason carried by any thrown value: an AiError's own, or `fallback` for anything else. */
export const reasonOf = (err: unknown, fallback: AiFail = 'corrupt'): AiFail => (err instanceof AiError ? err.reason : fallback);
