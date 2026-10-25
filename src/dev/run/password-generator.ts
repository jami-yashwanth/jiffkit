import type { Runner } from '../form';
import { randomInt, shuffle } from '../lib/random';

export const SETS = {
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  lower: 'abcdefghijklmnopqrstuvwxyz',
  digits: '0123456789',
  symbols: '!@#$%^&*()-_=+[]{};:,.?/~',
};
export const LOOK_ALIKE = /[Il1O0o|]/g;

/** A password with at least one character from each chosen set, the rest drawn from all of them, then shuffled. */
export function generate(length: number, sets: string[]): string {
  const pool = sets.join('');
  const chars = sets.map((s) => s[randomInt(s.length)]);
  while (chars.length < length) chars.push(pool[randomInt(pool.length)]);
  return shuffle(chars).join('');
}

export const run: Runner = ({ length, upper, lower, digits, symbols, similar }) => {
  const n = Math.min(64, Math.max(8, Number(length) || 20));
  const sets = (Object.keys(SETS) as (keyof typeof SETS)[])
    .filter((k) => ({ upper, lower, digits, symbols })[k])
    .map((k) => (similar ? SETS[k].replace(LOOK_ALIKE, '') : SETS[k]));
  if (!sets.length) return { error: 'Choose at least one kind of character.' };
  const pool = sets.join('').length;
  const bits = Math.floor(n * Math.log2(pool));
  return { out: { password: generate(n, sets) }, status: `About ${bits} bits of entropy.` };
};
