import type { Runner } from '../form';
import { md5, toHex } from '../lib/md5';

const SHAS = ['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'] as const;

/** Every hash of `text` (UTF-8), as [name, hex] rows. */
export async function hashes(text: string): Promise<[string, string][]> {
  const bytes = new TextEncoder().encode(text);
  const shas = await Promise.all(SHAS.map(async (a) => toHex(new Uint8Array(await crypto.subtle.digest(a, bytes)))));
  return [['MD5', md5(bytes)], ...SHAS.map((a, i): [string, string] => [a, shas[i]])];
}

export const run: Runner = async ({ text }) => {
  if (!text) return {};
  return { out: { hashes: { rows: await hashes(String(text)) } } };
};
