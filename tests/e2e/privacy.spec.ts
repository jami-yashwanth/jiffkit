import { readFileSync } from 'node:fs';
import { expect, test, type Page, type Request } from '@playwright/test';
import { stubPlausible, PLAUSIBLE_STUB, type PlausibleEvent } from './plausible';
import { modelBytes, routeModels } from './models';

// The privacy promise, checked on the wire: during a real 3-file conversion plus a ZIP download, nothing
// leaves the device except same-origin GETs for our own assets and Plausible's tiny event beacons.
// The build has PUBLIC_PLAUSIBLE_DOMAIN set (see playwright.config.ts).

const FILES = ['rotated-6.heic', 'multi.heic', 'iphone-12mp.heic'];
const head64 = (name: string) => readFileSync(`tests/fixtures/${name}`).subarray(0, 64);

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
  // ...and no URL does either (query strings and paths are a leak channel too).
  for (const r of requests) {
    if (r.url.startsWith('blob:') || r.url.startsWith('data:')) continue;
    const url = Buffer.from(r.url);
    for (const needle of needles) expect(url.includes(needle), `${r.url} url`).toBe(false);
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

// ---------------------------------------------------------------------------------------------------
// Round 2: the PDF, text and QR pages. Same promise, plus the analytics contract for each.

interface Seen {
  method: string;
  url: string;
  body: Buffer | null;
  origin: string;
}

const pdf = (name: string) => `tests/fixtures/pdf/${name}`;
const pdfHead = (name: string) => readFileSync(pdf(name)).subarray(0, 64);
const b64url = (o: unknown) => Buffer.from(JSON.stringify(o), 'utf8').toString('base64url');
const SAMPLE_JWT = `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ sub: 'jwt-needle-42', name: 'Ada' })}.c2lnbmF0dXJl`;
const JSON_TEXT = '{"secret":"s3cr3t-json"}';
const QR_TEXT = 'qr-needle-123';
const B64_TEXT = 'b64-needle-789';

/** Watch a page: every request it makes, and every Plausible event it posts. */
async function watch(page: Page) {
  const events = await stubPlausible(page.context());
  const requests: Seen[] = [];
  page.context().on('request', (r: Request) => {
    requests.push({ method: r.method(), url: r.url(), body: r.postDataBuffer(), origin: new URL(r.url()).origin });
  });
  return { events, requests };
}

// The model host (PUBLIC_MODEL_BASE_URL in playwright.config.ts). In the E2E build it is this server's /test-models/.
const isModel = (url: string) => new URL(url).pathname.startsWith('/test-models/');

/** Nothing but same-origin GETs, model-host GETs and plausible.io; no URL or body carries any needle. */
function expectClean(requests: Seen[], needles: Buffer[], baseURL: string | undefined) {
  const base = new URL(baseURL ?? 'http://localhost:4399');
  expect(requests.length).toBeGreaterThan(0);
  for (const r of requests) {
    if (r.url.startsWith('blob:') || r.url.startsWith('data:')) continue; // never leaves the browser
    if (r.origin !== 'https://plausible.io') {
      expect(r.origin, r.url).toBe(base.origin);
      expect(r.method, r.url).toBe('GET'); // the model host too: GET only, never a body
      if (isModel(r.url)) expect(r.body, r.url).toBeNull();
    }
    const url = Buffer.from(decodeURIComponent(r.url));
    for (const needle of needles) {
      expect(url.includes(needle), `${r.url} url`).toBe(false);
      if (r.body) expect(r.body.includes(needle), `${r.url} body`).toBe(false);
    }
  }
}

/** Plausible sees only known event names, and props limited to tool, count and reason. */
function expectOnlyAllowedProps(events: PlausibleEvent[]) {
  for (const e of events) {
    expect(['convert_success', 'convert_error', 'tool_used']).toContain(e.n);
    for (const key of Object.keys(e.p)) expect(['tool', 'count', 'reason']).toContain(key);
  }
}

const settle = (page: Page) => page.waitForTimeout(500); // room for a stray event

test.describe('PDF tools', () => {
  const needles = [Buffer.from('three-pages'), Buffer.from(pdfHead('three-pages.pdf')), Buffer.from(pdfHead('two-pages.pdf'))];

  test('merge: one convert_success {merge-pdf, count: 1}, nothing else leaves the device', async ({ page }, info) => {
    const { events, requests } = await watch(page);
    await page.goto('/merge-pdf/');
    await page.locator('[data-kind="pdf"] input[type=file]').setInputFiles([pdf('three-pages.pdf'), pdf('two-pages.pdf')]);
    await expect(page.locator('[data-rows] > li').last()).toContainText('2 pages');
    await page.getByRole('button', { name: 'Merge PDFs', exact: true }).click();
    await expect(page.getByText('merged.pdf', { exact: true })).toBeVisible();
    await expect.poll(() => events.length).toBe(1);
    await settle(page);
    expect(events.map((e) => [e.n, e.p])).toEqual([['convert_success', { tool: 'merge-pdf', count: 1 }]]);
    expect(requests.some((r) => /pdf-lib/.test(r.url))).toBe(true); // the engine really loaded: the check isn't vacuous
    expectOnlyAllowedProps(events);
    expectClean(requests, needles, info.project.use.baseURL);
  });

  test('split every page of a 3-page PDF: convert_success {split-pdf, count: 3}', async ({ page }, info) => {
    const { events, requests } = await watch(page);
    await page.goto('/split-pdf/');
    await page.locator('[data-kind="pdf"] input[type=file]').setInputFiles(pdf('three-pages.pdf'));
    await expect(page.getByText('3 pages', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Split PDF', exact: true }).click();
    await expect(page.getByText('3 files', { exact: true })).toBeVisible();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Download all (ZIP)' }).click()]);
    await download.path();
    await expect.poll(() => events.length).toBe(1);
    await settle(page);
    expect(events.map((e) => [e.n, e.p])).toEqual([['convert_success', { tool: 'split-pdf', count: 3 }]]);
    expectOnlyAllowedProps(events);
    expectClean(requests, needles, info.project.use.baseURL);
  });

  test('an encrypted PDF in Merge: convert_error {merge-pdf, encrypted}', async ({ page }, info) => {
    const { events, requests } = await watch(page);
    await page.goto('/merge-pdf/');
    await page.locator('[data-kind="pdf"] input[type=file]').setInputFiles([pdf('three-pages.pdf'), pdf('encrypted.pdf')]);
    await expect(page.locator('[data-rows] > li').last()).toContainText('password-protected');
    await expect.poll(() => events.length).toBe(1);
    await settle(page);
    expect(events.map((e) => [e.n, e.p])).toEqual([['convert_error', { tool: 'merge-pdf', reason: 'encrypted' }]]);
    expectOnlyAllowedProps(events);
    expectClean(requests, [...needles, Buffer.from('encrypted.pdf'), Buffer.from(pdfHead('encrypted.pdf'))], info.project.use.baseURL);
  });

  test('an invalid page range in Split: convert_error {split-pdf, range}', async ({ page }, info) => {
    const { events, requests } = await watch(page);
    await page.goto('/split-pdf/');
    await page.locator('[data-kind="pdf"] input[type=file]').setInputFiles(pdf('three-pages.pdf'));
    await expect(page.getByText('3 pages', { exact: true })).toBeVisible();
    await page.getByLabel('Extract pages:').check();
    await page.getByLabel('Pages to extract').fill('9');
    await page.getByRole('button', { name: 'Split PDF', exact: true }).click();
    await expect(page.getByText('Pages must be between 1 and 3, like 1-3, 5.')).toBeVisible();
    await expect.poll(() => events.length).toBe(1);
    await settle(page);
    expect(events.map((e) => [e.n, e.p])).toEqual([['convert_error', { tool: 'split-pdf', reason: 'range' }]]);
    expectOnlyAllowedProps(events);
    expectClean(requests, needles, info.project.use.baseURL);
  });
});

test.describe('PDF image tools', () => {
  const needles = [Buffer.from('three-pages'), Buffer.from(pdfHead('three-pages.pdf'))];

  test('pdf to jpg: one convert_success {pdf-to-jpg, count: 3}, nothing else leaves the device', async ({ page }, info) => {
    const { events, requests } = await watch(page);
    await page.goto('/pdf-to-jpg/');
    await page.locator('[data-kind="pdf"] input[type=file]').setInputFiles(pdf('three-pages.pdf'));
    await expect(page.getByText('3 pages', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Convert', exact: true }).click();
    await expect(page.getByText('3 files', { exact: true })).toBeVisible();
    await expect.poll(() => events.length).toBe(1);
    await settle(page);
    expect(events.map((e) => [e.n, e.p])).toEqual([['convert_success', { tool: 'pdf-to-jpg', count: 3 }]]);
    expect(requests.some((r) => /pdf\.worker/.test(r.url))).toBe(true); // pdf.js really loaded: the check isn't vacuous
    expectOnlyAllowedProps(events);
    expectClean(requests, needles, info.project.use.baseURL);
  });

  test('jpg to pdf: one convert_success {jpg-to-pdf, count: 1}, nothing else leaves the device', async ({ page }, info) => {
    const { events, requests } = await watch(page);
    await page.goto('/jpg-to-pdf/');
    await page.locator('[data-kind="pdf"] input[type=file]').setInputFiles(['tests/fixtures/photo.jpg', 'tests/fixtures/alpha.png']);
    await expect(page.locator('[data-rows] > li').last()).toContainText('200 × 150 px');
    await page.getByRole('button', { name: 'Create PDF', exact: true }).click();
    await expect(page.getByText('images.pdf', { exact: true })).toBeVisible();
    await expect.poll(() => events.length).toBe(1);
    await settle(page);
    expect(events.map((e) => [e.n, e.p])).toEqual([['convert_success', { tool: 'jpg-to-pdf', count: 1 }]]);
    expectOnlyAllowedProps(events);
    expectClean(requests, [Buffer.from('photo.jpg'), Buffer.from('alpha.png')], info.project.use.baseURL);
  });

  test('an encrypted PDF in PDF to JPG: convert_error {pdf-to-jpg, encrypted}', async ({ page }, info) => {
    const { events, requests } = await watch(page);
    await page.goto('/pdf-to-jpg/');
    await page.locator('[data-kind="pdf"] input[type=file]').setInputFiles(pdf('encrypted.pdf'));
    await expect(page.getByText('This PDF is password-protected. Remove the password and try again.')).toBeVisible();
    await expect.poll(() => events.length).toBe(1);
    await settle(page);
    expect(events.map((e) => [e.n, e.p])).toEqual([['convert_error', { tool: 'pdf-to-jpg', reason: 'encrypted' }]]);
    expectOnlyAllowedProps(events);
    expectClean(requests, [...needles, Buffer.from('encrypted.pdf')], info.project.use.baseURL);
  });
});

test.describe('text and QR tools: tool_used once, on the first Copy or Download', () => {
  test.beforeEach(({ context, browserName }) => {
    if (browserName === 'chromium') return context.grantPermissions(['clipboard-read', 'clipboard-write']);
  });
  const copy = (page: Page) => page.getByRole('button', { name: 'Copy', exact: true }).first();

  const cases: { path: string; tool: string; type: (page: Page) => Promise<void>; needles: string[] }[] = [
    {
      path: '/json-formatter/',
      tool: 'json-formatter',
      needles: [JSON_TEXT, 's3cr3t-json'],
      type: async (page) => {
        await page.locator('[data-input]').fill(JSON_TEXT);
        await page.getByRole('button', { name: 'Format', exact: true }).click();
        await expect(page.locator('[data-results]')).toContainText('s3cr3t-json');
      },
    },
    {
      path: '/base64-encode-decode/',
      tool: 'base64-encode-decode',
      needles: [B64_TEXT, Buffer.from(B64_TEXT).toString('base64')],
      type: async (page) => {
        await page.locator('[data-text]').fill(B64_TEXT);
        await expect(page.locator('[data-base64]')).toHaveValue(Buffer.from(B64_TEXT).toString('base64'));
      },
    },
    {
      path: '/jwt-decoder/',
      tool: 'jwt-decoder',
      needles: [SAMPLE_JWT, 'jwt-needle-42'],
      type: async (page) => {
        await page.locator('[data-input]').fill(SAMPLE_JWT);
        await expect(page.locator('[data-payload]')).toContainText('jwt-needle-42');
      },
    },
  ];

  for (const c of cases) {
    test(`${c.tool}: typing fires nothing, the first Copy fires one tool_used, a second fires nothing`, async ({ page }, info) => {
      const { events, requests } = await watch(page);
      await page.goto(c.path);
      await c.type(page);
      await settle(page);
      expect(events).toEqual([]); // typing, formatting, decoding: never an event
      await copy(page).click();
      await expect.poll(() => events.length).toBe(1);
      await copy(page).click();
      await expect(page.locator('.copied').first()).toHaveText('Copied');
      await settle(page);
      expect(events.map((e) => [e.n, e.p])).toEqual([['tool_used', { tool: c.tool }]]);
      expectOnlyAllowedProps(events);
      expectClean(requests, c.needles.map((n) => Buffer.from(n)), info.project.use.baseURL);
    });
  }

  test('qr-code-generator: typing fires nothing, the first Download fires one tool_used, a second fires nothing', async ({ page }, info) => {
    const { events, requests } = await watch(page);
    await page.goto('/qr-code-generator/');
    await page.locator('[data-input]').fill(QR_TEXT);
    await expect(page.locator('[data-results] svg')).toBeVisible();
    await settle(page);
    expect(events).toEqual([]);
    const png = page.getByRole('button', { name: 'Download PNG' });
    const [d1] = await Promise.all([page.waitForEvent('download'), png.click()]);
    await d1.path();
    await expect.poll(() => events.length).toBe(1);
    const [d2] = await Promise.all([page.waitForEvent('download'), png.click()]);
    await d2.path();
    await settle(page);
    expect(events.map((e) => [e.n, e.p])).toEqual([['tool_used', { tool: 'qr-code-generator' }]]);
    expectOnlyAllowedProps(events);
    expectClean(requests, [Buffer.from(QR_TEXT)], info.project.use.baseURL); // the code is drawn locally
  });
});

test.describe('AI tools', () => {
  test('remove background (stub inference): only the model download leaves the page, as a bare GET', async ({ page }, info) => {
    const { requests } = await watch(page);
    await page.goto('/remove-background/');
    const models = await routeModels(page, await modelBytes(page));
    await page.locator('[data-kind="ai"] input[type=file]').setInputFiles('tests/fixtures/photo.jpg');
    await page.getByRole('button', { name: 'Download and start' }).click();
    await expect(page.getByText(/__AI_STUB__ result/)).toBeVisible();
    await settle(page);
    expect(models.requests).toBe(1);
    const model = requests.filter((r) => isModel(r.url));
    expect(model).toHaveLength(1); // the check isn't vacuous
    expect(model[0]!.url).not.toContain('?'); // no query string at all
    expectClean(requests, [Buffer.from('photo.jpg'), Buffer.from(head64('photo.jpg'))], info.project.use.baseURL);
  });
});
