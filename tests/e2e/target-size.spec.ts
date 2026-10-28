import { readFileSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';

// The six compress-to-a-size pages: the states a visitor hits, with the exact copy. Runs against `astro build` +
// `astro preview`.

test.beforeEach(({ context }) => context.route('https://cloud.umami.is/**', (r) => r.fulfill({ status: 202, body: '' })));

const fixture = (name: string) => `tests/fixtures/${name}`;
const choose = (page: Page, ...names: string[]) => page.locator('[data-tool] input[type=file]').setInputFiles(names.map(fixture));
const doneRows = (page: Page) => page.locator('[data-rows] > li.row-done');
const kbBox = (page: Page) => page.getByRole('spinbutton', { name: /Target size/ });
async function download(page: Page, trigger: Locator) {
  const [d] = await Promise.all([page.waitForEvent('download'), trigger.click()]);
  return { name: d.suggestedFilename(), bytes: new Uint8Array(readFileSync((await d.path())!)) };
}
const JPEG = [0xff, 0xd8, 0xff];

const PAGES = [
  ['compress-image-to-kb', 'Compress image to KB', null],
  ['compress-image-to-20kb', 'Compress image to 20 KB', 'a JPG of 20 KB or less'],
  ['compress-image-to-50kb', 'Compress image to 50 KB', 'a JPG of 50 KB or less'],
  ['compress-image-to-100kb', 'Compress image to 100 KB', 'a JPG of 100 KB or less'],
  ['compress-image-to-200kb', 'Compress image to 200 KB', 'a JPG of 200 KB or less'],
  ['signature-resize-10-20kb', 'Resize signature to 10–20 KB', 'a JPG between 10 and 20 KB'],
] as const;

for (const [slug, h1, line] of PAGES) {
  test(`${slug}: empty`, async ({ page }) => {
    await page.goto(`/${slug}/`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(h1);
    const noun = slug.startsWith('signature') ? 'signatures' : 'images';
    await expect(page.getByText(`Compressed on your device. Your ${noun} are never uploaded.`)).toBeVisible();
    if (line) {
      await expect(page.locator('.bench-io')).toContainText(line); // the In → Out line says the size
      await expect(page.getByRole('link', { name: 'Need a different size? →' })).toHaveAttribute('href', '/compress-image-to-kb/');
    } else {
      await expect(kbBox(page)).toHaveValue('100');
    }
    await expect(page.locator('[data-quality-input]')).toHaveCount(0); // no quality slider: the size decides
  });
}

test('20 KB: photo.jpg comes out at 20,000 bytes or less, with its size, pixels and quality', async ({ page }) => {
  await page.goto('/compress-image-to-20kb/');
  await choose(page, 'photo.jpg');
  await expect(doneRows(page)).toHaveCount(1);
  await expect(doneRows(page).locator('.size')).toHaveText(/^\d+ KB · \d+ × \d+ px · quality \d+$/);
  await expect(doneRows(page).getByText('Made smaller to fit under 20 KB.')).toBeVisible();
  const { name, bytes } = await download(page, doneRows(page).getByRole('link', { name: 'Download' }));
  expect(name).toBe('photo.jpg');
  expect([...bytes.subarray(0, 3)]).toEqual(JPEG);
  expect(bytes.length).toBeLessThanOrEqual(20_000);
});

test('KB page: a new target re-runs the list, also while it is still working', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  await page.context().route(/mozjpeg_enc-[^/]*\.js$/, async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto('/compress-image-to-kb/');
  await choose(page, 'photo.jpg', 'alpha.png');
  await expect(page.locator('[data-rows] > li')).toHaveCount(2);
  await kbBox(page).fill('30');
  await kbBox(page).press('Enter');
  release();
  await expect(doneRows(page)).toHaveCount(2);
  for (const i of [0, 1]) {
    expect((await download(page, doneRows(page).nth(i).getByRole('link', { name: 'Download' }))).bytes.length).toBeLessThanOrEqual(30_000);
  }
  await expect(page.getByRole('button', { name: 'Compress more' })).toBeVisible();
});

test('KB page: an invalid target keeps the last one', async ({ page }) => {
  await page.goto('/compress-image-to-kb/');
  await kbBox(page).fill('0');
  await kbBox(page).press('Enter');
  await expect(page.getByRole('alert').filter({ hasText: 'Enter a size between 5 and 5000 KB.' })).toBeVisible();
  await expect(kbBox(page)).toHaveValue('100');
});

test('KB page: the smallest target shrinks the image to fit', async ({ page }) => {
  await page.goto('/compress-image-to-kb/');
  await kbBox(page).fill('5');
  await kbBox(page).press('Enter');
  await choose(page, 'photo.jpg');
  await expect(doneRows(page).getByText('Made smaller to fit under 5 KB.')).toBeVisible();
  expect((await download(page, doneRows(page).getByRole('link', { name: 'Download' }))).bytes.length).toBeLessThanOrEqual(5_000);
});

test('KB page: links every size page and the signature page', async ({ page }) => {
  await page.goto('/compress-image-to-kb/');
  for (const slug of ['compress-image-to-20kb', 'compress-image-to-50kb', 'compress-image-to-100kb', 'compress-image-to-200kb', 'signature-resize-10-20kb']) {
    await expect(page.locator(`[data-tool] a[href="/${slug}/"]`)).toHaveCount(1);
  }
});

test('signature: a small clean image is under the minimum, and can still be downloaded', async ({ page }) => {
  await page.goto('/signature-resize-10-20kb/');
  await choose(page, 'grey.png');
  await expect(doneRows(page).getByText(/^This is [\d,]+ bytes, under the 10 KB minimum\. Scan or photograph it larger and try again\.$/)).toBeVisible();
  await expect(doneRows(page).getByRole('link', { name: 'Download' })).toBeVisible();
});

test('wrong type: a PDF says what the page takes', async ({ page }) => {
  await page.goto('/compress-image-to-50kb/');
  await choose(page, 'pdf/three-pages.pdf');
  await expect(page.getByText("This isn't a JPG, PNG, WebP or HEIC image.")).toBeVisible();
});

test('390 px: no sideways scroll on the KB page with results', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/compress-image-to-kb/');
  await choose(page, 'photo.jpg');
  await expect(doneRows(page)).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  expect((await kbBox(page).boundingBox())!.height).toBeGreaterThanOrEqual(44);
});
