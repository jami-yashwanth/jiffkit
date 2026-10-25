import type { Runner } from '../form';
import { toHex } from '../lib/md5';

const format = (h: string) => `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;

/** RFC 9562 v4: 122 random bits. */
export function uuidV4(): string {
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  return format(toHex(b));
}

/** RFC 9562 v7: 48-bit Unix milliseconds, version 7, then random bits (variant 10). */
export function uuidV7(ms = Date.now()): string {
  const b = crypto.getRandomValues(new Uint8Array(16));
  for (let i = 0; i < 6; i++) b[i] = Math.floor(ms / 2 ** (8 * (5 - i))) & 0xff;
  b[6] = (b[6] & 0x0f) | 0x70;
  b[8] = (b[8] & 0x3f) | 0x80;
  return format(toHex(b));
}

export const run: Runner = ({ version, count }) => {
  const n = Number(count);
  if (!Number.isInteger(n) || n < 1 || n > 100) return { error: 'Choose between 1 and 100.' };
  const make = version === '7' ? () => uuidV7() : uuidV4;
  const list = Array.from({ length: n }, make);
  // v7s made in the same millisecond differ only in their random bits: sort so the batch is in order, as v7 promises.
  if (version === '7') list.sort();
  return { out: { uuids: list.join('\n') } };
};
