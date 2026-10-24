import { expect, test, type Page } from '@playwright/test';
import { stubPlausible } from './plausible';
import { modelBytes, routeModels } from './models';

// The shared on-device AI states (spec §4), driven on Remove background. In the E2E build (PUBLIC_AI_STUB=1) that
// page mounts a stand-in tool: the model really downloads through the shared loader (from routed bytes), the
// inference is faked. The model is 45 MB, so it asks before its first download.

const PHOTO = 'tests/fixtures/photo.jpg';
const CONSENT = "This tool downloads a 45 MB AI model the first time. It's cached for next time.";
const CELLULAR = 'You seem to be on mobile data.';
const FAILED = "Couldn't download the AI model. Check your connection.";
const RESULT = /__AI_STUB__ result: model 45000000 bytes/;

async function open(page: Page) {
  await stubPlausible(page.context());
  await page.goto('/remove-background/');
  const models = await routeModels(page, await modelBytes(page));
  return models;
}
const choose = (page: Page, file: string | { name: string; mimeType: string; buffer: Buffer } = PHOTO) =>
  page.locator('[data-kind="ai"] input[type=file]').setInputFiles(file);
const start = (page: Page) => page.getByRole('button', { name: 'Download and start' });
const panel = (page: Page) => page.locator('[data-ai-panel]');

test('a large model asks first: the consent copy with the size, and no mobile-data line on other connections', async ({ page }) => {
  const models = await open(page);
  await choose(page);
  await expect(panel(page).getByText(CONSENT, { exact: true })).toBeVisible();
  await expect(start(page)).toBeVisible();
  await expect(start(page)).toBeFocused();
  await expect(page.getByText(CELLULAR)).toBeHidden();
  await expect(page.locator('.drop')).toBeHidden();
  expect(models.requests).toBe(0); // nothing downloads before the user agrees
});

test('on mobile data the consent screen adds "You seem to be on mobile data."', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'connection', { configurable: true, value: { type: 'cellular' } });
  });
  await open(page);
  await choose(page);
  await expect(panel(page).getByText(CONSENT, { exact: true })).toBeVisible();
  await expect(panel(page).getByText(CELLULAR, { exact: true })).toBeVisible();
});

test('downloading shows "<done> of 45 MB" with progress; Cancel goes back to consent and caches nothing', async ({ page }) => {
  const models = await open(page);
  models.mode = 'slow';
  await choose(page);
  await start(page).click();
  const text = panel(page).locator('p').first();
  await expect(text).toHaveText(/^Downloading the AI model… [1-9]\d* of 45 MB, one time only$/);
  const bar = panel(page).locator('progress');
  await expect(bar).toBeVisible();
  expect(Number(await bar.getAttribute('max'))).toBe(45_000_000);
  expect(await bar.evaluate((b: HTMLProgressElement) => b.value)).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(panel(page).getByText(CONSENT, { exact: true })).toBeVisible();
  await expect(start(page)).toBeFocused();
  expect(await page.evaluate(async () => (await (await caches.open('models-v1')).keys()).length)).toBe(0);

  // Starting again downloads afresh, to the end.
  models.mode = 'serve';
  const before = models.requests;
  await start(page).click();
  await expect(page.getByText(RESULT)).toBeVisible();
  expect(models.requests).toBe(before + 1);
});

test('a failed download says so, and Try again downloads and runs', async ({ page }) => {
  const models = await open(page);
  models.mode = 'abort';
  await choose(page);
  await start(page).click();
  await expect(page.getByRole('alert').getByText(FAILED, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try again' })).toBeFocused();
  await expect(page.locator('.drop')).toBeHidden(); // the file is kept: Try again is the one action
  models.mode = 'serve';
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByText(RESULT)).toBeVisible();
});

test('working shows "Removing background… n%"; once downloaded, the model is used from the cache, even offline', async ({ page }) => {
  const models = await open(page);
  await choose(page);
  await start(page).click();
  await expect(panel(page).locator('p').first()).toHaveText(/^Removing background… \d+%$/);
  await expect(page.getByText(RESULT)).toBeVisible();
  expect(models.requests).toBe(1);

  await page.getByRole('button', { name: 'Start over' }).click();
  await expect(page.locator('.drop')).toBeVisible();
  await expect(page.getByText(RESULT)).toHaveCount(0);

  // Review Focus 2: offline, a cached model needs no consent and no download.
  models.mode = 'abort';
  await page.context().setOffline(true);
  await choose(page);
  await expect(page.getByText(RESULT)).toBeVisible();
  await expect(start(page)).toHaveCount(0);
  expect(models.requests).toBe(1);
});

test('after one successful download, a reload skips consent', async ({ page, browserName }) => {
  // Playwright's WebKit keeps Cache Storage in memory per page, so a reload or navigation empties it (checked:
  // even a tiny entry is gone). Real Safari persists it; the same-page cache check above covers WebKit.
  test.skip(browserName === 'webkit', 'Playwright WebKit drops Cache Storage on reload');
  const models = await open(page);
  await choose(page);
  await start(page).click();
  await expect(page.getByText(RESULT)).toBeVisible();
  await page.reload();
  await choose(page);
  await expect(page.getByText(RESULT)).toBeVisible();
  await expect(start(page)).toHaveCount(0);
  expect(models.requests).toBe(1); // served from Cache Storage
});

test('a HEIC says what it is and links to HEIC to JPG, without asking to download', async ({ page }) => {
  const models = await open(page);
  await choose(page, 'tests/fixtures/rotated-6.heic');
  const alert = page.getByRole('alert');
  await expect(alert.getByText('This is a HEIC, not a JPG, PNG or WebP image.', { exact: true })).toBeVisible();
  await expect(alert.getByRole('link', { name: 'Try HEIC to JPG →' })).toHaveAttribute('href', '/heic-to-jpg/');
  await expect(start(page)).toBeHidden();
  await expect(page.locator('.drop')).toBeVisible();
  expect(models.requests).toBe(0);
});

test('an empty file is a damaged file', async ({ page }) => {
  await open(page);
  await choose(page, { name: 'empty.jpg', mimeType: 'image/jpeg', buffer: Buffer.alloc(0) });
  await expect(
    page.getByRole('alert').getByText("We couldn't read this file. It may be damaged or incomplete.", { exact: true }),
  ).toBeVisible();
});
