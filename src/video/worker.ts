import type { AiWorkerRequest, AiWorkerResponse } from '../ai/client';
import { AiError, reasonOf } from '../ai/errors';
import { compressVideo, type CompressOptions, type Compressed } from './compress';
import { checkDecodable, demux } from './demux';
import { checkLimits } from './limits';

// The video worker: one job at a time (protocol: ../ai/client.ts). `probe` reads a file's boxes and says whether it
// can be compressed at all (its length, and whether this browser decodes its picture); `compress` makes the MP4.

export interface Probed {
  durationS: number;
  width: number;
  height: number;
}

export type VideoRequest = { op: 'probe'; file: File } | ({ op: 'compress'; file: File } & CompressOptions);
export type VideoResult = Probed | Compressed;

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<AiWorkerRequest<VideoRequest>>) => void) | null;
  postMessage(message: AiWorkerResponse<VideoResult>, transfer?: Transferable[]): void;
};

async function probe(file: File): Promise<Probed> {
  const d = await demux(file);
  const limit = checkLimits({ durationS: d.durationS, bytes: file.size });
  if (limit !== 'ok') throw new AiError(limit);
  await checkDecodable(d.video);
  const { width, height } = d.video;
  // Shown as the picture plays: a phone's portrait video is stored landscape, turned a quarter.
  const turned = d.video.rotation === 90 || d.video.rotation === 270;
  return { durationS: d.durationS, width: turned ? height : width, height: turned ? width : height };
}

/** The AiError a failure stands for. Anything unexpected is shown as a damaged file, and logged. */
function toAiError(err: unknown): AiError {
  if (err instanceof AiError) return err;
  console.error('video worker: unexpected error', err);
  return new AiError('corrupt');
}

scope.onmessage = async (e) => {
  const { id, req } = e.data;
  try {
    const result =
      req.op === 'probe'
        ? await probe(req.file)
        : await compressVideo(req.file, { preset: req.preset, resolution: req.resolution }, (done, total) =>
            scope.postMessage({ kind: 'progress', id, stage: 'work', done, total }),
          );
    scope.postMessage({ kind: 'done', id, result }, 'mp4' in result ? [result.mp4] : []);
  } catch (raw) {
    const err = toAiError(raw);
    scope.postMessage({ kind: 'failed', id, reason: reasonOf(err), ...(err.detectedType ? { detectedType: err.detectedType } : {}) });
  }
};
