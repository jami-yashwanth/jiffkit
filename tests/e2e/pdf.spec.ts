import { readFileSync } from 'node:fs';
import { expect, test, type Locator, type Page, type Route } from '@playwright/test';
import { unzipSync } from 'fflate';
import { PDFDocument } from 'pdf-lib';

// Spec §4 Merge PDF and Split PDF states, with the exact copy. Runs against `astro build` + `astro preview`.

test.beforeEach(async ({ context, page }) => {
  await context.route('https://plausible.io/**', (r) => r.fulfill({ status: 202, body: '' }));
  await page.addInitScript(() => {
    const w = window as unknown as { __hooks: [string, unknown][]; __hold: boolean; __held: (() => void)[]; __release: () => void };
    // Every onSuccess/onError call, as the island reports it.
    w.__hooks = [];
    document.addEventListener('pdf:success', (e) => w.__hooks.push(['success', (e as CustomEvent).detail.count]));
    document.addEventListener('pdf:error', (e) => w.__hooks.push(['error', (e as CustomEvent).detail.reason]));
    // While __hold is set, merge/split results from the worker wait for __release(); page counts pass straight through.
    w.__hold = false;
    w.__held = [];
    w.__release = () => {
      w.__hold = false;
      w.__held.splice(0).forEach((f) => f());
    };
    const Base = window.Worker;
    window.Worker = class extends Base {
      set onmessage(fn: ((e: MessageEvent) => void) | null) {
        super.onmessage = (e: MessageEvent) => {
          if (w.__hold && e.data?.kind === 'done' && typeof e.data.result === 'object') w.__held.push(() => fn?.call(this, e));
          else fn?.call(this, e);
        };
      }
      get onmessage() {
        return super.onmessage;
      }
    };
  });
});

const hooks = (page: Page) => page.evaluate(() => (window as unknown as { __hooks: [string, unknown][] }).__hooks);
const holdResults = (page: Page) => page.evaluate(() => ((window as unknown as { __hold: boolean }).__hold = true));
const releaseResults = (page: Page) => page.evaluate(() => (window as unknown as { __release: () => void }).__release());

/** The pdf-lib chunk the PDF worker imports on first use. */
const PDF_LIB = /\/_astro\/pdf-lib-[^/]*\.js$/;
const DAMAGED = "We couldn't read this file. It may be damaged or not a PDF.";
const ENCRYPTED = 'This PDF is password-protected. Remove the password and try again.';
const CODEC_FAILED = "Couldn't load the PDF tools. Check your connection.";

const choose = (page: Page, ...names: string[]) =>
  page.locator('[data-kind="pdf"] input[type=file]').setInputFiles(names.map((n) => `tests/fixtures/pdf/${n}`));
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const rows = (page: Page) => page.locator('[data-rows] > li');

/** Click something that downloads; return the file name and bytes. */
async function downloadFrom(page: Page, trigger: Locator) {
  const [download] = await Promise.all([page.waitForEvent('download'), trigger.click()]);
  return { name: download.suggestedFilename(), bytes: new Uint8Array(readFileSync((await download.path())!)) };
}
const isPdf = (b: Uint8Array) => new TextDecoder().decode(b.subarray(0, 4)) === '%PDF';
/** Page widths: fixture page n of three-pages.pdf is 200+n pt wide, of two-pages.pdf 300+n. */
const widths = async (b: Uint8Array) => (await PDFDocument.load(b)).getPages().map((p) => Math.round(p.getSize().width));

/** Hold every request for the pdf-lib chunk until `release()` is called. */
async function holdPdfLib(page: Page) {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  await page.context().route(PDF_LIB, async (route: Route) => {
    await gate;
    await route.continue();
  });
  return release;
}

