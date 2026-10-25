import { expect, test, type Page } from '@playwright/test';

// Spec §4 states for the three text tools, with the exact copy. Dates render in the user's time zone,
// so the zone is pinned; the clock is fixed so relative wording ("2 hours ago") is deterministic.

test.use({ timezoneId: 'UTC' });
test.beforeEach(({ context }) => context.route('https://plausible.io/**', (r) => r.fulfill({ status: 202, body: '' })));

const NOW = new Date('2026-10-24T12:00:00Z');
const at = (offsetSeconds: number) => Math.floor(NOW.getTime() / 1000) + offsetSeconds;
const b64url = (o: unknown) => Buffer.from(JSON.stringify(o), 'utf8').toString('base64url');
const jwt = (payload: object) => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.c2lnbmF0dXJl`;

const status = (page: Page) => page.locator('[data-status]');

/** Set a big value without typing it, firing the same input event typing would. */
async function setValue(page: Page, selector: string, value: string) {
  await page.evaluate(
    ({ selector, value }) => {
      const el = document.querySelector<HTMLTextAreaElement>(selector)!;
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    },
    { selector, value },
  );
}

test.describe('JSON formatter', () => {
  test.beforeEach(({ page }) => page.goto('/json-formatter/'));
  const input = (page: Page) => page.getByLabel('JSON', { exact: true });
  const output = (page: Page) => page.locator('pre[data-results]');
  const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

  test('buttons are disabled while the box is empty', async ({ page }) => {
    for (const name of ['Format', 'Minify', 'Copy']) await expect(button(page, name)).toBeDisabled();
    await input(page).fill('   ');
    await expect(button(page, 'Format')).toBeDisabled();
    await input(page).fill('{}');
    await expect(button(page, 'Format')).toBeEnabled();
    await expect(button(page, 'Minify')).toBeEnabled();
    await expect(button(page, 'Copy')).toBeDisabled(); // nothing to copy yet
  });

  test('Format and Minify, with the indent option', async ({ page }) => {
    await input(page).fill('{"a":[1,2],"b":{"c":true}}');
    await button(page, 'Format').click();
    await expect(output(page)).toHaveText('{\n  "a": [\n    1,\n    2\n  ],\n  "b": {\n    "c": true\n  }\n}', { useInnerText: true });

    await page.getByText('Options').click();
    await page.getByLabel('4 spaces').check();
    await expect(output(page)).toHaveText('{\n    "a": [\n        1,\n        2\n    ],\n    "b": {\n        "c": true\n    }\n}', { useInnerText: true });
    await page.getByLabel('Tab').check();
    await expect(output(page)).toContainText('{\n\t"a": [\n\t\t1,', { useInnerText: true });

    await button(page, 'Minify').click();
    await expect(output(page)).toHaveText('{"a":[1,2],"b":{"c":true}}');
  });

  test('invalid JSON names the line and column and highlights the line', async ({ page }) => {
    await input(page).fill('{\n  "a": 1\n"b": 2\n}');
    await button(page, 'Format').click();
    await expect(status(page)).toHaveText(`Invalid JSON at line 3, column 1: Expected ',' or '}'.`);
    await expect(input(page)).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('.error-line')).toHaveText('3 | "b": 2');
    await expect(output(page)).toHaveText('');
    await expect(button(page, 'Copy')).toBeDisabled();

    // Editing clears the error.
    await input(page).fill('{"b": 2}');
    await expect(status(page)).toHaveText('');
    await expect(page.locator('.error-line')).toBeHidden();
    await expect(input(page)).not.toHaveAttribute('aria-invalid', 'true');
  });

  test('editing the input clears the old result, so Copy cannot copy it', async ({ page }) => {
    await input(page).fill('[1,2]');
    await button(page, 'Minify').click();
    await expect(output(page)).toHaveText('[1,2]');
    await expect(button(page, 'Copy')).toBeEnabled();
    await input(page).fill('[1,2,3]');
    await expect(output(page)).toHaveText('');
    await expect(button(page, 'Copy')).toBeDisabled();
    await button(page, 'Minify').click();
    await expect(output(page)).toHaveText('[1,2,3]');
    await expect(button(page, 'Copy')).toBeEnabled();
  });

  test('too deeply nested JSON uses the message pattern without a line highlight', async ({ page }) => {
    await setValue(page, '[data-input]', '['.repeat(200_000) + ']'.repeat(200_000));
    await button(page, 'Format').click();
    await expect(status(page)).toHaveText('Invalid JSON at line 1, column 1: Nested too deeply to format.');
    await expect(page.locator('.error-line')).toBeHidden();
  });

  test('Copy shows "Copied" for a moment', async ({ page, context, browserName }) => {
    if (browserName === 'chromium') await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.clock.install();
    await input(page).fill('[1,2]');
    await button(page, 'Minify').click();
    await button(page, 'Copy').click();
    const copied = page.locator('.copied');
    await expect(copied).toHaveText('Copied');
    await expect(copied).toHaveAttribute('aria-live', 'polite');
    if (browserName === 'chromium') expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('[1,2]');
    await page.clock.runFor(1600);
    await expect(copied).toHaveText('');
  });

  test('over 5 MB warns that it may take a moment', async ({ page, browserName }) => {
    const big = JSON.stringify(Array.from({ length: 150_000 }, (_, i) => ({ id: i, name: `item ${i}`, ok: true })));
    expect(big.length).toBeGreaterThan(5 * 1024 * 1024);
    await setValue(page, '[data-input]', big);
    await expect(status(page)).toHaveText('Large file: formatting may take a moment.');

    // Click to the next painted frame, measured in the page (checks the FAQ's "Several megabytes work fine").
    const ms = await page.evaluate(
      () =>
        new Promise<number>((done) => {
          const t = performance.now();
          document.querySelector<HTMLButtonElement>('[data-action="format"]')!.click();
          requestAnimationFrame(() => setTimeout(() => done(Math.round(performance.now() - t))));
        }),
    );
    await expect(output(page)).toContainText('"name": "item 149999"');
    test.info().annotations.push({ type: 'format-time', description: `${(big.length / 1048576).toFixed(1)} MB on ${browserName}: ${ms} ms` });
  });
});

test.describe('Base64', () => {
  test.beforeEach(({ page }) => page.goto('/base64-encode-decode/'));
  const text = (page: Page) => page.getByLabel('Text', { exact: true });
  const base64 = (page: Page) => page.getByLabel('Base64', { exact: true });

  test('typing text updates Base64, and the other way round', async ({ page }) => {
    await text(page).fill('héllo 👋?>');
    await expect(base64(page)).toHaveValue('aMOpbGxvIPCfkYs/Pg==');
    await base64(page).fill('d29ybGQ=');
    await expect(text(page)).toHaveValue('world');
  });

  test('URL-safe re-encodes from the Text box', async ({ page }) => {
    await text(page).fill('héllo 👋?>');
    await expect(base64(page)).toHaveValue('aMOpbGxvIPCfkYs/Pg==');
    await page.getByLabel('URL-safe').check();
    await expect(base64(page)).toHaveValue('aMOpbGxvIPCfkYs_Pg');
    await base64(page).fill('d29ybGQ');
    await expect(text(page)).toHaveValue('world');
  });

  test('URL-safe re-decodes the Base64 box when that was edited last', async ({ page }) => {
    await base64(page).fill('aMOpbGxvIPCfkYs_Pg');
    await expect(status(page)).toHaveText("This isn't valid Base64.");
    await page.getByLabel('URL-safe').check();
    await expect(text(page)).toHaveValue('héllo 👋?>');
    await expect(base64(page)).toHaveValue('aMOpbGxvIPCfkYs_Pg'); // what the user typed is kept
    await expect(status(page)).toHaveText('');
  });

  test('each box has a Copy button', async ({ page, context, browserName }) => {
    if (browserName === 'chromium') await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const copies = page.getByRole('button', { name: 'Copy', exact: true });
    await expect(copies).toHaveCount(2);
    for (const c of await copies.all()) await expect(c).toBeDisabled();
    await text(page).fill('hi');
    await expect(base64(page)).toHaveValue('aGk=');
    for (const c of await copies.all()) await expect(c).toBeEnabled();

    await copies.nth(1).click();
    await expect(page.locator('.copied').nth(1)).toHaveText('Copied');
    await expect(page.locator('.copied').nth(1)).toHaveAttribute('aria-live', 'polite');
    await expect(page.locator('.copied').nth(0)).toHaveText('');
    if (browserName === 'chromium') expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('aGk=');
    await copies.nth(0).click();
    await expect(page.locator('.copied').nth(0)).toHaveText('Copied');
    if (browserName === 'chromium') expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('hi');
  });

  test('invalid Base64 keeps the last good text', async ({ page }) => {
    await base64(page).fill('d29ybGQ=');
    await expect(text(page)).toHaveValue('world');
    await base64(page).fill('d29y!!');
    await expect(status(page)).toHaveText("This isn't valid Base64.");
    await expect(text(page)).toHaveValue('world');
    await base64(page).fill('/w==');
    await expect(status(page)).toHaveText("This is valid Base64, but it isn't text.");
    await expect(text(page)).toHaveValue('world');
    await base64(page).fill('aGk=');
    await expect(status(page)).toHaveText('');
    await expect(text(page)).toHaveValue('hi');
  });
});

test.describe('JWT decoder', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(NOW);
    await page.goto('/jwt-decoder/');
  });
  const input = (page: Page) => page.getByLabel('Token');
  const note = 'Signature not verified. This tool only decodes the token. Your token never leaves this page.';

  test('a token fills the Header and Payload panes, each with Copy', async ({ page }) => {
    await expect(page.getByText(note)).toBeVisible();
    const copies = page.getByRole('button', { name: 'Copy', exact: true });
    await expect(copies).toHaveCount(2);
    for (const c of await copies.all()) await expect(c).toBeDisabled();

    await input(page).fill(jwt({ sub: '42', iat: at(-3600), nbf: at(-3600), exp: at(3600) }));
    await expect(page.locator('[data-header]')).toHaveText('{\n  "alg": "HS256",\n  "typ": "JWT"\n}', { useInnerText: true });
    await expect(page.locator('[data-payload]')).toContainText('"sub": "42"');
    await expect(page.getByText('Expires 24 Oct 2026, 13:00 (in 1 hour)')).toBeVisible();
    await expect(page.getByText('Issued 24 Oct 2026, 11:00 (1 hour ago)')).toBeVisible();
    await expect(page.getByText('Not valid before 24 Oct 2026, 11:00 (1 hour ago)')).toBeVisible();
    await expect(page.getByText(note)).toBeVisible();

    await copies.nth(1).click();
    await expect(page.locator('.copied').nth(1)).toHaveText('Copied');
    await expect(page.locator('.copied').nth(0)).toHaveText('');
    await copies.nth(0).click();
    await expect(page.locator('.copied').nth(0)).toHaveText('Copied');
  });

  test('an expired token says so in the error colour', async ({ page }) => {
    await input(page).fill(jwt({ exp: at(-7200) }));
    const line = page.getByText('Expired 2 hours ago', { exact: true });
    await expect(line).toBeVisible();
    const [colour, errorColour] = await line.evaluate((el) => {
      const probe = document.createElement('span');
      probe.style.color = 'var(--error)';
      document.body.append(probe);
      const c = [getComputedStyle(el).color, getComputedStyle(probe).color];
      probe.remove();
      return c;
    });
    expect(colour).toBe(errorColour);
    expect(colour).not.toBe('rgb(20, 20, 20)'); // not the ink colour
  });

  test('a malformed token gets the three-parts message', async ({ page }) => {
    await input(page).fill('not.a-jwt');
    await expect(status(page)).toHaveText("This doesn't look like a JWT. A JWT has three parts separated by dots.");
    await expect(page.locator('[data-header]')).toHaveText('');
    await expect(page.getByText(note)).toBeVisible();
    await input(page).fill('');
    await expect(status(page)).toHaveText('');
  });
});

test.describe('mobile 390', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('output panes stop at 12 lines and scroll; buttons are full width', async ({ page }) => {
    await page.goto('/json-formatter/');
    await page.getByLabel('JSON', { exact: true }).fill(JSON.stringify(Array.from({ length: 40 }, (_, i) => i)));
    await page.getByRole('button', { name: 'Format', exact: true }).click();
    const pane = page.locator('pre[data-results]');
    await expect(pane).toContainText('39');
    const m = await pane.evaluate((el) => {
      const s = getComputedStyle(el);
      return { height: el.clientHeight, scroll: el.scrollHeight, line: parseFloat(s.lineHeight) };
    });
    expect(m.height).toBeLessThanOrEqual(12 * m.line + 32);
    expect(m.scroll).toBeGreaterThan(m.height);

    const width = (await page.locator('[data-kind]').boundingBox())!.width;
    for (const name of ['Format', 'Minify', 'Copy']) {
      expect((await page.getByRole('button', { name, exact: true }).boundingBox())!.width).toBeCloseTo(width, 0);
    }

    for (const path of ['/jwt-decoder/', '/base64-encode-decode/']) {
      await page.goto(path);
      for (const c of await page.getByRole('button', { name: 'Copy', exact: true }).all()) {
        expect((await c.boundingBox())!.width).toBeCloseTo(width, 0);
      }
    }
  });
});

test('empty status regions stay in the accessibility tree and take no room', async ({ page }) => {
  for (const path of ['/json-formatter/', '/base64-encode-decode/', '/jwt-decoder/', '/qr-code-generator/']) {
    await page.goto(path);
    for (const s of await page.locator('[data-status]').all()) {
      const m = await s.evaluate((el) => {
        const cs = getComputedStyle(el);
        return { empty: el.textContent === '', display: cs.display, height: el.getBoundingClientRect().height, margin: cs.marginTop };
      });
      expect(m, path).toMatchObject({ empty: true, height: 0, margin: '0px' });
      expect(m.display, path).not.toBe('none');
    }
  }
});

/** Put a value into the textarea the moment the parser creates it, so it is there before the island mounts (what a reload's form restore does). */
async function presetBeforeMount(page: Page, selector: string, value: string) {
  await page.addInitScript(
    ({ selector, value }) => {
      const set = () => {
        const el = document.querySelector<HTMLTextAreaElement>(selector);
        if (el) el.value = value;
        return !!el;
      };
      const mo = new MutationObserver(() => set() && mo.disconnect());
      mo.observe(document, { childList: true, subtree: true });
    },
    { selector, value },
  );
}

test.describe('restored input (reload with form restore)', () => {
  test('JSON: Format and Minify are enabled when the box already has text', async ({ page }) => {
    await presetBeforeMount(page, '[data-input]', '{"a": 1}');
    await page.goto('/json-formatter/');
    await expect(page.getByLabel('JSON', { exact: true })).toHaveValue('{"a": 1}');
    await expect(page.getByRole('button', { name: 'Format', exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Minify', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Minify', exact: true }).click();
    await expect(page.locator('pre[data-results]')).toHaveText('{"a":1}');
  });

  test('JWT: a restored token is decoded', async ({ page }) => {
    await presetBeforeMount(page, '[data-input]', jwt({ sub: 'restored-user' }));
    await page.goto('/jwt-decoder/');
    await expect(page.locator('[data-payload]')).toContainText('restored-user');
    await expect(page.getByRole('button', { name: 'Copy', exact: true }).first()).toBeEnabled();
  });
});
