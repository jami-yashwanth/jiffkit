import bcrypt from 'bcryptjs';
import type { Runner } from '../form';

export const BCRYPT = /^\$2[abxy]\$(\d{2})\$[./A-Za-z0-9]{53}$/;

export const run: Runner = async ({ password, cost, hash }) => {
  const pw = String(password);
  if (!pw) return { error: 'Type a password first.' };
  const rounds = Math.min(14, Math.max(4, Number(cost) || 10));
  const check = String(hash).trim();
  if (check && !BCRYPT.test(check)) return { error: 'That is not a bcrypt hash. It should look like $2b$10$ followed by 53 characters.' };
  const [result, matches] = await Promise.all([bcrypt.hash(pw, rounds), check ? bcrypt.compare(pw, check) : Promise.resolve(undefined)]);
  const long = new TextEncoder().encode(pw).length > 72 ? ' Only the first 72 bytes of the password count.' : '';
  const verdict = matches === undefined ? '' : matches ? 'Matches: this password fits the hash you pasted.' : 'Does not match the hash you pasted.';
  return { out: { result }, status: `${verdict}${long}`.trim() };
};
