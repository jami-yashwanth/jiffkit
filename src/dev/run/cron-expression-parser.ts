import cronstrue from 'cronstrue';
import type { Result, Runner } from '../form';
import { ALIASES, nextRuns, parseCron } from '../lib/cron';

const when = (d: Date) => d.toLocaleString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export const run: Runner = ({ expr }): Result => {
  const s = String(expr).trim();
  if (!s) return {};
  if (s.toLowerCase() === '@reboot') return { out: { meaning: 'At system startup.' }, status: 'Runs once each time the system starts, so it has no fixed run times.' };
  const cron = parseCron(s);
  if ('error' in cron) return { error: cron.error };
  const meaning = cronstrue.toString(ALIASES[s.toLowerCase()] ?? s, { use24HourTimeFormat: true, verbose: false });
  const runs = nextRuns(cron, new Date(), 5);
  return {
    out: { meaning: `${meaning}.`.replace(/\.\.$/, '.'), next: { rows: runs.map((d, i): [string, string] => [`${i + 1}`, when(d)]) } },
    status: runs.length ? '' : 'This schedule never comes round: no date matches it in the next few years.',
  };
};
