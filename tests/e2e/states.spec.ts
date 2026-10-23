import { readFileSync } from 'node:fs';
import { expect, test, type Locator, type Page, type Route } from '@playwright/test';
import { unzipSync } from 'fflate';
import { sniff } from '../../src/engine/sniff';

// One test per spec §5 state, asserting the exact copy. Runs against `astro build` + `astro preview`.

// The build carries the Plausible tag; keep these tests off the real network.
test.beforeEach(({ context }) => context.route('https://plausible.io/**', (r) => r.fulfill({ status: 202, body: '' })));

const fixture = (name: string) => `tests/fixtures/${name}`;

/** Pick files through the real <input type=file>. Works for every engine, including a hidden input. */
async function choose(page: Page, ...names: string[]) {
  await page.locator('[data-tool] input[type=file]').setInputFiles(names.map(fixture));
}

/**
 * Synthesise a real drop: a DataTransfer holding File objects, dispatched as dragenter/dragover/drop.
 * Every engine's DataTransfer constructor accepts files here, so this runs on all three projects.
 */
async function dropFiles(page: Page, target: string, ...names: string[]) {
  const files = names.map((n) => ({ name: n, bytes: [...readFileSync(fixture(n))] }));
  await page.evaluate(
    ({ target, files }) => {
      const dt = new DataTransfer();
      for (const f of files) dt.items.add(new File([new Uint8Array(f.bytes)], f.name));
      const el = document.querySelector(target)!;
      for (const type of ['dragenter', 'dragover', 'drop']) {
        el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
      }
    },
    { target, files },
  );
}

/** Hold every request for the HEIC codec until `release()` is called. */
async function holdHeicCodec(page: Page) {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  await page.context().route(/libheif-bundle-[^/]*\.js$/, async (route: Route) => {
    await gate;
    await route.continue();
  });
  return release;
}

/** Click something that downloads, and return the downloaded bytes. */
async function downloadFrom(page: Page, trigger: Locator): Promise<Uint8Array> {
  const [download] = await Promise.all([page.waitForEvent('download'), trigger.click()]);
  return new Uint8Array(readFileSync((await download.path())!));
}
const JPEG = [0xff, 0xd8, 0xff];
const PNG = [0x89, 0x50, 0x4e, 0x47];
const head = (b: Uint8Array, n: number) => [...b.subarray(0, n)];

const rows = (page: Page) => page.locator('[data-rows] > li');
const doneRows = (page: Page) => page.locator('[data-rows] > li.row-done');

test('empty', async ({ page }) => {
  await page.goto('/heic-to-jpg/');
  await expect(page.getByText('Drop HEIC photos here')).toBeVisible();
  await expect(page.locator('label.btn', { hasText: 'Choose photos' })).toBeVisible();
  await expect(page.getByText('Converted on your device. Your photos are never uploaded.')).toBeVisible();
  await expect(page.locator('[data-results]')).toBeHidden();
  // Options are collapsed on HEIC to JPG.
  await expect(page.locator('details.settings summary')).toHaveText('Options');
  await expect(page.locator('details.settings [data-quality-input]')).toBeHidden();
});

test('codecs load on hover, not before', async ({ page }) => {
  const codec: string[] = [];
  page.context().on('request', (r) => {
    if (/libheif-bundle-[^/]*\.js$/.test(r.url())) codec.push(r.url());
  });
  await page.goto('/heic-to-jpg/');
  await page.waitForLoadState('networkidle');
  expect(codec).toEqual([]);
  const requested = page.context().waitForEvent('request', (r) => /libheif-bundle-[^/]*\.js$/.test(r.url()));
  await page.locator('.drop').hover();
  await requested;
});

test('loading codec', async ({ page }) => {
  await page.context().route(/libheif-bundle-[^/]*\.js$/, async (route) => {
    await new Promise((r) => setTimeout(r, 1000));
    await route.continue();
  });
  await page.goto('/heic-to-jpg/');
  await choose(page, 'rotated-6.heic');
  await expect(page.getByText('Getting the converter ready… 0.8 MB, one time only')).toBeVisible();
  await expect(page.locator('[data-loading] progress')).toBeVisible();
  await expect(doneRows(page)).toHaveCount(1);
  await expect(page.locator('[data-loading]')).toBeHidden();
});

