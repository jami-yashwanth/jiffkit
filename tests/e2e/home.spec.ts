import { expect, test } from '@playwright/test';

test.beforeEach(({ context }) => context.route('https://cloud.umami.is/**', (r) => r.fulfill({ status: 202, body: '' })));

const zone = (page: import('@playwright/test').Page, name: string) => page.getByRole('region', { name: new RegExp(`^${name}`) });

test('the homepage wall hangs every tool in its zone', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('a.tag')).toHaveCount(17);
  for (const [name, count] of [['Image', 3], ['PDF', 4], ['AI', 4], ['Video', 2], ['Developer', 4]] as const) {
    await expect(zone(page, name).locator('a.tag')).toHaveCount(count);
  }
  const hrefs = await zone(page, 'PDF').locator('a.tag').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
  expect(hrefs).toEqual(['/merge-pdf/', '/split-pdf/', '/pdf-to-jpg/', '/jpg-to-pdf/']);
  await expect(zone(page, 'Developer').getByRole('link', { name: /QR code generator/ })).toBeVisible();
});

test('a tag shows hover and keyboard focus', async ({ page, browserName }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  const tag = page.locator('a.tag[href="/merge-pdf/"]');
  await tag.hover();
  await expect(tag).toHaveCSS('border-top-color', 'rgb(20, 20, 20)');
  await page.mouse.move(0, 0);
  await page.getByRole('combobox', { name: 'Search tools' }).focus(); // the search comes before the wall
  // WebKit on macOS tabs only between text fields unless the system's keyboard navigation is on (it is off on CI
  // runners); Option+Tab is Safari's key for every focusable element.
  await page.keyboard.press(browserName === 'webkit' ? 'Alt+Tab' : 'Tab');
  await expect(page.locator('a.tag').first()).toBeFocused();
  await expect(page.locator('a.tag').first()).toHaveCSS('outline-style', 'solid');
});

test('a tool page leads back to the wall from the logo', async ({ page }) => {
  await page.goto('/');
  await zone(page, 'PDF').getByRole('link', { name: /Merge PDF/ }).click();
  await expect(page.locator('.bench-io')).toContainText('PDFs');
  await page.getByRole('link', { name: 'jiffkit' }).click();
  await expect(page).toHaveURL(/\/$/);
});

test('no sideways scroll on a phone, and tags hang two to a row', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await expect(page.locator('a.tag')).toHaveCount(17);
  const { scroll, width, widest, perRow } = await page.evaluate(() => {
    const tags = [...document.querySelectorAll('a.tag')].map((a) => a.getBoundingClientRect());
    return {
      scroll: document.documentElement.scrollWidth,
      width: innerWidth,
      widest: Math.max(...tags.map((r) => r.right)),
      perRow: tags.filter((r) => Math.abs(r.top - tags[0].top) < 1).length,
    };
  });
  expect(scroll).toBeLessThanOrEqual(width);
  expect(widest).toBeLessThanOrEqual(width);
  expect(perRow).toBe(2);
});
