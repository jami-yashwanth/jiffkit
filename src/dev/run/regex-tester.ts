import type { Result, Runner } from '../form';
import { MAX_MATCHES, type MatchResult } from '../lib/regex-match';

export const LIMIT_MS = 1000;
export const TOO_SLOW =
  'This pattern took over a second on this text, so it was stopped. It probably backtracks catastrophically: make a repeated group less ambiguous, for example (a+)+ → a+.';
const BROKEN = 'The regex tester couldn’t start. Reload the page and try again.';

// Only one run is ever in the worker. A new run while one is still going (say, a runaway pattern the user is already
// fixing) ends that worker and starts a fresh one, so the new run never waits behind the old one or inherits its timeout.
let current: { worker: Worker; settle: (r: MatchResult | 'timeout' | 'superseded' | 'broken') => void } | undefined;
const spawn = () => new Worker(new URL('../lib/regex-worker.ts', import.meta.url), { type: 'module' });

function inWorker(pattern: string, flags: string, text: string): Promise<MatchResult | 'timeout' | 'superseded' | 'broken'> {
  if (current) {
    current.worker.terminate();
    current.settle('superseded');
    current = undefined;
  }
  const worker = spawn();
  return new Promise((resolve) => {
    let done = false;
    const settle = (r: MatchResult | 'timeout' | 'superseded' | 'broken') => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (current?.worker === worker) current = undefined;
      if (r !== 'superseded') worker.terminate();
      resolve(r);
    };
    const timer = setTimeout(() => settle('timeout'), LIMIT_MS);
    worker.onmessage = (e: MessageEvent<{ result: MatchResult }>) => settle(e.data.result);
    worker.onerror = () => settle('broken');
    current = { worker, settle };
    worker.postMessage({ id: 0, pattern, flags, text });
  });
}

export const run: Runner = async ({ pattern, flags, text }): Promise<Result> => {
  const p = String(pattern);
  if (!p) return {};
  const r = await inWorker(p, String(flags), String(text));
  if (r === 'superseded') return {}; // a newer run replaced this one; the page ignores stale results anyway
  if (r === 'timeout') return { error: TOO_SLOW };
  if (r === 'broken') return { error: BROKEN };
  if ('error' in r) return { error: r.error };
  if (!String(text)) return { status: 'Paste some text to test the pattern on.' };
  const count = r.capped ? `${MAX_MATCHES.toLocaleString('en')}+ matches (showing the first ${MAX_MATCHES.toLocaleString('en')})` : `${r.count} ${r.count === 1 ? 'match' : 'matches'}`;
  return { out: { highlight: { segments: r.segments }, groups: { rows: r.rows } }, status: `${count}.` };
};
