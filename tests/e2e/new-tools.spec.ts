import { readFileSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { sniff } from '../../src/engine/sniff';

// PNG to JPG, JPG to PNG, Resize image, Rotate PDF, PNG to PDF and Image to PDF: the states a visitor hits, with the
// exact copy. Runs against `astro build` + `astro preview`.

test.beforeEach(({ context }) => context.route('https://cloud.umami.is/**', (r) => r.fulfill({ status: 202, body: '' })));

const fixture = (name: string) => `tests/fixtures/${name}`;
const chooseImages = (page: Page, ...names: string[]) => page.locator('[data-tool] input[type=file]').setInputFiles(names.map(fixture));
const choosePdf = (page: Page, ...names: string[]) =>
  page.locator('[data-kind="pdf"] input[type=file]').setInputFiles(names.map((n) => fixture(n.endsWith('.pdf') ? `pdf/${n}` : n)));
const doneRows = (page: Page) => page.locator('[data-rows] > li.row-done');
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

async function downloadFrom(page: Page, trigger: Locator) {
  const [download] = await Promise.all([page.waitForEvent('download'), trigger.click()]);
  return { name: download.suggestedFilename(), bytes: new Uint8Array(readFileSync((await download.path())!)) };
}
const head = (b: Uint8Array, n: number) => [...b.subarray(0, n)];
const JPEG = [0xff, 0xd8, 0xff];
const PNG = [0x89, 0x50, 0x4e, 0x47];
const dims = async (b: Uint8Array) => {
  const s = await sniff(new File([b as BlobPart], 'x'));
  return [s.width, s.height];
};

test.describe('PNG to JPG', () => {
  test.beforeEach(({ page }) => page.goto('/png-to-jpg/'));

  test('empty: PNG copy, and quality under Options', async ({ page }) => {
    await expect(page.getByText('Drop PNG images here')).toBeVisible();
    await expect(page.getByText('Converted on your device. Your images are never uploaded.')).toBeVisible();
    await page.getByText('Options', { exact: true }).click();
    await expect(page.locator('[data-quality-input]')).toHaveValue('85');
  });

  test('done: a JPG, with the location note', async ({ page }) => {
    await chooseImages(page, 'alpha.png');
    await expect(doneRows(page).locator('.name')).toHaveText('alpha.jpg');
    await expect(page.locator('[data-results]').getByText('Location data removed')).toBeVisible();
    const { name, bytes } = await downloadFrom(page, doneRows(page).getByRole('link', { name: 'Download' }));
    expect(name).toBe('alpha.jpg');
    expect(head(bytes, 3)).toEqual(JPEG);
  });

  test('a JPG is the wrong type and is sent to the tool that takes it', async ({ page }) => {
    await chooseImages(page, 'photo.jpg');
    await expect(page.getByText('This is a JPG, not a PNG image.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Try Compress image →' })).toHaveAttribute('href', '/compress-image/');
  });
});

test.describe('JPG to PNG', () => {
  test.beforeEach(({ page }) => page.goto('/jpg-to-png/'));

  test('empty: JPG copy and no settings', async ({ page }) => {
    await expect(page.getByText('Drop JPG images here')).toBeVisible();
    await expect(page.locator('[data-settings]')).toHaveCount(0);
  });

  test('done: a PNG of the same size', async ({ page }) => {
    await chooseImages(page, 'photo.jpg');
    await expect(doneRows(page).locator('.name')).toHaveText('photo.png');
    const { bytes } = await downloadFrom(page, doneRows(page).getByRole('link', { name: 'Download' }));
    expect(head(bytes, 4)).toEqual(PNG);
    expect(await dims(bytes)).toEqual([1600, 1200]);
  });

  test('an empty file says it cannot be read', async ({ page }) => {
    await page.locator('[data-tool] input[type=file]').setInputFiles({ name: 'empty.jpg', mimeType: 'image/jpeg', buffer: Buffer.alloc(0) });
    await expect(page.getByText("We couldn't read this file. It may be damaged or incomplete.")).toBeVisible();
  });
});

