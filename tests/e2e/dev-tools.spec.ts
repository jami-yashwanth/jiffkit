import { expect, test, type Page } from '@playwright/test';

// The 25 developer tools (spec: docs/superpowers/specs/2026-10-25-developer-tools-design.md), each with real input in
// a real browser. Runs once, on chromium: the logic is unit-tested, this checks the wiring, the browser-only parts
// (DOMParser, Web Crypto, workers, the preview sandbox) and that nothing leaves the page.
test.skip(({ browserName }) => browserName !== 'chromium', 'one browser is enough for the wiring');

let offsite: string[];
test.beforeEach(async ({ page, context }) => {
  await context.route('https://plausible.io/**', (r) => r.fulfill({ status: 202, body: '' }));
  offsite = [];
  const away = (url: string) => !url.startsWith('http://localhost:4399/') && !/^(data|blob):/.test(url) && !url.startsWith('https://plausible.io/');
  // A request counts once it reached the network: finished, or failed for any reason but the page's own CSP (which
  // cancels it in the browser before anything is sent, as the Markdown preview does).
  page.on('requestfinished', (r) => away(r.url()) && offsite.push(r.url()));
  page.on('requestfailed', (r) => away(r.url()) && r.failure()?.errorText !== 'csp' && offsite.push(r.url()));
});
test.afterEach(() => expect(offsite, 'every request stays on the site').toEqual([]));

