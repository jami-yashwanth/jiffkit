import { expect, test, type Page } from '@playwright/test';

// The tool search: large under the homepage headline, compact in every other header.
test.beforeEach(({ context }) => context.route('https://cloud.umami.is/**', (r) => r.fulfill({ status: 202, body: '' })));

const box = (page: Page) => page.getByRole('combobox', { name: 'Search tools' });
const options = (page: Page) => page.getByRole('option');

test('typing shows matching tools; Enter opens the first', async ({ page }) => {
  await page.goto('/');
  await box(page).fill('png to jpg');
  await expect(options(page).first()).toContainText('PNG to JPG');
  await expect(box(page)).toHaveAttribute('aria-expanded', 'true');
  await box(page).press('Enter');
  await expect(page).toHaveURL(/\/png-to-jpg\/$/);
});

test('each result shows its icon, its name with the typed part marked, what it does and its zone', async ({ page }) => {
  await page.goto('/');
  await box(page).fill('merge');
  const first = options(page).first();
  await expect(first.locator('.search-tile svg')).toBeVisible();
  await expect(first.locator('.search-name mark')).toHaveText('Merge');
  await expect(first.locator('.search-blurb')).toHaveText('Combine PDF files into one document.');
  await expect(page.locator('.search-head')).toHaveText('1 tool');
});

test('focusing the empty box offers places to start, never the page you are on', async ({ page }) => {
  await page.goto('/merge-pdf/');
  await box(page).focus();
  await expect(page.locator('.search-head')).toHaveText('Try');
  await expect(options(page)).toHaveCount(3);
  await expect(options(page).filter({ hasText: 'Merge PDF' })).toHaveCount(0);
  await expect(page.getByText('Search by format too, like heic or sha256.')).toBeVisible();
  await box(page).press('Enter');
  await expect(page).toHaveURL(/\/remove-background\/$/);
});

test('arrow keys move through the results and Enter opens the chosen one', async ({ page }) => {
  await page.goto('/merge-pdf/');
  await box(page).fill('sha');
  await expect(options(page)).toHaveCount(3);
  await expect(options(page).nth(0)).toHaveAttribute('aria-selected', 'true');
  await box(page).press('ArrowDown');
  await expect(options(page).nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(box(page)).toHaveAttribute('aria-activedescendant', await options(page).nth(1).getAttribute('id') as string);
  await box(page).press('ArrowUp');
  await box(page).press('ArrowUp'); // wraps to the last
  await expect(options(page).nth(2)).toHaveAttribute('aria-selected', 'true');
  await box(page).press('Enter');
  await expect(page).toHaveURL(/\/upscale-image\/$/);
});

test('a result opens with a click or tap', async ({ page }) => {
  await page.goto('/developer/');
  await box(page).fill('remove bg');
  await options(page).first().click();
  await expect(page).toHaveURL(/\/remove-background\/$/);
});

test('no match says so, with a way to every tool', async ({ page }) => {
  await page.goto('/heic-to-jpg/');
  await box(page).fill('compress pdf');
  await expect(page.getByText('No tool for “compress pdf” yet.')).toBeVisible();
  await expect(options(page)).toHaveCount(0);
  await expect(box(page)).toHaveAttribute('aria-expanded', 'false');
  await page.getByRole('link', { name: 'See all tools' }).click();
  await expect(page).toHaveURL(/\/$/);
});

test('Escape closes the results, then clears the box; a click outside closes them', async ({ page }) => {
  await page.goto('/');
  await box(page).fill('pdf');
  await expect(options(page).first()).toBeVisible();
  await box(page).press('Escape');
  await expect(options(page).first()).toBeHidden();
  await expect(box(page)).toHaveValue('pdf');
  await box(page).press('Escape');
  await expect(box(page)).toHaveValue('');
  await box(page).fill('pdf');
  await expect(options(page).first()).toBeVisible();
  await page.locator('h1').click();
  await expect(options(page).first()).toBeHidden();
});

test('/ jumps to the search, but not while typing in a field', async ({ page }) => {
  await page.goto('/json-formatter/');
  await page.locator('body').press('/');
  await expect(box(page)).toBeFocused();
  await page.getByLabel('JSON').fill('');
  await page.getByLabel('JSON').press('/');
  await expect(page.getByLabel('JSON')).toHaveValue('/');
});

test('the search sends nothing: no request carries what was typed', async ({ page }) => {
  const urls: string[] = [];
  page.on('request', (r) => urls.push(r.url()));
  await page.goto('/');
  await box(page).fill('secret words');
  await box(page).press('Enter');
  expect(urls.filter((u) => u.includes('secret'))).toEqual([]);
});

test('on a phone the header search has its own row and the page does not scroll sideways', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/merge-pdf/');
  const [mark, search] = [await page.locator('.wordmark').boundingBox(), await box(page).boundingBox()];
  expect(search!.y).toBeGreaterThan(mark!.y + mark!.height);
  await box(page).fill('pdf');
  await expect(options(page).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});

test('motion: the results panel rises in, and nothing animates under reduced motion', async ({ page }) => {
  await page.goto('/');
  await box(page).fill('pdf');
  await expect(page.locator('.search-pop')).toHaveCSS('animation-name', 'rise');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await box(page).fill('png');
  await expect(page.locator('.search-pop')).toHaveCSS('animation-name', 'none');
  await expect(page.locator('a.tag').first().locator('.tag-icon')).toHaveCSS('transition-duration', '0s');
});

test('the list loads once, on first focus, and a failed load says so and tries again', async ({ page }) => {
  let fetches = 0;
  let fail = true;
  await page.route('**/search-index.json', (r) => {
    fetches++;
    return fail ? r.abort() : r.continue();
  });
  await page.goto('/merge-pdf/');
  expect(fetches).toBe(0); // nothing until someone searches
  await box(page).focus();
  await expect(page.getByText('Search didn’t load. Check your connection, or see all tools.')).toBeVisible();
  fail = false;
  await box(page).press('Escape');
  await expect(page.getByText('Search didn’t load.')).toBeHidden();
  await page.mouse.click(5, 600); // away from the box: focus leaves it
  await box(page).focus();
  await expect(page.getByText('Search didn’t load.')).toBeHidden();
  await box(page).fill('pdf');
  await expect(options(page).first()).toBeVisible();
  expect(fetches).toBe(2);
});

test('the search is in the same place on every page: the right of the top bar', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  for (const path of ['/', '/merge-pdf/', '/developer/']) {
    await page.goto(path);
    await expect(page.getByRole('combobox', { name: 'Search tools' })).toHaveCount(1);
    const [bar, search] = [await page.locator('.topbar-in').boundingBox(), await box(page).boundingBox()];
    expect(Math.abs(bar!.x + bar!.width - 16 - (search!.x + search!.width)), path).toBeLessThan(2);
  }
  // Its results open leftwards from the right edge and stay on screen.
  await page.goto('/');
  await box(page).fill('pdf');
  await expect(options(page).first()).toBeVisible(); // the list loads on first focus
  const pop = await page.locator('.search-pop').boundingBox();
  expect(pop!.x).toBeGreaterThanOrEqual(0);
  expect(pop!.x + pop!.width).toBeLessThanOrEqual(1280);
});
