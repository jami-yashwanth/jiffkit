import type { Runner } from '../form';
import { toBase64, toHex } from '../lib/md5';

export async function hmac(message: string, key: string, hash: string): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(message)));
}

export const run: Runner = async ({ message, key, algo, encoding }) => {
  if (!message && !key) return {};
  if (!key) return { status: 'Add the secret key to sign the message.' };
  const sig = await hmac(String(message), String(key), String(algo));
  return { out: { hmac: encoding === 'base64' ? toBase64(sig) : toHex(sig) } };
};
