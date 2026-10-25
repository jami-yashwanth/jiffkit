import { runRegex } from './regex-match';

// One regex run per message. The page terminates this worker if a run takes over a second.
self.onmessage = (e: MessageEvent<{ id: number; pattern: string; flags: string; text: string }>) => {
  const { id, pattern, flags, text } = e.data;
  self.postMessage({ id, result: runRegex(pattern, flags, text) });
};
