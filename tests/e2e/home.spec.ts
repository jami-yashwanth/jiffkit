import { expect, test, type Page } from '@playwright/test';

test.beforeEach(({ context }) => context.route('https://plausible.io/**', (r) => r.fulfill({ status: 202, body: '' })));

const chip = (page: Page, name: string) => page.locator('.chips').getByRole('button', { name, exact: true });
const visible = (page: Page) => page.locator('#tools li:visible');

test('homepage chips filter the grid', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.chips')).toBeVisible();
  await expect(visible(page)).toHaveCount(17);

  await chip(page, 'PDF').click();
  await expect(visible(page)).toHaveCount(4);
  const hrefs = await visible(page).getByRole('link').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
  expect(hrefs.sort()).toEqual(['/jpg-to-pdf/', '/merge-pdf/', '/pdf-to-jpg/', '/split-pdf/']);

  for (const [name, count] of [['Developer', 4], ['AI', 4], ['Video', 2], ['Image', 3], ['All', 17]] as const) {
    await chip(page, name).click();
    await expect(visible(page)).toHaveCount(count);
    await expect(page.locator('.chips [aria-pressed="true"]')).toHaveText(name);
  }
  await chip(page, 'Developer').click();
  await expect(visible(page).getByRole('link', { name: /QR code generator/ })).toBeVisible();
});

test('chips work from the keyboard', async ({ page }) => {
  await page.goto('/');
  await chip(page, 'All').focus();
  await page.keyboard.press('Tab');
  await expect(chip(page, 'Image')).toBeFocused();
  await page.keyboard.press('Space');
  await expect(visible(page)).toHaveCount(3);
  await expect(chip(page, 'Image')).toHaveAttribute('aria-pressed', 'true');
  await expect(chip(page, 'All')).toHaveAttribute('aria-pressed', 'false');
});

test('no sideways scroll on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await expect(page.locator('a.card')).toHaveCount(17);
  const { scroll, width, widest } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    width: innerWidth,
    widest: Math.max(...[...document.querySelectorAll('a.card')].map((a) => a.getBoundingClientRect().right)),
  }));
  expect(scroll).toBeLessThanOrEqual(width);
  expect(widest).toBeLessThanOrEqual(width);
});
