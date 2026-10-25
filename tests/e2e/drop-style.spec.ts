import { expect, test } from '@playwright/test';

// Layout A §4: every file tool opens with one big button; the dashed edge shows only while a file is held over it.
test.skip(({ browserName }) => browserName !== 'chromium', 'computed-style checks run once, on chromium');
test.beforeEach(({ context }) => context.route('https://cloud.umami.is/**', (r) => r.fulfill({ status: 202, body: '' })));

const PAGES = ['/merge-pdf/', '/heic-to-jpg/', '/remove-background/', '/compress-video/'];
// The drop zone sits on the tool's bench, which sets its own tints from the zone colour.
const benchTint = (page: import('@playwright/test').Page, v: string) =>
  page.locator('.bench').evaluate((b, v) => {
    const probe = document.createElement('span');
    probe.style.backgroundColor = `var(${v})`;
    b.append(probe);
    const c = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return c;
  }, v);

const columns = (el: import('@playwright/test').Locator) =>
  el.evaluate((u) => getComputedStyle(u).gridTemplateColumns.split(' ').length);

test('related tools hang 3 to a row on desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/merge-pdf/');
  expect(await columns(page.locator('.related'))).toBe(3);
});

test('after files are chosen, the compact zone keeps its look: tinted box, title on top, a normal button', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/merge-pdf/');
  await page.locator('[data-kind="pdf"] input[type=file]').setInputFiles(['tests/fixtures/pdf/two-pages.pdf', 'tests/fixtures/pdf/three-pages.pdf']);
  const drop = page.locator('.drop.drop-compact');
  await expect(drop).toBeVisible();
  await expect(drop).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(drop).toHaveCSS('border-top-style', 'dashed');
  const btn = (await drop.locator('label.btn').boundingBox())!;
  const title = (await drop.locator('.drop-title').boundingBox())!;
  expect(btn.height).toBeLessThan(56);
  expect(title.y).toBeLessThan(btn.y);
});

for (const path of PAGES) {
  test(`${path}: big button at rest, dashed edge only while dragging`, async ({ page }) => {
    for (const [width, height] of [[1280, 900], [375, 812]] as const) {
      await page.setViewportSize({ width, height });
      await page.goto(path);
      const drop = page.locator('.drop').first();
      const btn = drop.locator('label.btn');
      const title = drop.locator('.drop-title');

      // No visible edge at rest: transparent (desktop keeps the 2px so nothing jumps) or no border at all (phone).
      const edge = await drop.evaluate((d) => { const s = getComputedStyle(d); return { color: s.borderTopColor, width: s.borderTopWidth }; });
      expect(edge.color === 'rgba(0, 0, 0, 0)' || edge.width === '0px', JSON.stringify(edge)).toBe(true);
      await expect(drop).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      const b = (await btn.boundingBox())!;
      expect(b.height).toBeGreaterThanOrEqual(64);
      if (width === 1280) {
        expect(b.width).toBeGreaterThanOrEqual(320);
        await expect(title).toBeVisible();
        expect((await title.boundingBox())!.y).toBeGreaterThan(b.y);
      } else {
        const inner = await drop.evaluate((d) => d.clientWidth - parseFloat(getComputedStyle(d).paddingLeft) - parseFloat(getComputedStyle(d).paddingRight));
        expect(Math.abs(b.width - inner)).toBeLessThanOrEqual(1);
        await expect(title).toBeHidden();
      }
      await expect(drop.locator('.privacy')).toBeVisible();

      // Phones can't drag files in, and the phone layout has never styled the drag; check it on desktop.
      if (width === 1280) {
        await drop.evaluate((d) => d.classList.add('is-over'));
        await expect(drop).toHaveCSS('border-top-style', 'dashed');
        await expect(drop).toHaveCSS('border-top-color', 'rgb(107, 107, 102)');
        await expect(drop).toHaveCSS('background-color', await benchTint(page, '--tint-strong'));
      }
    }
  });
}
