import { readFileSync } from 'node:fs';
import { expect, test, type Page, type Route } from '@playwright/test';
import { holdResults, installResultHold, releaseResults } from './pdf-hold';

// Not an assertion suite: captures every spec §5 state for a human design review.
// Output: review/screenshots/<page>-<state>-<width>.png (git-ignored). Chromium only.
// Run: npx playwright test tests/e2e/screenshots.spec.ts --project=chromium

test.skip(({ browserName }) => browserName !== 'chromium', 'screenshots are reviewed in one engine');
test.beforeEach(({ context }) => context.route('https://plausible.io/**', (r) => r.fulfill({ status: 202, body: '' })));

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
];
const fixture = (name: string) => `tests/fixtures/${name}`;
const heic = (file: string, name = file) => ({ name, mimeType: 'image/heic', buffer: readFileSync(fixture(file)) });
const doneRows = (page: Page) => page.locator('[data-rows] > li.row-done');
const LONG_NAME = 'IMG_20261023_142233_holiday_beach_sunset_family_final_v2.heic';

async function choose(page: Page, ...names: string[]) {
  await page.locator('[data-tool] input[type=file]').setInputFiles(names.map(fixture));
}

async function hold(page: Page, pattern: RegExp) {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  await page.context().route(pattern, async (route: Route) => {
    await gate;
    await route.continue();
  });
  return release;
}
const HEIC_CODEC = /libheif-bundle-[^/]*\.js$/;
const pdf = (page: Page, ...names: string[]) =>
  page.locator('[data-kind="pdf"] input[type=file]').setInputFiles(names.map((n) => fixture(`pdf/${n}`)));
