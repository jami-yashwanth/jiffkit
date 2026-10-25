// Standard 5-field cron (minute hour day-of-month month day-of-week): parsing and the next run times. Day of month and
// day of week combine as in Vixie cron: if both are restricted, either one matching is enough.

export const ALIASES: Record<string, string> = {
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
  '@monthly': '0 0 1 * *',
  '@weekly': '0 0 * * 0',
  '@daily': '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@hourly': '0 * * * *',
};
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const FIELDS = [
  { name: 'minute', min: 0, max: 59 },
  { name: 'hour', min: 0, max: 23 },
  { name: 'day of month', min: 1, max: 31 },
  { name: 'month', min: 1, max: 12, names: MONTHS, base: 1 },
  { name: 'day of week', min: 0, max: 7, names: DAYS, base: 0 },
];

export type Cron = { sets: Set<number>[]; domAll: boolean; dowAll: boolean };

function field(src: string, f: (typeof FIELDS)[number]): Set<number> | string {
  const out = new Set<number>();
  const value = (t: string) => {
    const i = f.names?.indexOf(t.toLowerCase()) ?? -1;
    if (i >= 0) return i + (f.base ?? 0);
    return /^\d+$/.test(t) ? Number(t) : NaN;
  };
  for (const part of src.split(',')) {
    const m = /^(\*|[a-z0-9]+(?:-[a-z0-9]+)?)(?:\/(\d+))?$/i.exec(part);
    if (!m) return `“${part}” is not a valid ${f.name}.`;
    const step = m[2] === undefined ? 1 : Number(m[2]);
    let lo = f.min, hi = f.max;
    if (m[1] !== '*') {
      const [a, b] = m[1].split('-');
      lo = value(a);
      hi = b === undefined ? (m[2] === undefined ? lo : f.max) : value(b);
    }
    if ([lo, hi].some(Number.isNaN) || lo < f.min || hi > f.max || lo > hi || step < 1) return `“${part}” is out of range for the ${f.name} (${f.min}–${f.max}).`;
    for (let v = lo; v <= hi; v += step) out.add(f.name === 'day of week' && v === 7 ? 0 : v);
  }
  return out;
}

export function parseCron(expr: string): Cron | { error: string } {
  const src = ALIASES[expr.trim().toLowerCase()] ?? expr.trim();
  const parts = src.split(/\s+/);
  if (parts.length !== 5) return { error: `A cron expression has 5 fields (minute hour day month weekday); this one has ${parts.length}.` };
  const sets: Set<number>[] = [];
  for (const [i, p] of parts.entries()) {
    const s = field(p, FIELDS[i]);
    if (typeof s === 'string') return { error: s };
    sets.push(s);
  }
  // As in Vixie cron, a day field starting with * (also */2) counts as unrestricted when combining the two.
  return { sets, domAll: parts[2].startsWith('*'), dowAll: parts[4].startsWith('*') };
}

/** The next `n` run times after `from`, in the device's local time. Fewer if the schedule never comes round. */
export function nextRuns({ sets: [min, hour, dom, mon, dow], domAll, dowAll }: Cron, from: Date, n: number): Date[] {
  const runs: Date[] = [];
  const d = new Date(from);
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() + 1);
  const dayOk = () => {
    const a = dom.has(d.getDate()), b = dow.has(d.getDay());
    return domAll || dowAll ? a && b : a || b; // a field starting with * holds every day it allows, so AND is exact
  };
  for (let guard = 0; runs.length < n && guard < 200_000; guard++) {
    if (!mon.has(d.getMonth() + 1)) {
      d.setMonth(d.getMonth() + 1, 1);
      d.setHours(0, 0, 0, 0);
    } else if (!dayOk()) {
      d.setDate(d.getDate() + 1);
      d.setHours(0, 0, 0, 0);
    } else if (!hour.has(d.getHours())) d.setHours(d.getHours() + 1, 0, 0, 0);
    else if (!min.has(d.getMinutes())) d.setMinutes(d.getMinutes() + 1, 0, 0);
    else {
      runs.push(new Date(d));
      d.setMinutes(d.getMinutes() + 1, 0, 0);
    }
  }
  return runs;
}
