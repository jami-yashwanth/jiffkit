import type { Result, Runner } from '../form';
import { MAX_MATCHES, type MatchResult } from '../lib/regex-match';

export const LIMIT_MS = 1000;
export const TOO_SLOW =
  'This pattern took over a second on this text, so it was stopped. It probably backtracks catastrophically: make a repeated group less ambiguous, for example (a+)+ → a+.';

let worker: Worker | undefined;
let nextId = 0;
const spawn = () => new Worker(new URL('../lib/regex-worker.ts', import.meta.url), { type: 'module' });

/** Run in the worker; past the limit, terminate it (the next run gets a fresh one). */
function inWorker(pattern: string, flags: string, text: string): Promise<MatchResult | 'timeout'> {
  worker ??= spawn();
  const w = worker;
  const id = ++nextId;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      w.terminate();
      if (worker === w) worker = undefined;
      resolve('timeout');
    }, LIMIT_MS);
    const onMessage = (e: MessageEvent<{ id: number; result: MatchResult }>) => {
      if (e.data.id !== id) return;
      clearTimeout(timer);
      w.removeEventListener('message', onMessage);
      resolve(e.data.result);
    };
    w.addEventListener('message', onMessage);
    w.postMessage({ id, pattern, flags, text });
  });
}

export const run: Runner = async ({ pattern, flags, text }): Promise<Result> => {
  const p = String(pattern);
  if (!p) return {};
  const r = await inWorker(p, String(flags), String(text));
  if (r === 'timeout') return { error: TOO_SLOW };
  if ('error' in r) return { error: r.error };
  if (!String(text)) return { status: 'Paste some text to test the pattern on.' };
  const count = r.capped ? `${MAX_MATCHES.toLocaleString('en')}+ matches (showing the first ${MAX_MATCHES.toLocaleString('en')})` : `${r.count} ${r.count === 1 ? 'match' : 'matches'}`;
  return { out: { highlight: { segments: r.segments }, groups: { rows: r.rows } }, status: `${count}.` };
};
