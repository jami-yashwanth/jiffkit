import type { BrowserContext, Request } from '@playwright/test';

/** One analytics event as the tests see it: its name and its props. */
export interface AnalyticsEvent {
  n: string;
  p: Record<string, unknown>;
}

export const ANALYTICS_ORIGIN = 'https://cloud.umami.is';

// Stand-in for Umami's script: posts events the way the real one does (to /api/send, as {type, payload}). It sends no
// page views, so the tests count only the events the tools send.
export const ANALYTICS_STUB = `
  (function () {
    window.umami = {
      track: function (name, data) {
        fetch('${ANALYTICS_ORIGIN}/api/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'event', payload: { website: 'test-site', url: location.pathname, name: name, data: data || {} } }),
        });
      },
    };
  })();`;

/** The event an /api/send request carries. */
export const eventOf = (req: Request): AnalyticsEvent => {
  const { payload } = JSON.parse(req.postData() ?? '{}');
  return { n: payload?.name, p: payload?.data ?? {} };
};

/** Stub Umami for a context; the returned array fills with every event the pages post. */
export async function stubAnalytics(context: BrowserContext): Promise<AnalyticsEvent[]> {
  const events: AnalyticsEvent[] = [];
  await context.route(`${ANALYTICS_ORIGIN}/**`, async (route) => {
    const req = route.request();
    if (req.url().endsWith('.js')) return route.fulfill({ status: 200, contentType: 'text/javascript', body: ANALYTICS_STUB });
    events.push(eventOf(req));
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  return events;
}