test('processing', async ({ page }) => {
  const release = await holdHeicCodec(page);
  await page.goto('/heic-to-jpg/');
  await choose(page, 'rotated-6.heic', 'multi.heic');
  await expect(page.locator('[data-status]')).toHaveText('Converting 1 of 2');
  await expect(rows(page)).toHaveCount(2);
  await expect(rows(page).first().locator('.name')).toHaveText('rotated-6.heic');
  // Only the row being converted spins; the rest wait.
  await expect(rows(page).first().locator('.spinner')).toHaveCount(1);
  await expect(rows(page).nth(1).locator('.waiting')).toHaveText('Waiting');
  await expect(rows(page).locator('.spinner')).toHaveCount(1);
  release();
  await expect(doneRows(page)).toHaveCount(2);
  await expect(page.locator('[data-status]')).toBeHidden();
});

test('done', async ({ page }) => {
  await page.goto('/heic-to-jpg/');
  await choose(page, 'iphone-12mp.heic', 'rotated-6.heic');
  await expect(doneRows(page)).toHaveCount(2);
  const first = doneRows(page).first();
  await expect(first.locator('.name')).toHaveText('iphone-12mp.jpg');
  await expect(first.locator('.size')).toHaveText(/^\d+(\.\d)? (KB|MB) → \d+(\.\d)? (KB|MB)$/);
  await expect(first.getByRole('link', { name: 'Download' })).toHaveAttribute('download', 'iphone-12mp.jpg');
  await expect(first.locator('img.thumb')).toHaveAttribute('src', /^blob:/);
  // The row shows a small thumbnail, not the full output.
  const href = await first.getByRole('link', { name: 'Download' }).getAttribute('href');
  expect(await first.locator('img.thumb').getAttribute('src')).not.toBe(href);
  expect(await first.locator('img.thumb').evaluate((i: HTMLImageElement) => Math.max(i.naturalWidth, i.naturalHeight))).toBeLessThanOrEqual(96);
  expect(head(await downloadFrom(page, first.getByRole('link', { name: 'Download' })), 3)).toEqual(JPEG);
  await expect(page.getByRole('button', { name: 'Download all (ZIP)' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Convert more' })).toBeVisible();
  await expect(page.getByText('Location data removed')).toBeVisible();

  // Convert more: back to the empty state, object URLs released.
  const url = await first.locator('img.thumb').getAttribute('src');
  await page.getByRole('button', { name: 'Convert more' }).click();
  await expect(page.getByText('Drop HEIC photos here')).toBeVisible();
  await expect(rows(page)).toHaveCount(0);
  const revoked = await page.evaluate(async (u) => {
    try {
      await fetch(u!);
      return false;
    } catch {
      return true;
    }
  }, url);
  expect(revoked).toBe(true);
});

test('wrong type', async ({ page }) => {
  await page.goto('/heic-to-jpg/');
  await choose(page, 'alpha.png');
  await expect(page.getByText('This is a PNG, not a HEIC photo.')).toBeVisible();
  const link = page.getByRole('link', { name: 'Try Compress image →' });
  await expect(link).toHaveAttribute('href', '/compress-image/');
});

test('wrong type never reaches the worker', async ({ page }) => {
  const workers: string[] = [];
  page.on('worker', (w) => workers.push(w.url()));
  await page.goto('/webp-to-jpg/');
  await choose(page, 'photo.jpg');
  await expect(page.getByText('This is a JPG, not a WebP image.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Try Compress image →' })).toHaveAttribute('href', '/compress-image/');
  expect(workers).toEqual([]);
});

test('corrupt', async ({ page }) => {
  await page.goto('/heic-to-jpg/');
  await choose(page, 'truncated.heic');
  await expect(page.getByText("We couldn't read this file. It may be damaged or incomplete.")).toBeVisible();
});

test('too large', async ({ page }) => {
  test.slow(); // decodes a 63 MP JPEG
  await page.goto('/compress-image/');
  await choose(page, 'huge-63mp.jpg');
  await expect(page.getByText('This image is too large for your device to convert (63 MP).')).toBeVisible();
  await page.getByRole('button', { name: 'Resize to 24 MP and convert' }).click();
  await expect(doneRows(page)).toHaveCount(1, { timeout: 120_000 });
  await expect(doneRows(page).locator('.name')).toHaveText('huge-63mp.jpg');
  const out = await downloadFrom(page, doneRows(page).getByRole('link', { name: 'Download' }));
  const s = await sniff(new Blob([out as BlobPart]));
  expect(s.type).toBe('jpg');
  expect(s.width! * s.height!).toBeLessThanOrEqual(24_000_000);
  expect(s.width! * s.height!).toBeGreaterThan(20_000_000);
});

test('codec load failed, then Try again', async ({ page }) => {
  await page.context().route(/libheif-bundle-[^/]*\.js$/, (route) => route.abort());
  await page.goto('/heic-to-jpg/');
  await choose(page, 'rotated-6.heic');
  await expect(page.getByText("Couldn't load the converter. Check your connection.")).toBeVisible();
  await page.context().unroute(/libheif-bundle-[^/]*\.js$/);
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(doneRows(page)).toHaveCount(1);
});

test('a file that cannot be read shows the corrupt copy, not wrong-type', async ({ page }) => {
  // An I/O failure while sniffing (an iCloud placeholder, a revoked file handle) rejects the read.
  await page.addInitScript(() => {
    const slice = Blob.prototype.slice;
    Blob.prototype.slice = function (...args) {
      const part = slice.apply(this, args as never);
      if ((this as File).name === 'rotated-6.heic') part.arrayBuffer = () => Promise.reject(new DOMException('gone', 'NotReadableError'));
      return part;
    };
  });
  await page.goto('/heic-to-jpg/');
  await choose(page, 'rotated-6.heic');
  await expect(page.getByText("We couldn't read this file. It may be damaged or incomplete.")).toBeVisible();
});

test('out of memory, then Retry', async ({ page }) => {
  // A worker that dies after starting work is how an out-of-memory crash reaches the page.
  await page.context().route(/\/worker-[^/]*\.js$/, (route) =>
    route.fulfill({ contentType: 'text/javascript', body: 'self.onmessage = (e) => { self.postMessage({ kind: "progress", id: e.data.job.id, stage: "decoding" }); throw new Error("boom"); };' }),
  );
  await page.goto('/heic-to-jpg/');
  await choose(page, 'rotated-6.heic');
  await expect(page.getByText('Ran out of memory')).toBeVisible();
  await page.context().unroute(/\/worker-[^/]*\.js$/);
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(doneRows(page)).toHaveCount(1);
});

test('drop during a batch appends to it', async ({ page }) => {
  const release = await holdHeicCodec(page);
  await page.goto('/heic-to-jpg/');
  await dropFiles(page, '.drop', 'rotated-6.heic', 'multi.heic');
  await expect(page.locator('[data-status]')).toHaveText('Converting 1 of 2');
  // The drop zone is hidden while results show; drops land anywhere on the page.
  await dropFiles(page, '[data-results]', 'iphone-12mp.heic');
  await expect(page.locator('[data-status]')).toHaveText('Converting 1 of 3');
  release();
  await expect(doneRows(page)).toHaveCount(3);
  await expect(doneRows(page).locator('.name')).toHaveText(['rotated-6.jpg', 'multi.jpg', 'iphone-12mp.jpg']);
});

test('animated WebP', async ({ page }) => {
  await page.goto('/webp-to-jpg/');
  await choose(page, 'animated.webp');
  await expect(page.getByText('Animated WebP: converted the first frame.')).toBeVisible();
});

test('ZIP download contains uniquely named files', async ({ page }) => {
  await page.goto('/webp-to-jpg/');
  await page.locator('[data-tool] input[type=file]').setInputFiles([
    { name: 'lossy.webp', mimeType: 'image/webp', buffer: readFileSync(fixture('lossy.webp')) },
    { name: 'lossy.webp', mimeType: 'image/webp', buffer: readFileSync(fixture('alpha.webp')) },
    { name: 'lossy.webp', mimeType: 'image/webp', buffer: readFileSync(fixture('lossless.webp')) },
  ]);
  await expect(doneRows(page)).toHaveCount(3);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download all (ZIP)' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('images.zip');
  const zip = unzipSync(new Uint8Array(readFileSync(await download.path())));
  expect(Object.keys(zip)).toEqual(['lossy.jpg', 'lossy-1.jpg', 'lossy-2.jpg']);
  for (const bytes of Object.values(zip)) expect([...bytes.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
});

test('settings: WebP to PNG, and the PNG note on Compress', async ({ page }) => {
  await page.goto('/webp-to-jpg/');
  await page.getByLabel('PNG').check();
  await choose(page, 'alpha.webp');
  await expect(doneRows(page).locator('.name')).toHaveText('alpha.png');
  expect(head(await downloadFrom(page, doneRows(page).getByRole('link', { name: 'Download' })), 4)).toEqual(PNG);

  await page.goto('/compress-image/');
  await expect(page.locator('[data-quality-input]')).toHaveValue('75');
  await expect(page.getByText('PNG is compressed without quality loss')).toBeHidden();
  await choose(page, 'alpha.png');
  await expect(page.getByText('PNG is compressed without quality loss')).toBeVisible();
  await expect(page.locator('[data-quality-input]')).toBeHidden();
});

test('at 390 px the drop zone is one full-width Choose photos button', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/heic-to-jpg/');
  await expect(page.getByText('Drop HEIC photos here')).toBeHidden();
  const button = page.locator('label.btn', { hasText: 'Choose photos' });
  await expect(button).toBeVisible();
  const [b, d] = await Promise.all([button.boundingBox(), page.locator('.drop').boundingBox()]);
  expect(b!.width).toBeGreaterThanOrEqual(390 - 2 * 16 - 1);
  expect(Math.abs(b!.width - d!.width)).toBeLessThanOrEqual(1);
  // No dashed drop target on mobile: the button is the drop zone.
  await expect(page.locator('.drop')).toHaveCSS('border-top-style', 'none');
});

test('Location data removed stays hidden when a result is already optimized', async ({ page }) => {
  // Our own OxiPNG output cannot get smaller, so Compress hands back the original bytes (GPS not rewritten).
  await page.goto('/webp-to-jpg/');
  await page.getByLabel('PNG').check();
  await choose(page, 'lossless.webp');
  const optimized = await downloadFrom(page, doneRows(page).getByRole('link', { name: 'Download' }));

  await page.goto('/compress-image/');
  await page.locator('[data-tool] input[type=file]').setInputFiles([
    { name: 'photo.jpg', mimeType: 'image/jpeg', buffer: readFileSync(fixture('photo.jpg')) },
    { name: 'optimized.png', mimeType: 'image/png', buffer: Buffer.from(optimized) },
  ]);
  await expect(doneRows(page)).toHaveCount(2);
  await expect(doneRows(page).nth(1).getByText("Already optimized. We couldn't make it smaller.")).toBeVisible();
  await expect(doneRows(page).nth(0).locator('.note')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Convert more' })).toBeVisible();
  await expect(page.locator('[data-results]').getByText('Location data removed')).toBeHidden();
});

test('a quality change applies only to files added after it', async ({ page }) => {
  // Hold the JPEG decoder so both files are still queued when the slider moves.
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  await page.context().route(/mozjpeg_dec-[^/]*\.js$/, async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto('/compress-image/');
  const quality = page.locator('[data-quality-input]');
  await quality.fill('10');
  await choose(page, 'photo.jpg');
  await expect(rows(page)).toHaveCount(1);
  await quality.fill('90');
  await expect(page.locator('.quality output')).toHaveText('90');
  await choose(page, 'photo.jpg');
  await expect(rows(page)).toHaveCount(2);
  release();
  await expect(doneRows(page)).toHaveCount(2);
  const size = async (i: number) =>
    (await downloadFrom(page, doneRows(page).nth(i).getByRole('link', { name: 'Download' }))).length;
  const low = await size(0);
  const high = await size(1);
  expect(low).toBeLessThan(high * 0.7);
});

test('a wrong file does not hide the loading banner while the codec loads', async ({ page }) => {
  const release = await holdHeicCodec(page);
  await page.goto('/heic-to-jpg/');
  await choose(page, 'rotated-6.heic');
  const banner = page.getByText('Getting the converter ready… 0.8 MB, one time only');
  await expect(banner).toBeVisible();
  await choose(page, 'alpha.png');
  await expect(page.getByText('This is a PNG, not a HEIC photo.')).toBeVisible();
  await expect(banner).toBeVisible();
  release();
  await expect(doneRows(page)).toHaveCount(1);
  await expect(banner).toBeHidden();
});
