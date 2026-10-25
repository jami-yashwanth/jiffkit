import type { Runner } from '../form';
import { relativeTime } from '../../text/relative-time';

/** A date from a Unix timestamp (up to 11 integer digits = seconds, more = milliseconds) or a date string. */
export function parseMoment(input: string): Date | undefined {
  const s = input.trim();
  if (/^-?\d+(\.\d+)?$/.test(s)) {
    const digits = s.replace(/^-/, '').split('.')[0].length;
    const n = Number(s);
    const d = new Date(digits <= 11 ? n * 1000 : n);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }
  const t = Date.parse(s);
  return Number.isNaN(t) ? undefined : new Date(t);
}

export function formats(d: Date, now: Date): [string, string][] {
  const ms = d.getTime();
  return [
    ['Unix seconds', String(Math.floor(ms / 1000))],
    ['Unix milliseconds', String(ms)],
    ['ISO 8601 (UTC)', d.toISOString()],
    ['UTC', d.toUTCString()],
    ['Your time zone', d.toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'long' })],
    ['Relative', relativeTime(d, now)],
  ];
}

export const run: Runner = ({ input }, changed) => {
  const now = new Date();
  if (changed === '$button') {
    const s = String(Math.floor(now.getTime() / 1000));
    return { set: { input: s }, out: { formats: { rows: formats(new Date(Number(s) * 1000), now) } } };
  }
  const s = String(input).trim();
  const d = s ? parseMoment(s) : now;
  if (!d) return { error: 'Can’t read that. Try a timestamp like 1735689600 or a date like 2025-01-01T00:00:00Z.' };
  return { out: { formats: { rows: formats(d, now) } }, status: s ? '' : 'Showing the current time.' };
};
