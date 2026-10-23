import { zipSync, type Zippable } from 'fflate';

/**
 * Bundle files into one ZIP. Images are already compressed, so they are stored (level 0), not deflated;
 * storing is a plain copy, so the synchronous API is fast and avoids fflate spawning blob: workers.
 */
export async function zipFiles(files: { name: string; blob: Blob }[]): Promise<Blob> {
  const entries: Zippable = {};
  for (const f of files) entries[f.name] = new Uint8Array(await f.blob.arrayBuffer());
  return new Blob([zipSync(entries, { level: 0 }) as BlobPart], { type: 'application/zip' });
}