test.describe('Merge PDF', () => {
  test.beforeEach(({ page }) => page.goto('/merge-pdf/'));

  test('empty', async ({ page }) => {
    await expect(page.getByText('Drop PDF files here')).toBeVisible();
    await expect(page.locator('label.btn', { hasText: 'Choose PDFs' })).toBeVisible();
    await expect(page.getByText('Merged on your device. Your files are never uploaded.')).toBeVisible();
    await expect(rows(page)).toHaveCount(0);
    await expect(button(page, 'Merge PDFs')).toBeHidden();
  });

  test('loading the engine shows the measured size, then goes away', async ({ page }) => {
    const size = await page.locator('[data-kind="pdf"]').getAttribute('data-codec-size');
    expect(size).toMatch(/^\d+(\.\d)? (KB|MB)$/);
    const release = await holdPdfLib(page);
    await choose(page, 'three-pages.pdf', 'two-pages.pdf');
    await expect(page.getByText(`Getting the PDF tools ready… ${size}, one time only`)).toBeVisible();
    await expect(rows(page).first()).toContainText('Reading…');
    release();
    await expect(rows(page).first()).toContainText('3 pages');
    await expect(page.getByText('Getting the PDF tools ready…')).toBeHidden();
  });

  test('one file asks for another; the list reorders and removes', async ({ page }) => {
    await choose(page, 'three-pages.pdf');
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText('three-pages.pdf');
    await expect(rows(page).first()).toContainText('3 pages');
    await expect(page.getByText('Add at least one more PDF to merge.')).toBeVisible();
    await expect(button(page, 'Merge PDFs')).toBeDisabled();

    await choose(page, 'two-pages.pdf'); // appends
    await expect(rows(page)).toHaveCount(2);
    await expect(rows(page).nth(1)).toContainText('2 pages');
    await expect(page.getByText('Add at least one more PDF to merge.')).toBeHidden();
    await expect(button(page, 'Merge PDFs')).toBeEnabled();

    const first = rows(page).first();
    const last = rows(page).last();
    await expect(first.getByRole('button', { name: 'Move up' })).toBeDisabled();
    await expect(first.getByRole('button', { name: 'Move down' })).toBeEnabled();
    await expect(last.getByRole('button', { name: 'Move down' })).toBeDisabled();
    await last.getByRole('button', { name: 'Move up' }).click();
    await expect(rows(page).first()).toContainText('two-pages.pdf');
    await expect(rows(page).last()).toContainText('three-pages.pdf');

    await rows(page).first().getByRole('button', { name: 'Remove' }).click();
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText('three-pages.pdf');
    await expect(page.getByText('Add at least one more PDF to merge.')).toBeVisible();
  });

  test('Merge PDFs merges in list order, then Start over clears', async ({ page }) => {
    await choose(page, 'three-pages.pdf', 'two-pages.pdf');
    await expect(rows(page).last()).toContainText('2 pages');
    await rows(page).last().getByRole('button', { name: 'Move up' }).click();
    await holdResults(page);
    await button(page, 'Merge PDFs').click();
    await expect(page.getByText('Merging 2 files…')).toBeVisible();
    await expect(button(page, 'Merge PDFs')).toBeHidden();
    await releaseResults(page);
    await expect(page.getByText('merged.pdf', { exact: true })).toBeVisible();
    await expect(page.getByText(/^5 pages · \d+ KB$/)).toBeVisible();
    // Screen readers hear the result; the status region says it without showing it twice.
    await expect(page.locator('[data-status]')).toHaveText(/^merged\.pdf ready, 5 pages · \d+ KB$/);
    expect(await hooks(page)).toEqual([['success', 1]]);

    const { name, bytes } = await downloadFrom(page, page.getByRole('link', { name: 'Download' }));
    expect(name).toBe('merged.pdf');
    expect(isPdf(bytes)).toBe(true);
    expect(await widths(bytes)).toEqual([301, 302, 201, 202, 203]);

    await button(page, 'Start over').click();
    await expect(page.getByText('Drop PDF files here')).toBeVisible();
    await expect(rows(page)).toHaveCount(0);
    await expect(page.getByText('merged.pdf', { exact: true })).toBeHidden();
  });

  test('the same file can be added twice', async ({ page }) => {
    await choose(page, 'two-pages.pdf');
    await choose(page, 'two-pages.pdf');
    await expect(rows(page)).toHaveCount(2);
    await button(page, 'Merge PDFs').click();
    await expect(page.getByText(/^4 pages · \d+ KB$/)).toBeVisible();
    const { bytes } = await downloadFrom(page, page.getByRole('link', { name: 'Download' }));
    expect(await widths(bytes)).toEqual([301, 302, 301, 302]);
  });

  test('a password-protected file shows the password copy and blocks Merge until removed', async ({ page }) => {
    await choose(page, 'three-pages.pdf', 'encrypted.pdf', 'two-pages.pdf');
    await expect(rows(page).nth(1)).toContainText(ENCRYPTED);
    await expect(rows(page).last()).toContainText('2 pages');
    await expect(button(page, 'Merge PDFs')).toBeDisabled();
    await expect(page.locator('[data-status]')).toHaveText(`encrypted.pdf: ${ENCRYPTED}`); // announced
    expect(await hooks(page)).toEqual([['error', 'encrypted']]);
    await rows(page).nth(1).getByRole('button', { name: 'Remove' }).click();
    await expect(button(page, 'Merge PDFs')).toBeEnabled();
  });

  test('a file that is not a PDF shows the damaged copy', async ({ page }) => {
    await choose(page, 'not-a.pdf', 'truncated.pdf');
    await expect(rows(page).first()).toContainText(DAMAGED);
    await expect(rows(page).last()).toContainText(DAMAGED);
    await expect(button(page, 'Merge PDFs')).toBeDisabled();
    expect(await hooks(page)).toEqual([['error', 'corrupt'], ['error', 'corrupt']]); // one per damaged file
  });

  test('codec load failed, then Try again', async ({ page }) => {
    await page.context().route(PDF_LIB, (route) => route.abort());
    await choose(page, 'three-pages.pdf', 'two-pages.pdf');
    await expect(page.getByRole('alert')).toContainText(CODEC_FAILED);
    await expect(button(page, 'Merge PDFs')).toBeDisabled();
    await expect(page.getByText('Reading…')).toHaveCount(0); // both counts have failed
    expect(await hooks(page)).toEqual([['error', 'codec-load']]); // one outage, reported once
    await page.context().unroute(PDF_LIB);
    await button(page, 'Try again').click();
    await expect(rows(page).first()).toContainText('3 pages');
    await expect(rows(page).last()).toContainText('2 pages');
    await expect(page.getByText(CODEC_FAILED)).toBeHidden();
    await button(page, 'Merge PDFs').click();
    await expect(page.getByText(/^5 pages · \d+ KB$/)).toBeVisible();
    expect(await hooks(page)).toEqual([['error', 'codec-load'], ['success', 1]]);
  });
});

