import type { AiFail } from '../ai/errors';

type Props = Record<string, string | number>;

/**
 * Umami events. Props are only ever {tool, count} or {tool, reason}, or {tool} for tool_used:
 * never a file name, size, type or any pasted/typed content. Before Umami's script has loaded, events wait in the
 * queue Base.astro sets up (and flushes once it loads); a build without analytics has neither, so this does nothing.
 */
export function track(name: 'convert_success' | 'convert_error' | 'tool_used', props: Props): void {
  const w = window as { umami?: { track(n: string, data: Props): void }; umamiQ?: [string, Props][] };
  if (w.umami) w.umami.track(name, props);
  else w.umamiQ?.push([name, props]);
}

/**
 * Report an island's finished jobs and failures (Cancel included, as `cancelled`). Call it right after the island mounts,
 * before any interaction. The reasons are the AiFail union (src/ai/errors.ts): no island-specific reason gets through.
 */
export function trackHooks(
  tool: string,
  hooks: { onSuccess(cb: (count: number) => void): void; onError(cb: (reason: AiFail) => void): void },
): void {
  hooks.onSuccess((count) => track('convert_success', { tool, count }));
  hooks.onError((reason) => track('convert_error', { tool, reason }));
}
