import { expect, test } from '@playwright/test';

test.beforeEach(({ context }) => context.route('https://plausible.io/**', (r) => r.fulfill({ status: 202, body: '' })));

test('homepage filter: empty shows all, a match narrows, no match says so', async ({ page }) => {
  await page.goto('/');
  const filter = page.getByLabel('Find a tool');
  const tools = page.locator('#tools li');
  const visible = page.locator('#tools li:visible');
  const noMatch = page.getByText('No tool matches that. Try "HEIC", "WebP" or "compress".');

  await expect(visible).toHaveCount(await tools.count());
  await expect(noMatch).toBeHidden();

  await filter.fill('heic');
  await expect(visible).toHaveCount(1);
  await expect(visible.getByRole('link')).toHaveAttribute('href', '/heic-to-jpg/');
  await expect(noMatch).toBeHidden();

  await filter.fill('gif');
  await expect(visible).toHaveCount(0);
  await expect(noMatch).toBeVisible();

  await filter.fill('');
  await expect(visible).toHaveCount(await tools.count());
  await expect(noMatch).toBeHidden();
});