test.describe('Split PDF', () => {
  test.beforeEach(({ page }) => page.goto('/split-pdf/'));
  const everyPage = (page: Page) => page.getByLabel('Every page as a separate file');
  const extract = (page: Page) => page.getByLabel('Extract pages:');
  const rangeInput = (page: Page) => page.getByPlaceholder('1-3, 5');

  test('empty', async ({ page }) => {
    await expect(page.getByText('Drop a PDF here')).toBeVisible();
    await expect(page.locator('label.btn', { hasText: 'Choose PDF' })).toBeVisible();
    await expect(page.getByText('Split on your device. Your files are never uploaded.')).toBeVisible();
    await expect(button(page, 'Split PDF')).toBeHidden();
  });

  test('loaded: name, page count and options', async ({ page }) => {
    await choose(page, 'three-pages.pdf');
    await expect(page.getByText('three-pages.pdf', { exact: true })).toBeVisible();
    await expect(page.getByText('3 pages', { exact: true })).toBeVisible();
    await expect(everyPage(page)).toBeChecked();
    await expect(rangeInput(page)).toBeDisabled();
    await extract(page).check();
    await expect(rangeInput(page)).toBeEnabled();
    await everyPage(page).check();
    await expect(rangeInput(page)).toBeDisabled();
    await expect(button(page, 'Split PDF')).toBeEnabled();
  });

  test('every page: Download all (ZIP) holds one PDF per page, then Start over', async ({ page }) => {
    await choose(page, 'three-pages.pdf');
    await expect(page.getByText('3 pages', { exact: true })).toBeVisible();
    await holdResults(page);
    await button(page, 'Split PDF').click();
    await expect(page.getByText('Splitting…')).toBeVisible();
    await releaseResults(page);
    await expect(page.getByText('3 files', { exact: true })).toBeVisible();
    await expect(page.locator('[data-status]')).toHaveText('three-pages-pages.zip ready, 3 files');
    expect(await hooks(page)).toEqual([['success', 3]]);
    const { name, bytes } = await downloadFrom(page, page.getByRole('link', { name: 'Download all (ZIP)' }));
    expect(name).toBe('three-pages-pages.zip');
    const entries = unzipSync(bytes);
    expect(Object.keys(entries)).toEqual(['three-pages-page-1.pdf', 'three-pages-page-2.pdf', 'three-pages-page-3.pdf']);
    expect(await Promise.all(Object.values(entries).map(widths))).toEqual([[201], [202], [203]]);

    await button(page, 'Start over').click();
    await expect(page.getByText('Drop a PDF here')).toBeVisible();
    await expect(page.getByText('3 files', { exact: true })).toBeHidden();
  });

  test('extract 1-2', async ({ page }) => {
    await choose(page, 'three-pages.pdf');
    await extract(page).check();
    await rangeInput(page).fill('1-2');
    await button(page, 'Split PDF').click();
    await expect(page.getByText('three-pages-pages-1-2.pdf', { exact: true })).toBeVisible();
    const { name, bytes } = await downloadFrom(page, page.getByRole('link', { name: 'Download' }));
    expect(name).toBe('three-pages-pages-1-2.pdf');
    expect(isPdf(bytes)).toBe(true);
    expect(await widths(bytes)).toEqual([201, 202]);
  });

  test('an invalid range names the real page count, on Split', async ({ page }) => {
    await choose(page, 'three-pages.pdf');
    await extract(page).check();
    await rangeInput(page).fill('9');
    await expect(page.getByText('Pages must be between 1 and 3, like 1-3, 5.')).toBeHidden(); // not while typing
    await button(page, 'Split PDF').click();
    await expect(page.getByRole('alert').filter({ hasText: 'Pages must be between 1 and 3, like 1-3, 5.' })).toBeVisible();
    await expect(rangeInput(page)).toHaveAccessibleDescription('Pages must be between 1 and 3, like 1-3, 5.');
    expect(await hooks(page)).toEqual([['error', 'range']]);
    await rangeInput(page).fill('2-');
    await button(page, 'Split PDF').click();
    await expect(page.getByText('three-pages-pages-2-3.pdf', { exact: true })).toBeVisible();
  });

  test('a new PDF replaces the current one', async ({ page }) => {
    await choose(page, 'three-pages.pdf');
    await expect(page.getByText('3 pages', { exact: true })).toBeVisible();
    await choose(page, 'two-pages.pdf');
    await expect(page.getByText('two-pages.pdf', { exact: true })).toBeVisible();
    await expect(page.getByText('2 pages', { exact: true })).toBeVisible();
    await expect(page.getByText('three-pages.pdf', { exact: true })).toBeHidden();
  });

  test('password-protected and damaged files', async ({ page }) => {
    await choose(page, 'encrypted.pdf');
    await expect(page.getByRole('alert').filter({ hasText: ENCRYPTED })).toBeVisible();
    await expect(button(page, 'Split PDF')).toBeHidden();
    await choose(page, 'not-a.pdf');
    await expect(page.getByText(DAMAGED)).toBeVisible();
    await expect(page.getByText(ENCRYPTED)).toBeHidden();
    expect(await hooks(page)).toEqual([['error', 'encrypted'], ['error', 'corrupt']]);
  });

  test('codec load failed, then Try again', async ({ page }) => {
    await page.context().route(PDF_LIB, (route) => route.abort());
    await choose(page, 'three-pages.pdf');
    await expect(page.getByText(CODEC_FAILED)).toBeVisible();
    await page.context().unroute(PDF_LIB);
    await button(page, 'Try again').click();
    await expect(page.getByText('3 pages', { exact: true })).toBeVisible();
  });
});