const field = (page: Page, id: string) => page.locator(`[data-field="${id}"]`);
const out = (page: Page, id: string) => page.locator(`[data-out="${id}"] [data-target]`);
const status = (page: Page) => page.locator('[data-kind="dev"] [data-status]');
async function setRange(page: Page, id: string, value: string) {
  await field(page, id).evaluate((el, v) => {
    (el as HTMLInputElement).value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}

type Case = { slug: string; fill?: Record<string, string>; select?: Record<string, string>; click?: boolean; expect: Record<string, string | RegExp> };
const CASES: Case[] = [
  { slug: 'hash-generator', fill: { text: 'abc' }, expect: { hashes: /MD5\s*900150983cd24fb0d6963f7d28e17f72/ } },
  { slug: 'hmac-generator', fill: { message: 'what do ya want for nothing?', key: 'Jefe' }, expect: { hmac: '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843' } },
  { slug: 'url-encode-decode', fill: { text: 'a b&c' }, expect: { result: 'a%20b%26c' } },
  { slug: 'html-entities', select: { mode: 'decode' }, fill: { text: '&copy; &lt;b&gt; &#x1F600;' }, expect: { result: '© <b> 😀' } },
  { slug: 'unix-timestamp-converter', fill: { input: '1735689600' }, expect: { formats: /2025-01-01T00:00:00\.000Z/ } },
  { slug: 'number-base-converter', fill: { value: '255' }, expect: { bases: /Hex\s*ff/ } },
  { slug: 'yaml-to-json', fill: { text: 'a: 1\nlist: [x]' }, expect: { result: '{\n  "a": 1,\n  "list": [\n    "x"\n  ]\n}' } },
  { slug: 'json-to-yaml', fill: { text: '{"a":1,"b":[true]}' }, expect: { result: 'a: 1\nb:\n  - true\n' } },
  { slug: 'json-to-csv', fill: { text: '[{"a":1,"b":"x,y"}]' }, expect: { result: 'a,b\n1,"x,y"' } },
  { slug: 'csv-to-json', fill: { text: 'a;b\n1;"2;3"' }, expect: { result: '[\n  {\n    "a": "1",\n    "b": "2;3"\n  }\n]' } },
  { slug: 'case-converter', fill: { text: 'getHTTPResponse' }, expect: { cases: /snake_case\s*get_http_response/ } },
  { slug: 'word-counter', fill: { text: 'One two three. Four!' }, expect: { counts: /Words\s*4[\s\S]*Sentences\s*2/ } },
  { slug: 'slugify', fill: { text: 'Crème brûlée: 10 tips!' }, expect: { slug: 'creme-brulee-10-tips' } },
  { slug: 'sql-formatter', fill: { text: 'select id from users where a = 1' }, expect: { result: 'SELECT\n  id\nFROM\n  users\nWHERE\n  a = 1' } },
  { slug: 'xml-formatter', fill: { text: '<a><b>x</b><c/></a>' }, expect: { result: '<a>\n  <b>x</b>\n  <c/>\n</a>' } },
  { slug: 'subnet-calculator', fill: { input: '10.0.0.1/22' }, expect: { details: /Network\s*10\.0\.0\.0\/22[\s\S]*Usable hosts\s*1,022/ } },
  { slug: 'text-diff', fill: { a: 'x\ny', b: 'x\nz' }, expect: { diff: /  x\n- y\n\+ z/ } },
  { slug: 'markdown-to-html', fill: { text: '# Hi\n\n**bold**' }, expect: { html: '<h1>Hi</h1>\n<p><strong>bold</strong></p>\n' } },
  { slug: 'bcrypt-generator', fill: { password: 'hunter2' }, click: true, expect: { result: /^\$2b\$10\$[./A-Za-z0-9]{53}$/ } },
];

for (const c of CASES) {
  test(`${c.slug}: real input gives the expected output`, async ({ page }) => {
    await page.goto(`/${c.slug}/`);
    for (const [id, v] of Object.entries(c.select ?? {})) await field(page, id).selectOption(v);
    for (const [id, v] of Object.entries(c.fill ?? {})) await field(page, id).fill(v);
    if (c.click) await page.locator('[data-run-button]').click();
    for (const [id, want] of Object.entries(c.expect)) {
      await expect(page.locator(`[data-out="${id}"]`)).toBeVisible();
      if (typeof want === 'string') await expect(out(page, id)).toHaveText(want, { useInnerText: false });
      else await expect(out(page, id)).toHaveText(want);
    }
    await expect(status(page)).not.toHaveClass(/is-error/);
  });
}

test('generators fill in at load, and Generate makes a new one', async ({ page }) => {
  await page.goto('/password-generator/');
  const pw = out(page, 'password');
  await expect(pw).toHaveText(/^.{20}$/);
  const first = await pw.textContent();
  await page.locator('[data-run-button]').click();
  await expect(pw).not.toHaveText(first!);
  await setRange(page, 'length', '32');
  await expect(pw).toHaveText(/^.{32}$/);
  await expect(page.locator('[data-range-out="length"]')).toHaveText('32');
  await expect(status(page)).toHaveText(/^About \d+ bits of entropy\.$/);

  await page.goto('/uuid-generator/');
  await expect(out(page, 'uuids')).toHaveText(/^([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\n?){5}$/);

  await page.goto('/lorem-ipsum-generator/');
  await expect(out(page, 'text')).toHaveText(/^Lorem ipsum dolor sit amet, consectetur adipiscing elit\./);
});

test('prefilled examples show their result at load: colour, cron, subnet, current time', async ({ page }) => {
  await page.goto('/color-converter/');
  await expect(out(page, 'formats')).toHaveText(/HEX\s*#0e6b52/);
  await field(page, 'color').fill('rgb(255 0 0 / 50%)');
  await expect(out(page, 'formats')).toHaveText(/HEX\s*#ff000080/);
  await expect(field(page, 'picker')).toHaveValue('#ff0000');

  await page.goto('/cron-expression-parser/');
  await expect(out(page, 'meaning')).toHaveText('Every 15 minutes, between 09:00 and 17:59, Monday through Friday.');
  await expect(out(page, 'next').locator('tr')).toHaveCount(5);

  await page.goto('/subnet-calculator/');
  await expect(out(page, 'details')).toHaveText(/Network\s*192\.168\.1\.0\/24/);

  await page.goto('/unix-timestamp-converter/');
  await expect(status(page)).toHaveText('Showing the current time.');
  await page.locator('[data-run-button]').click();
  await expect(field(page, 'input')).toHaveValue(/^\d{10}$/);
});

test('errors are explained, and clear when the input is fixed', async ({ page }) => {
  await page.goto('/json-to-yaml/');
  await field(page, 'text').fill('{"a":}');
  await expect(status(page)).toHaveText('Invalid JSON at line 1, column 6: Unexpected character "}".');
  await expect(status(page)).toHaveClass(/is-error/);
  await expect(page.locator('[data-out="result"]')).toBeHidden();
  await field(page, 'text').fill('{"a":1}');
  await expect(status(page)).toHaveText('');
  await expect(out(page, 'result')).toHaveText('a: 1');

  await page.goto('/xml-formatter/');
  await field(page, 'text').fill('<a><b></a>');
  await expect(status(page)).toHaveText(/^Not well-formed XML: /);
});

test('regex: highlights matches, and a catastrophic pattern is stopped without freezing the page', async ({ page }) => {
  await page.goto('/regex-tester/');
  await field(page, 'pattern').fill('(\\w+)@x');
  await field(page, 'text').fill('ada@x bo@x');
  await expect(status(page)).toHaveText('2 matches.');
  await expect(out(page, 'highlight').locator('mark')).toHaveText(['ada@x', 'bo@x']);
  await expect(out(page, 'groups')).toHaveText(/Group 1\s*ada/);

  await field(page, 'pattern').fill('(a+)+$');
  await field(page, 'text').fill(`${'a'.repeat(32)}b`);
  await expect(status(page)).toHaveText(/^This pattern took over a second/, { timeout: 5000 });
  expect(await page.evaluate(() => 1 + 1)).toBe(2); // the page still answers
  await field(page, 'pattern').fill('a');
  await expect(status(page)).toHaveText('32 matches.');
});

test('markdown preview is sandboxed: no script in it runs and it loads nothing from other sites', async ({ page }) => {
  await page.goto('/markdown-to-html/');
  await field(page, 'text').fill('# Safe\n\n![tracker](https://example.com/pixel.png)\n\n<script>parent.pwned = 1</script><img src="x:" onerror="parent.pwned = 2">');
  await expect(out(page, 'html')).toContainText('https://example.com/pixel.png'); // the copied HTML keeps the link
  const frame = page.locator('[data-out="preview"] iframe');
  await expect(frame).toHaveAttribute('sandbox', '');
  await expect(page.frameLocator('[data-out="preview"] iframe').locator('h1')).toHaveText('Safe');
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => (window as { pwned?: number }).pwned)).toBeUndefined();
});

test('copy puts the value on the clipboard and says so', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/slugify/');
  await field(page, 'text').fill('Hello World');
  await page.locator('[data-out="slug"] [data-copy]').click();
  await expect(page.locator('[data-out="slug"] .copied')).toHaveText('Copied');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('hello-world');

  await page.goto('/hash-generator/');
  await field(page, 'text').fill('abc');
  await page.getByRole('button', { name: 'Copy MD5' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('900150983cd24fb0d6963f7d28e17f72');
});

test('developer hub: chips filter the 29 tools by group', async ({ page }) => {
  await page.goto('/developer/');
  const visible = page.locator('#tools li:visible');
  await expect(visible).toHaveCount(29);
  for (const [name, n] of [['Security', 6], ['Encoding', 6], ['Convert', 6], ['Text', 5], ['Code', 6], ['All', 29]] as const) {
    await page.locator('.chips').getByRole('button', { name, exact: true }).click();
    await expect(visible).toHaveCount(n);
  }
});

test('homepage links to the hub from the Developer chip', async ({ page }) => {
  await page.goto('/');
  await page.locator('.chips').getByRole('button', { name: 'Developer', exact: true }).click();
  await expect(page.locator('#tools li:visible')).toHaveCount(5);
  await page.getByRole('link', { name: /All developer tools/ }).click();
  await expect(page).toHaveURL(/\/developer\/$/);
});