const pdfRows = (page: Page) => page.locator('[data-rows] > li');
const btn = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
// The JWT shots pin the clock and zone so "Expires … (in 1 hour)" reads the same on every run.
const NOW = new Date('2026-10-24T12:00:00Z');
const at = (offsetSeconds: number) => Math.floor(NOW.getTime() / 1000) + offsetSeconds;
const b64url = (o: unknown) => Buffer.from(JSON.stringify(o), 'utf8').toString('base64url');
const jwt = (payload: object) => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.c2lnbmF0dXJl`;
const SAMPLE_JSON = JSON.stringify({
  id: 'ord_2041',
  status: 'paid',
  customer: { name: 'Ana Lima', email: 'ana@example.com' },
  items: [
    { sku: 'MUG-01', qty: 2, price: 12.5 },
    { sku: 'TEE-M', qty: 1, price: 24 },
  ],
  total: 49,
  shipped: false,
});

for (const vp of VIEWPORTS) {
  test.describe(`${vp.width}px`, () => {
    test.use({ viewport: vp });
    const shot = async (page: Page, name: string, fullPage = false) => {
      await page.mouse.move(0, 0);
      await page.screenshot({ path: `review/screenshots/${name}-${vp.width}.png`, fullPage, animations: 'disabled' });
    };

    test('home', async ({ page }) => {
      await page.goto('/');
      await shot(page, 'home-grouped', true);
      await page.locator('#filter').fill('pdf');
      await expect(page.locator('.category:not([hidden])')).toHaveCount(1);
      await shot(page, 'home-filtered');
      await page.locator('#filter').fill('gif');
      await expect(page.locator('#no-match')).toBeVisible();
      await shot(page, 'home-no-match');
    });

    test('heic: empty, hover, focus, drag-over, options', async ({ page }) => {
      await page.goto('/heic-to-jpg/');
      await shot(page, 'heic-to-jpg-empty', true);
      await shot(page, 'heic-to-jpg-empty-fold');
      await page.locator('label.btn').hover();
      // Wait out the colour transition, then capture with the pointer still on the button.
      await expect(page.locator('label.btn')).toHaveCSS('background-color', 'rgb(8, 69, 54)');
      await page.screenshot({ path: `review/screenshots/heic-to-jpg-hover-${vp.width}.png` });
      await page.mouse.move(0, 0);
      await page.keyboard.press('Tab'); // nav link
      await page.keyboard.press('Tab'); // file input inside the Choose photos label
      await expect(page.locator('[data-tool] input[type=file]')).toBeFocused();
      await shot(page, 'heic-to-jpg-focus');
      await page.evaluate(() => {
        (document.activeElement as HTMLElement | null)?.blur();
        const dt = new DataTransfer();
        dt.items.add(new File(['x'], 'a.heic'));
        document.dispatchEvent(new DragEvent('dragenter', { bubbles: true, dataTransfer: dt }));
      });
      await expect(page.locator('.drop')).toHaveClass(/is-over/);
      // At 390 the drop zone is a plain button with no drag-over look, so only desktop gets this shot.
      if (vp.width > 600) {
        await expect(page.locator('.drop')).toHaveCSS('background-color', 'rgb(216, 234, 225)');
        await shot(page, 'heic-to-jpg-drag-over');
      }
      await page.reload();
      await page.locator('details.settings summary').click();
      await shot(page, 'heic-to-jpg-options-open');
    });

    test('heic: loading codec', async ({ page }) => {
      const release = await hold(page, HEIC_CODEC);
      await page.goto('/heic-to-jpg/');
      await choose(page, 'rotated-6.heic', 'multi.heic');
      await expect(page.getByText('Getting the converter ready…')).toBeVisible();
      await shot(page, 'heic-to-jpg-loading');
      release();
    });

    test('heic: processing', async ({ page }) => {
      await page.goto('/heic-to-jpg/');
      await choose(page, 'rotated-6.heic'); // warm the codec so the banner stays away
      await expect(doneRows(page)).toHaveCount(1);
      await page.getByRole('button', { name: 'Convert more' }).click();
      await page.locator('[data-tool] input[type=file]').setInputFiles([
        heic('iphone-12mp.heic'),
        heic('multi.heic'),
        heic('rotated-6.heic', LONG_NAME),
        heic('rotated-6.heic'),
      ]);
      await expect(page.locator('[data-status]')).toHaveText(/Converting \d of 4/);
      await shot(page, 'heic-to-jpg-processing');
    });

    test('heic: done, long names, disabled ZIP', async ({ page }) => {
      await page.goto('/heic-to-jpg/');
      await page.locator('[data-tool] input[type=file]').setInputFiles([
        heic('iphone-12mp.heic'),
        heic('rotated-6.heic', LONG_NAME),
        heic('multi.heic'),
      ]);
      await expect(doneRows(page)).toHaveCount(3);
      await shot(page, 'heic-to-jpg-done');
      await page.locator('[data-zip]').evaluate((b: HTMLButtonElement) => (b.disabled = true)); // as while zipping
      await shot(page, 'heic-to-jpg-zip-disabled');
    });

    test('heic: wrong type, corrupt, mixed with done', async ({ page }) => {
      await page.goto('/heic-to-jpg/');
      await choose(page, 'alpha.png');
      await expect(page.getByText('This is a PNG, not a HEIC photo.')).toBeVisible();
      await shot(page, 'heic-to-jpg-wrong-type');
      await page.getByRole('button', { name: 'Convert more' }).click();
      await choose(page, 'truncated.heic');
      await expect(page.getByText("We couldn't read this file.", { exact: false })).toBeVisible();
      await shot(page, 'heic-to-jpg-corrupt');
      await page.getByRole('button', { name: 'Convert more' }).click();
      await choose(page, 'iphone-12mp.heic', 'alpha.png', 'truncated.heic', 'rotated-6.heic');
      await expect(doneRows(page)).toHaveCount(2);
      await expect(page.getByRole('button', { name: 'Convert more' })).toBeVisible();
      await shot(page, 'heic-to-jpg-mixed');
    });

    test('heic: codec load failed', async ({ page }) => {
      await page.context().route(HEIC_CODEC, (route) => route.abort());
      await page.goto('/heic-to-jpg/');
      await choose(page, 'rotated-6.heic');
      await expect(page.getByText("Couldn't load the converter. Check your connection.")).toBeVisible();
      await shot(page, 'heic-to-jpg-codec-failed');
    });

    test('heic: out of memory', async ({ page }) => {
      await page.context().route(/\/worker-[^/]*\.js$/, (route) =>
        route.fulfill({ contentType: 'text/javascript', body: 'self.onmessage = (e) => { self.postMessage({ kind: "progress", id: e.data.job.id, stage: "decoding" }); throw new Error("boom"); };' }),
      );
      await page.goto('/heic-to-jpg/');
      await choose(page, 'rotated-6.heic');
      await expect(page.getByText('Ran out of memory')).toBeVisible();
      await shot(page, 'heic-to-jpg-oom');
    });

    test('compress: slider, too large', async ({ page }) => {
      test.slow(); // decodes a 63 MP JPEG
      await page.goto('/compress-image/');
      await shot(page, 'compress-image-empty', true);
      // No HEIC fixture is over the 50 MP cap, so the too-large row is captured on Compress.
      await choose(page, 'huge-63mp.jpg');
      await expect(page.getByText('This image is too large for your device to convert (63 MP).')).toBeVisible();
      await shot(page, 'compress-image-too-large');
    });

    test('merge-pdf: empty, one file, list, merging, done, encrypted', async ({ page }) => {
      await installResultHold(page);
      await page.goto('/merge-pdf/');
      await shot(page, 'merge-pdf-empty', true);
      await pdf(page, 'three-pages.pdf');
      await expect(pdfRows(page).first()).toContainText('3 pages');
      await expect(page.getByText('Add at least one more PDF to merge.')).toBeVisible();
      await shot(page, 'merge-pdf-one-file');
      await pdf(page, 'two-pages.pdf');
      await expect(pdfRows(page).last()).toContainText('2 pages');
      await expect(btn(page, 'Merge PDFs')).toBeEnabled();
      await shot(page, 'merge-pdf-list');
      await holdResults(page);
      await btn(page, 'Merge PDFs').click();
      await expect(page.getByText('Merging 2 files…')).toBeVisible();
      await shot(page, 'merge-pdf-merging');
      await releaseResults(page);
      await expect(page.getByText(/^5 pages · \d+ KB$/)).toBeVisible();
      await shot(page, 'merge-pdf-done');
      await btn(page, 'Start over').click();
      await pdf(page, 'three-pages.pdf', 'encrypted.pdf', 'two-pages.pdf');
      await expect(pdfRows(page).nth(1)).toContainText('This PDF is password-protected.');
      await expect(pdfRows(page).last()).toContainText('2 pages');
      await shot(page, 'merge-pdf-encrypted');
    });

    test('split-pdf: loaded, invalid range, done every page', async ({ page }) => {
      await installResultHold(page);
      await page.goto('/split-pdf/');
      await pdf(page, 'three-pages.pdf');
      await expect(page.getByText('3 pages', { exact: true })).toBeVisible();
      await shot(page, 'split-pdf-loaded');
      await page.getByLabel('Extract pages:').check();
      await page.getByPlaceholder('1-3, 5').fill('9');
      await btn(page, 'Split PDF').click();
      await expect(page.getByText('Pages must be between 1 and 3, like 1-3, 5.')).toBeVisible();
      await page.mouse.click(0, 0); // drop focus so the shot shows the error, not the ring
      await shot(page, 'split-pdf-invalid-range');
      await page.getByLabel('Every page as a separate file').check();
      await btn(page, 'Split PDF').click();
      await expect(page.getByText('3 files', { exact: true })).toBeVisible();
      await shot(page, 'split-pdf-done-every');
    });

    test('split-pdf: empty, damaged', async ({ page }) => {
      await page.goto('/split-pdf/');
      await shot(page, 'split-pdf-empty', true);
      await pdf(page, 'not-a.pdf');
      await expect(page.getByText("We couldn't read this file. It may be damaged or not a PDF.")).toBeVisible();
      await shot(page, 'split-pdf-damaged');
    });

    test('merge-pdf: codec load failed', async ({ page }) => {
      await page.context().route(/\/_astro\/pdf-lib-[^/]*\.js$/, (route) => route.abort());
      await page.goto('/merge-pdf/');
      await pdf(page, 'three-pages.pdf', 'two-pages.pdf');
      await expect(page.getByText("Couldn't load the PDF tools. Check your connection.")).toBeVisible();
      await expect(page.getByText('Reading…')).toHaveCount(0);
      await shot(page, 'merge-pdf-codec-failed');
    });

    test('json-formatter: empty, formatted, invalid', async ({ page }) => {
      await page.goto('/json-formatter/');
      await shot(page, 'json-formatter-empty', true);
      await page.getByLabel('JSON', { exact: true }).fill(SAMPLE_JSON);
      await btn(page, 'Format').click();
      await expect(page.locator('pre[data-results]')).toContainText('"shipped": false');
      await shot(page, 'json-formatter-formatted');
      await page.getByLabel('JSON', { exact: true }).fill('{\n  "id": "ord_2041",\n  "total": 49\n  "shipped": false\n}');
      await btn(page, 'Format').click();
      await expect(page.locator('[data-status]')).toHaveText(/^Invalid JSON at line 4/);
      await page.locator('#json-in').blur();
      await shot(page, 'json-formatter-invalid');
    });

    test('base64: filled, invalid', async ({ page }) => {
      await page.goto('/base64-encode-decode/');
      await page.getByLabel('Text', { exact: true }).fill('Hello, world! Héllo 👋');
      await expect(page.getByLabel('Base64', { exact: true })).not.toHaveValue('');
      await page.getByLabel('Text', { exact: true }).blur();
      await shot(page, 'base64-encode-decode-filled');
      await page.getByLabel('Base64', { exact: true }).fill('SGVsbG8sIHdvcmxk!!');
      await expect(page.getByText("This isn't valid Base64.")).toBeVisible();
      await page.getByLabel('Base64', { exact: true }).blur();
      await shot(page, 'base64-encode-decode-invalid');
    });

    test.describe('jwt', () => {
      test.use({ timezoneId: 'UTC' });
      test('jwt-decoder: decoded, expired, malformed', async ({ page }) => {
        await page.clock.setFixedTime(NOW);
        await page.goto('/jwt-decoder/');
        const input = page.getByLabel('Token');
        await input.fill(jwt({ sub: '42', name: 'Ana Lima', role: 'admin', iat: at(-3600), nbf: at(-3600), exp: at(3600) }));
        await expect(page.getByText('Expires 24 Oct 2026, 13:00 (in 1 hour)')).toBeVisible();
        await input.blur();
        await shot(page, 'jwt-decoder-decoded');
        await input.fill(jwt({ sub: '42', iat: at(-90000), exp: at(-7200) }));
        await expect(page.getByText('Expired 2 hours ago', { exact: true })).toBeVisible();
        await input.blur();
        await shot(page, 'jwt-decoder-expired');
        await input.fill('not.a-jwt');
        await expect(page.getByText("This doesn't look like a JWT.", { exact: false })).toBeVisible();
        await input.blur();
        await shot(page, 'jwt-decoder-malformed');
      });
    });

    test('qr-code-generator: empty, filled, too long', async ({ page }) => {
      await page.goto('/qr-code-generator/');
      await shot(page, 'qr-code-generator-empty', true);
      const input = page.getByLabel('Text or URL');
      await input.fill('https://example.com/menu');
      await expect(page.locator('.qr-preview.has-code')).toBeVisible();
      await expect(btn(page, 'Download PNG')).toBeEnabled();
      await input.blur();
      await shot(page, 'qr-code-generator-filled');
      await input.fill('a'.repeat(3000));
      await expect(page.locator('[data-status]')).toHaveText(/^Too much text for a QR code/);
      await input.blur();
      await shot(page, 'qr-code-generator-too-long');
    });

    test('webp: toggle', async ({ page }) => {
      await page.goto('/webp-to-jpg/');
      await shot(page, 'webp-to-jpg-empty', true);
    });
  });
}
