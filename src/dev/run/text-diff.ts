import { diffLines } from 'diff';
import type { Runner } from '../form';

type Line = { op: '+' | '-' | ' '; text: string };

/** End a non-empty text with one line break, so "three" and "three\n" are the same last line. */
const terminated = (s: string) => (s === '' || s.endsWith('\n') ? s : `${s}\n`);

export function diff(a: string, b: string, ignoreWhitespace: boolean): Line[] {
  const lines: Line[] = [];
  for (const part of diffLines(terminated(a), terminated(b), { ignoreWhitespace })) {
    const op = part.added ? '+' : part.removed ? '-' : ' ';
    const text = part.value.endsWith('\n') ? part.value.slice(0, -1) : part.value;
    for (const l of text.split('\n')) lines.push({ op, text: l });
  }
  return lines;
}

export const run: Runner = ({ a, b, ws }) => {
  const [x, y] = [String(a), String(b)];
  if (!x && !y) return {};
  const lines = diff(x, y, !!ws);
  const added = lines.filter((l) => l.op === '+').length;
  const removed = lines.filter((l) => l.op === '-').length;
  if (!added && !removed) return { status: 'No differences.' };
  const n = (k: number, w: string) => `${k} ${k === 1 ? 'line' : 'lines'} ${w}`;
  return { out: { diff: { lines } }, status: `${n(added, 'added')}, ${n(removed, 'removed')}.` };
};
