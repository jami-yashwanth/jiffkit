import { expect, test, type Page } from '@playwright/test';
import { stubPlausible } from './plausible';
import { modelBytes, routeModels } from './models';

// The shared on-device AI states (spec §4), driven on Remove background. In the E2E build (PUBLIC_AI_STUB=1) the model
// really downloads through the shared loader (from routed bytes); only the inference is faked. Its model is 5 MB, under
// the 20 MB consent threshold, so it starts downloading straight away. The consent screen (models over 20 MB) is
// tested once a tool with such a model is mounted (Transcribe, Task 7).

const PHOTO = 'tests/fixtures/photo.jpg';
const FAILED = "Couldn't download the AI model. Check your connection.";
const RESULT = 'Download PNG'; // the result's own action: the run finished

async function open(page: Page) {
  await stubPlausible(page.context());
  // Record every text the panel shows while it is on screen, so a state that passes in a blink is still seen.
  await page.addInitScript(() => {
    (window as unknown as { seen: string[] }).seen = [];
    addEventListener('DOMContentLoaded', () => {
      new MutationObserver(() => {
        const panel = document.querySelector<HTMLElement>('[data-ai-panel]');
        const t = panel?.querySelector('p')?.textContent;
        if (t && !panel!.hidden) (window as unknown as { seen: string[] }).seen.push(t);
      }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
    });
  });
  await page.goto('/remove-background/');
  const models = await routeModels(page, await modelBytes(page));
  return models;
}
const choose = (page: Page, file: string | { name: string; mimeType: string; buffer: Buffer } = PHOTO) =>
  page.locator('[data-kind="ai"] input[type=file]').setInputFiles(file);
const panel = (page: Page) => page.locator('[data-ai-panel]');
const seen = (page: Page) => page.evaluate(() => (window as unknown as { seen: string[] }).seen);
const consent = (page: Page) => page.getByRole('button', { name: 'Download and start' });

test('a model of 20 MB or less starts at once: no consent screen, the download shows on first use', async ({ page }) => {
  const models = await open(page);
  await choose(page);
  await expect(page.getByRole('button', { name: RESULT })).toBeVisible();
  expect(models.requests).toBe(1);
  expect((await seen(page)).some((t) => /^Downloading the AI model… \d+ of 5 MB, one time only$/.test(t))).toBe(true);
  expect((await seen(page)).some((t) => t.startsWith('This tool downloads'))).toBe(false);
  await expect(consent(page)).toHaveCount(0);
});

test('downloading shows "<done> of 5 MB" with progress; Cancel goes back to the drop zone and caches nothing', async ({ page }) => {
  const models = await open(page);
  models.mode = 'slow';
  await choose(page);
  const text = panel(page).locator('p').first();
  await expect(text).toHaveText(/^Downloading the AI model… [1-9]\d* of 5 MB, one time only$/);
  const bar = panel(page).locator('progress');
  await expect(bar).toBeVisible();
  expect(Number(await bar.getAttribute('max'))).toBe(4_574_861);
  expect(await bar.evaluate((b: HTMLProgressElement) => b.value)).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.locator('.drop')).toBeVisible();
  await expect(panel(page)).toBeHidden();
  await expect(page.locator('[data-kind="ai"] input[type=file]')).toBeFocused();
  expect(await page.evaluate(async () => (await (await caches.open('models-v1')).keys()).length)).toBe(0);

  // Choosing the photo again downloads afresh, to the end.
  models.mode = 'serve';
  const before = models.requests;
  await choose(page);
  await expect(page.getByRole('button', { name: RESULT })).toBeVisible();
  expect(models.requests).toBe(before + 1);
});

test('a failed download says so, and Try again downloads and runs', async ({ page }) => {
  const models = await open(page);
  models.mode = 'abort';
  await choose(page);
  await expect(page.getByRole('alert').getByText(FAILED, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try again' })).toBeFocused();
  await expect(page.locator('.drop')).toBeHidden(); // the file is kept: Try again is the one action
  models.mode = 'serve';
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('button', { name: RESULT })).toBeVisible();
});

test('a model that fails to parse is dropped from the cache and shown as a failed download; Try again fetches it afresh', async ({ page }) => {
  const models = await open(page);
  models.mode = 'bad';
  await choose(page);
  await expect(page.getByRole('alert').getByText(FAILED, { exact: true })).toBeVisible();
  expect(await page.evaluate(async () => (await (await caches.open('models-v1')).keys()).length)).toBe(0);
  models.mode = 'serve';
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('button', { name: RESULT })).toBeVisible();
  expect(models.requests).toBe(2);
});

test('working shows "Removing background… n%"; once downloaded, the model is used from the cache, even offline', async ({ page }) => {
  const models = await open(page);
  await choose(page);
  await expect(page.getByRole('button', { name: RESULT })).toBeVisible();
  expect((await seen(page)).some((t) => /^Removing background… \d+%$/.test(t))).toBe(true);
  expect(models.requests).toBe(1);

  await page.getByRole('button', { name: 'Start over' }).click();
  await expect(page.locator('.drop')).toBeVisible();
  await expect(page.getByRole('button', { name: RESULT })).toHaveCount(0);

  // Review Focus 2: offline, a cached model needs no download.
  models.mode = 'abort';
  await page.context().setOffline(true);
  await page.evaluate(() => ((window as unknown as { seen: string[] }).seen = []));
  await choose(page);
  await expect(page.getByRole('button', { name: RESULT })).toBeVisible();
  expect((await seen(page)).some((t) => t.startsWith('Downloading'))).toBe(false);
  expect(models.requests).toBe(1);
});

test('after one successful download, a reload uses the cached model', async ({ page, browserName }) => {
  // Playwright's WebKit keeps Cache Storage in memory per page, so a reload or navigation empties it (checked:
  // even a tiny entry is gone). Real Safari persists it; the same-page cache check above covers WebKit.
  test.skip(browserName === 'webkit', 'Playwright WebKit drops Cache Storage on reload');
  const models = await open(page);
  await choose(page);
  await expect(page.getByRole('button', { name: RESULT })).toBeVisible();
  await page.reload();
  await choose(page);
  await expect(page.getByRole('button', { name: RESULT })).toBeVisible();
  expect((await seen(page)).some((t) => t.startsWith('Downloading'))).toBe(false);
  expect(models.requests).toBe(1); // served from Cache Storage
});

test('a HEIC says what it is and links to HEIC to JPG, without asking to download', async ({ page }) => {
  const models = await open(page);
  await choose(page, 'tests/fixtures/rotated-6.heic');
  const alert = page.getByRole('alert');
  await expect(alert.getByText('This is a HEIC, not a JPG, PNG or WebP image.', { exact: true })).toBeVisible();
  await expect(alert.getByRole('link', { name: 'Try HEIC to JPG →' })).toHaveAttribute('href', '/heic-to-jpg/');
  await expect(consent(page)).toHaveCount(0);
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
