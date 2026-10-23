const UNITS: [name: string, seconds: number][] = [
  ['minute', 60],
  ['hour', 3600],
  ['day', 86400],
  ['month', 30 * 86400],
  ['year', 365 * 86400],
];

export function relativeTime(target: Date, now: Date): string {
  const diff = (target.getTime() - now.getTime()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return 'just now';

  let idx = 0;
  while (idx + 1 < UNITS.length && abs >= UNITS[idx + 1][1]) idx++;
  // Rounding can reach the next unit ("60 minutes"): promote instead.
  if (idx + 1 < UNITS.length && Math.round(abs / UNITS[idx][1]) * UNITS[idx][1] >= UNITS[idx + 1][1]) idx++;

  if (UNITS[idx][0] === 'month' && Math.round(abs / UNITS[idx][1]) >= 12) idx++; // 364 days is a year, not 12 months

  const [name, size] = UNITS[idx];
  const n = Math.round(abs / size);
  const phrase = `${n} ${name}${n === 1 ? '' : 's'}`;
  return diff > 0 ? `in ${phrase}` : `${phrase} ago`;
}
