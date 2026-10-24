import type { BrowserContext } from '@playwright/test';

export interface PlausibleEvent {
  n: string;
  p: Record<string, unknown>;
}

// Stand-in for plausible.io's script: replays the page's queued calls and posts events the way the real one does.
export const PLAUSIBLE_STUB = `
  (function () {
    function send(name, opts) {
      fetch('https://plausible.io/api/event', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ n: name, u: location.href, d: 'tools.test', p: (opts && opts.props) || {} }),
      });
    }
    var q = (window.plausible && window.plausible.q) || [];
    window.plausible = send;
    q.forEach(function (a) { send.apply(null, a); });
  })();`;

/** Stub plausible.io for a context; the returned array fills with every event the pages post. */
export async function stubPlausible(context: BrowserContext): Promise<PlausibleEvent[]> {
  const events: PlausibleEvent[] = [];
  await context.route('https://plausible.io/**', async (route) => {
    const req = route.request();
    if (req.url().endsWith('.js')) return route.fulfill({ status: 200, contentType: 'text/javascript', body: PLAUSIBLE_STUB });
    events.push(JSON.parse(req.postData() ?? '{}'));
    await route.fulfill({ status: 202, body: 'ok' });
  });
  return events;
}
