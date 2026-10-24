import { createAiEngine, type AiProgress } from '../ai/client';
import type { Compressed, CompressOptions } from './compress';
import type { Probed, VideoRequest, VideoResult } from './worker';

export type { Compressed, CompressOptions, Probed };

// One worker for the page, started with the first video. The AI tools' client runs it: one job at a time, a worker
// that dies is replaced for the next job, and Cancel (the signal) terminates it mid-job. Rejects with AiError.
const engine = createAiEngine<VideoRequest, VideoResult>(() => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }));

export const probeVideo = (file: File, signal?: AbortSignal): Promise<Probed> =>
  engine.run({ op: 'probe', file }, [], undefined, signal) as Promise<Probed>;

export const compressVideo = (
  file: File,
  opts: CompressOptions,
  onProgress: (p: AiProgress) => void,
  signal?: AbortSignal,
): Promise<Compressed> => engine.run({ op: 'compress', file, ...opts }, [], onProgress, signal) as Promise<Compressed>;
