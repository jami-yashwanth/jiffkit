import { AiError } from './errors';

// Models download once and live in Cache Storage. An entry is written only after the whole body has arrived, so a
// cancelled or broken download never leaves a half model behind. Without Cache Storage the model still downloads.

const CACHE_NAME = 'models-v1';

async function openCache(): Promise<Cache | null> {
  try {
    return typeof caches === 'undefined' || !caches ? null : await caches.open(CACHE_NAME);
  } catch {
    return null; // storage blocked (some private modes)
  }
}

async function cached(url: string): Promise<Response | undefined> {
  const cache = await openCache();
  try {
    return (await cache?.match(url)) ?? undefined;
  } catch {
    return undefined;
  }
}

/** Is this model already in the cache (so it needs no download, and no consent)? */
export async function isCached(url: string): Promise<boolean> {
  return (await cached(url)) !== undefined;
}

export interface LoadOptions {
  /** The expected size, used for progress when the response has no Content-Length. */
  bytes: number;
  onProgress?(done: number, total: number): void;
  signal?: AbortSignal;
}

/** The model's bytes, from the cache or else downloaded (and then cached). Rejects with AiError network | cancelled. */
export async function loadModel(url: string, { bytes, onProgress, signal }: LoadOptions): Promise<ArrayBuffer> {
  const cancelled = () => new AiError('cancelled');
  if (signal?.aborted) throw cancelled();

  const hit = await cached(url);
  if (hit) {
    try {
      const buf = await hit.arrayBuffer();
      onProgress?.(buf.byteLength, buf.byteLength);
      return buf;
    } catch {
      // an unreadable entry: download it again
    }
  }

  if (signal?.aborted) throw cancelled();
  let res: Response;
  try {
    // GET only, no credentials: the model host never learns anything about the user or their file.
    res = await fetch(url, { signal, credentials: 'omit' });
  } catch {
    throw signal?.aborted ? cancelled() : new AiError('network');
  }
  // A missing model (404) or a server error: to the user it is a download that failed.
  if (!res.ok || !res.body) throw new AiError('network');

  const total = Number(res.headers.get('content-length')) || bytes;
  const chunks: Uint8Array[] = [];
  let done = 0;
  const reader = res.body.getReader();
  try {
    onProgress?.(0, total);
    for (;;) {
      const { done: end, value } = await reader.read();
      if (end) break;
      if (signal?.aborted) throw cancelled();
      chunks.push(value);
      done += value.byteLength;
      onProgress?.(done, Math.max(total, done));
    }
  } catch (err) {
    void reader.cancel().catch(() => {});
    if (signal?.aborted || (err instanceof AiError && err.reason === 'cancelled')) throw cancelled();
    throw new AiError('network'); // the connection broke off mid-download
  }

  const out = new Uint8Array(done);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  const cache = await openCache();
  try {
    // `new Response(bytes)` copies them, so the caller may transfer the returned buffer to a worker.
    await cache?.put(url, new Response(out, { headers: { 'Content-Type': 'application/octet-stream' } }));
  } catch {
    // quota or storage blocked: the model works, it just downloads again next time
  }
  return out.buffer;
}