test.describe('mobile 390', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  const fullWidth = async (page: Page, target: Locator) => {
    const box = (await target.boundingBox())!;
    const column = (await page.locator('[data-kind="pdf"]').boundingBox())!;
    expect(Math.round(box.width)).toBe(Math.round(column.width));
  };
  const noSideScroll = async (page: Page) =>
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  test('merge: single column, full-width buttons', async ({ page }) => {
    await page.goto('/merge-pdf/');
    await fullWidth(page, page.locator('label.btn', { hasText: 'Choose PDFs' }));
    await choose(page, 'three-pages.pdf', 'two-pages.pdf');
    await expect(rows(page).last()).toContainText('2 pages');
    await fullWidth(page, button(page, 'Merge PDFs'));
    await noSideScroll(page);
    await button(page, 'Merge PDFs').click();
    await fullWidth(page, page.getByRole('link', { name: 'Download' }));
    await fullWidth(page, button(page, 'Start over'));
    await noSideScroll(page);
  });

  test('split: single column, full-width buttons', async ({ page }) => {
    await page.goto('/split-pdf/');
    await choose(page, 'three-pages.pdf');
    await fullWidth(page, button(page, 'Split PDF'));
    await noSideScroll(page);
    await button(page, 'Split PDF').click();
    await fullWidth(page, page.getByRole('link', { name: 'Download all (ZIP)' }));
    await fullWidth(page, button(page, 'Start over'));
    await noSideScroll(page);
  });
});
