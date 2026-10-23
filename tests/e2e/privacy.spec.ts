import { readFileSync } from 'node:fs';
import { expect, test, type Request } from '@playwright/test';

// The privacy promise, checked on the wire: during a real 3-file conversion plus a ZIP download, nothing
// leaves the device except same-origin GETs for our own assets and Plausible's tiny event beacons.
// The build has PUBLIC_PLAUSIBLE_DOMAIN set (see playwright.config.ts).

const FILES = ['rotated-6.heic', 'multi.heic', 'iphone-12mp.heic'];
const head64 = (name: string) => readFileSync(`tests/fixtures/${name}`).subarray(0, 64);

// Stand-in for plausible.io's script: replays the page's queued calls and posts events the way the real one does.
const PLAUSIBLE_STUB = `
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

test('a 3-file HEIC batch and ZIP send nothing but pages, our assets and two Plausible events', async ({ page }) => {
  const requests: { method: string; url: string; body: Buffer | null; origin: string }[] = [];
  const events: { n: string; p: Record<string, unknown> }[] = [];
  const base = new URL(test.info().project.use.baseURL ?? 'http://localhost:4399');

  await page.context().route('https://plausible.io/**', async (route) => {
    const req = route.request();
    if (req.url().endsWith('.js')) {
      return route.fulfill({ status: 200, contentType: 'text/javascript', body: PLAUSIBLE_STUB });
    }
    events.push(JSON.parse(req.postData() ?? '{}'));
    await route.fulfill({ status: 202, body: 'ok' });
  });
  page.context().on('request', (r: Request) => {
    requests.push({ method: r.method(), url: r.url(), body: r.postDataBuffer(), origin: new URL(r.url()).origin });
  });

  await page.goto('/heic-to-jpg/');
  await page.locator('[data-tool] input[type=file]').setInputFiles(FILES.map((n) => `tests/fixtures/${n}`));
  await expect(page.locator('[data-rows] > li.row-done')).toHaveCount(3);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download all (ZIP)' }).click(),
  ]);
  await download.path();
  await expect.poll(() => events.length).toBeGreaterThan(0);
  await page.waitForTimeout(500); // room for a stray second event

  // Every request is a same-origin GET, or goes to plausible.io (its script, then event POSTs).
  expect(requests.length).toBeGreaterThan(0);
  for (const r of requests) {
    if (r.origin === 'https://plausible.io') continue;
    if (r.url.startsWith('blob:') || r.url.startsWith('data:')) continue; // never leaves the browser
    expect(r.origin, r.url).toBe(base.origin);
    expect(r.method, r.url).toBe('GET');
  }
  expect(requests.some((r) => /libheif/.test(r.url))).toBe(true); // the codec really loaded: the check isn't vacuous

  // No body anywhere carries a file name or the first bytes of a fixture.
  const needles = [Buffer.from('IMG_'), ...FILES.map((n) => Buffer.from(head64(n)))];
  for (const r of requests) {
    if (!r.body) continue;
    for (const needle of needles) expect(r.body.includes(needle), `${r.url} body`).toBe(false);
  }
  expect(events.length).toBeGreaterThan(0);

  // Plausible sees only the tool, a count, or a reason.
  for (const e of events) {
    expect(['convert_success', 'convert_error']).toContain(e.n);
    for (const key of Object.keys(e.p)) expect(['tool', 'count', 'reason']).toContain(key);
  }
  const successes = events.filter((e) => e.n === 'convert_success');
  expect(successes).toHaveLength(1);
  expect(successes[0]!.p).toEqual({ tool: 'heic-to-jpg', count: 3 });
  expect(events.filter((e) => e.n === 'convert_error')).toEqual([]);
});

test('a wrong-type file fires convert_error with only tool and reason', async ({ page }) => {
  const events: { n: string; p: Record<string, unknown> }[] = [];
  await page.context().route('https://plausible.io/**', async (route) => {
    const req = route.request();
    if (req.url().endsWith('.js')) return route.fulfill({ status: 200, contentType: 'text/javascript', body: PLAUSIBLE_STUB });
    events.push(JSON.parse(req.postData() ?? '{}'));
    await route.fulfill({ status: 202, body: 'ok' });
  });
  await page.goto('/heic-to-jpg/');
  await page.locator('[data-tool] input[type=file]').setInputFiles(['tests/fixtures/photo.jpg', 'tests/fixtures/rotated-6.heic']);
  await expect(page.locator('[data-rows] > li.row-done')).toHaveCount(1);
  await expect.poll(() => events.length).toBe(2);
  expect(events.map((e) => [e.n, e.p])).toEqual(
    expect.arrayContaining([
      ['convert_error', { tool: 'heic-to-jpg', reason: 'wrong-type' }],
      ['convert_success', { tool: 'heic-to-jpg', count: 1 }],
    ]),
  );
});
