import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

// Spec §4 states for the QR code generator, with the exact copy.

test.beforeEach(async ({ context, page }) => {
  await context.route('https://plausible.io/**', (r) => r.fulfill({ status: 202, body: '' }));
  await page.goto('/qr-code-generator/');
});

const input = (page: Page) => page.getByLabel('Text or URL');
const preview = (page: Page) => page.locator('[data-results]');
const status = (page: Page) => page.locator('[data-status]');
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

async function download(page: Page, name: string) {
  const [dl] = await Promise.all([page.waitForEvent('download'), button(page, name).click()]);
  return { dl, bytes: await readFile((await dl.path())!) };
}

test('empty state: placeholder, copy and disabled downloads', async ({ page }) => {
  await expect(preview(page)).toHaveText('Your QR code appears here.');
  await expect(preview(page).locator('svg')).toHaveCount(0);
  await expect(button(page, 'Download PNG')).toBeDisabled();
  await expect(button(page, 'Download SVG')).toBeDisabled();
  await expect(page.getByText('Static code: works forever, no tracking, no sign-up.')).toBeVisible();
});

test('typing updates the preview live, and clearing returns to the placeholder', async ({ page }) => {
  await input(page).fill('https://example.com');
  await expect(preview(page).locator('svg')).toBeVisible();
  await expect(button(page, 'Download PNG')).toBeEnabled();
  const before = await preview(page).innerHTML();
  await input(page).fill('https://example.com/a-much-longer-address-that-needs-a-bigger-code');
  await expect.poll(() => preview(page).innerHTML()).not.toBe(before);
  await input(page).fill('');
  await expect(preview(page)).toHaveText('Your QR code appears here.');
  await expect(button(page, 'Download PNG')).toBeDisabled();
  await expect(button(page, 'Download SVG')).toBeDisabled();
});

test('Download PNG: qr-code.png, PNG magic bytes, 512 px by default', async ({ page }) => {
  await input(page).fill('https://example.com');
  await expect(button(page, 'Download PNG')).toBeEnabled();
  const { dl, bytes } = await download(page, 'Download PNG');
  expect(dl.suggestedFilename()).toBe('qr-code.png');
  expect([...bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  expect(bytes.readUInt32BE(16)).toBe(512);
  expect(bytes.readUInt32BE(20)).toBe(512);
});

test('size option: 1024 px PNG', async ({ page }) => {
  await input(page).fill('https://example.com');
  await page.getByText('Options').click();
  await page.getByLabel('1024 px').check();
  const { bytes } = await download(page, 'Download PNG');
  expect(bytes.readUInt32BE(16)).toBe(1024);
  expect(bytes.readUInt32BE(20)).toBe(1024);
});

test('Download SVG: qr-code.svg that parses as SVG', async ({ page }) => {
  await input(page).fill('https://example.com');
  await expect(button(page, 'Download SVG')).toBeEnabled();
  const { dl, bytes } = await download(page, 'Download SVG');
  expect(dl.suggestedFilename()).toBe('qr-code.svg');
  const ok = await page.evaluate((src) => {
    const doc = new DOMParser().parseFromString(src, 'image/svg+xml');
    return !doc.querySelector('parsererror') && doc.documentElement.localName === 'svg' && doc.documentElement.hasAttribute('viewBox');
  }, bytes.toString('utf8'));
  expect(ok).toBe(true);
});

test('too much text names the limit for the level, and recovers', async ({ page }) => {
  await page.getByText('Options').click();
  await page.getByLabel('L', { exact: true }).check();
  await input(page).fill('a'.repeat(2954));
  await expect(status(page)).toHaveText('Too much text for a QR code (2,953 characters max at level L).');
  await expect(preview(page)).toHaveText('Your QR code appears here.');
  await expect(button(page, 'Download PNG')).toBeDisabled();
  // A higher level has a lower limit: the message follows the selection.
  await page.getByLabel('H', { exact: true }).check();
  await expect(status(page)).toHaveText('Too much text for a QR code (1,273 characters max at level H).');
  await input(page).fill('short');
  await expect(status(page)).toHaveText('');
  await expect(button(page, 'Download PNG')).toBeEnabled();
});

test('level option changes the code', async ({ page }) => {
  await input(page).fill('https://example.com');
  await expect(preview(page).locator('svg')).toBeVisible();
  const m = await preview(page).innerHTML();
  await page.getByText('Options').click();
  await expect(page.getByLabel('M', { exact: true })).toBeChecked();
  await page.getByLabel('H', { exact: true }).check();
  await expect.poll(() => preview(page).innerHTML()).not.toBe(m);
});
