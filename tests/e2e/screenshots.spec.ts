import { readFileSync } from 'node:fs';
import { expect, test, type Page, type Route } from '@playwright/test';

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

for (const vp of VIEWPORTS) {
  test.describe(`${vp.width}px`, () => {
    test.use({ viewport: vp });
    const shot = async (page: Page, name: string, fullPage = false) => {
      await page.mouse.move(0, 0);
      await page.screenshot({ path: `review/screenshots/${name}-${vp.width}.png`, fullPage, animations: 'disabled' });
    };

    test('home', async ({ page }) => {
      await page.goto('/');
      await shot(page, 'home-empty', true);
      await page.locator('#filter').fill('webp');
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
        route.fulfill({ contentType: 'text/javascript', body: 'self.onmessage = () => { throw new Error("boom"); };' }),
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

    test('webp: toggle', async ({ page }) => {
      await page.goto('/webp-to-jpg/');
      await shot(page, 'webp-to-jpg-empty', true);
    });
  });
}