test.describe('Resize image', () => {
  test.beforeEach(({ page }) => page.goto('/resize-image/'));
  const width = (page: Page) => page.getByLabel('Width');
  const height = (page: Page) => page.getByLabel('Height');

  test('empty: the size box, 1200 wide by default, and the resize copy', async ({ page }) => {
    await expect(page.getByText('Fit within')).toBeVisible();
    await expect(page.getByText('Resized on your device. Your images are never uploaded.')).toBeVisible();
    await expect(width(page)).toHaveValue('1200');
    await expect(height(page)).toHaveValue('');
    await expect(height(page)).toHaveAttribute('placeholder', 'Any');
    await expect(page.getByText('Leave one blank to keep the proportions. Images are never made bigger.')).toBeVisible();
  });

  test('fits each image to the width, keeping its format, and says when one is already small enough', async ({ page }) => {
    await chooseImages(page, 'photo.jpg', 'alpha.png');
    await expect(doneRows(page)).toHaveCount(2);
    await expect(doneRows(page).nth(0)).toContainText('1200 × 900 px');
    await expect(doneRows(page).nth(1)).toContainText('200 × 150 px');
    await expect(doneRows(page).nth(1).getByText('Already within that size, so it was kept.')).toBeVisible();
    await expect(button(page, 'Resize more')).toBeVisible();
    const { name, bytes } = await downloadFrom(page, doneRows(page).nth(0).getByRole('link', { name: 'Download' }));
    expect(name).toBe('photo.jpg');
    expect(head(bytes, 3)).toEqual(JPEG);
    expect(await dims(bytes)).toEqual([1200, 900]);
  });

  test('a new size resizes the images already in the list', async ({ page }) => {
    await chooseImages(page, 'photo.jpg', 'alpha.png');
    await expect(doneRows(page).nth(0)).toContainText('1200 × 900 px');
    await width(page).fill('');
    await height(page).fill('75');
    await height(page).press('Enter');
    await expect(doneRows(page).nth(0)).toContainText('100 × 75 px');
    await expect(doneRows(page).nth(1)).toContainText('100 × 75 px');
    await expect(doneRows(page).nth(1).locator('.note')).toHaveCount(0);
    const { bytes } = await downloadFrom(page, doneRows(page).nth(1).getByRole('link', { name: 'Download' }));
    expect(head(bytes, 4)).toEqual(PNG);
    expect(await dims(bytes)).toEqual([100, 75]);
  });

  test('a HEIC is the wrong type', async ({ page }) => {
    await chooseImages(page, 'rotated-6.heic');
    await expect(page.getByText('This is a HEIC, not a JPG, PNG or WebP image.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Try HEIC to JPG →' })).toBeVisible();
  });

  test('at 390 px: no sideways scroll, and both size boxes fit', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/resize-image/');
    await chooseImages(page, 'photo.jpg');
    await expect(doneRows(page)).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    for (const f of [width(page), height(page)]) expect((await f.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  });
});

test.describe('Rotate PDF', () => {
  test.beforeEach(({ page }) => page.goto('/rotate-pdf/'));
  const rotations = async (b: Uint8Array) => (await PDFDocument.load(b)).getPages().map((p) => p.getRotation().angle);

  test('empty', async ({ page }) => {
    await expect(page.getByText('Drop a PDF here')).toBeVisible();
    await expect(page.locator('label.btn', { hasText: 'Choose PDF' })).toBeVisible();
    await expect(page.getByText('Rotated on your device. Your files are never uploaded.')).toBeVisible();
    await expect(button(page, 'Rotate PDF')).toBeHidden();
  });

  test('right by default; the download has every page turned, then Start over', async ({ page }) => {
    await choosePdf(page, 'three-pages.pdf');
    await expect(page.getByText('3 pages', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Right, a quarter turn')).toBeChecked();
    await button(page, 'Rotate PDF').click();
    await expect(page.getByText('three-pages-rotated.pdf', { exact: true })).toBeVisible();
    const { name, bytes } = await downloadFrom(page, page.getByRole('link', { name: 'Download' }));
    expect(name).toBe('three-pages-rotated.pdf');
    expect(await rotations(bytes)).toEqual([90, 90, 90]);
    await button(page, 'Start over').click();
    await expect(page.getByText('Drop a PDF here')).toBeVisible();
  });

  test('left and upside down', async ({ page }) => {
    await choosePdf(page, 'two-pages.pdf');
    await page.getByLabel('Left, a quarter turn').check();
    await button(page, 'Rotate PDF').click();
    expect(await rotations((await downloadFrom(page, page.getByRole('link', { name: 'Download' }))).bytes)).toEqual([270, 270]);
    await button(page, 'Start over').click();
    await expect(page.getByLabel('Right, a quarter turn')).toBeChecked();
    await choosePdf(page, 'two-pages.pdf');
    await page.getByLabel('Upside down').check();
    await button(page, 'Rotate PDF').click();
    expect(await rotations((await downloadFrom(page, page.getByRole('link', { name: 'Download' }))).bytes)).toEqual([180, 180]);
  });

  test('password-protected and damaged files', async ({ page }) => {
    await choosePdf(page, 'encrypted.pdf');
    await expect(page.getByRole('alert').filter({ hasText: 'This PDF is password-protected. Remove the password and try again.' })).toBeVisible();
    await expect(button(page, 'Rotate PDF')).toBeHidden();
    await choosePdf(page, 'not-a.pdf');
    await expect(page.getByText("We couldn't read this file. It may be damaged or not a PDF.")).toBeVisible();
  });

  test('at 390 px: full-width button, no sideways scroll', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/rotate-pdf/');
    await choosePdf(page, 'three-pages.pdf');
    const [b, col] = await Promise.all([button(page, 'Rotate PDF').boundingBox(), page.locator('[data-kind="pdf"]').boundingBox()]);
    expect(Math.round(b!.width)).toBe(Math.round(col!.width));
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });
});

for (const slug of ['png-to-pdf', 'image-to-pdf']) {
  test(`${slug}: a PNG and a JPG become a two-page PDF`, async ({ page }) => {
    await page.goto(`/${slug}/`);
    await expect(page.getByText('Drop images here')).toBeVisible();
    await choosePdf(page, 'alpha.png', 'photo.jpg');
    await expect(page.locator('[data-rows] > li').first()).toContainText('200 × 150 px');
    await button(page, 'Create PDF').click();
    const { bytes } = await downloadFrom(page, page.getByRole('link', { name: 'Download' }));
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2);
  });
}
