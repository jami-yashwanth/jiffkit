# Tools Round 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add six browser-only tools to the existing site: Merge PDF, Split PDF, JSON formatter, Base64, JWT decoder and QR code generator. They share one page shell, and each category gets its own small engine and island.

**Architecture:** `src/tools.ts` becomes a discriminated union on `kind`. `ToolPage.astro` renders a per-kind component with a static fallback, and each kind's island loads only on its pages. Text transforms are pure sync functions, PDF runs pdf-lib in a Worker loaded on first interaction, and QR uses a tiny encoder.

**Tech Stack:** existing Astro static + vanilla TS + Vitest + Playwright; new deps: `pdf-lib`, `qrcode-generator`; dev-only: `jsqr` (QR round-trip tests). Fixture tool: `qpdf` (brew) for an encrypted PDF.

**Spec:** `docs/superpowers/specs/2026-10-24-tools-round-2-design.md` (and v1 spec `2026-10-23-image-tools-v1-design.md`, still binding)

## Global Constraints

- Nothing is uploaded. No request carries file bytes, file names, pasted JSON/Base64/JWT text or QR text.
- ≤ 15 KB JS (gzip) per tool page before interaction (`npm run check:budget` covers all 9 tool pages). pdf-lib and any library that would break the budget load via dynamic `import()` on first interaction.
- Spec §4 copy is binding and verbatim. Existing v1 image pages: no behaviour or copy changes.
- Visual system unchanged: `src/styles/tokens.css` tokens, one accent, 4/8 spacing, no shadows or gradients, system font.
- Mobile ≤ 600 px: single column, full-width buttons, output panes capped at 12 lines with internal scroll.
- Analytics: `convert_success {tool, count}` / `convert_error {tool, reason}` for file tools (PDF included); `tool_used {tool}` at most once per page view for text/QR on the first Copy or Download. Props never carry content.
- Node ≥ 22.23.4 (`.nvmrc` 24). All three Playwright engines must pass.

## Review Focus

1. **Base64 pasted with line breaks or spaces** (from email/MIME): decode ignores whitespace. Owned by Task 3.
2. **JWT pasted with a `Bearer ` prefix or surrounding whitespace/quotes**: stripped, then decoded. Owned by Task 3.
3. **JSON with a leading BOM or trailing whitespace**: formats normally; the error line/column ignores the BOM. Owned by Task 3.
4. **QR text with emoji or non-Latin characters**: encoded as UTF-8 byte mode and decodes back identically. Owned by Task 5.
5. **The same PDF added twice to Merge**: allowed; the result has both copies' pages in order. Owned by Task 6.

---

### Task 1: Registry becomes a discriminated union

**Files:**
- Modify: `src/tools.ts`, `tests/unit/tools.test.ts`
- Modify: any image-only consumer that reads image fields, to narrow on `kind` (`src/layouts/ToolPage.astro`, `src/ui/dropzone.ts`, `src/engine/convert.ts` via `getTool`)

**Interfaces:**
- Produces:
```ts
export type ToolSlug = 'heic-to-jpg'|'compress-image'|'webp-to-jpg'|'merge-pdf'|'split-pdf'|'json-formatter'|'base64-encode-decode'|'jwt-decoder'|'qr-code-generator';
export type Category = 'image'|'pdf'|'developer'|'qr';
export type ImageSlug = 'heic-to-jpg'|'compress-image'|'webp-to-jpg';
interface ToolBase { slug: ToolSlug; category: Category; title: string; description: string; h1: string; subhead: string; howTo: [string,string,string]; faq: {q:string;a:string}[]; related: ToolSlug[] }
export type ImageTool = ToolBase & { kind:'image'; slug: ImageSlug; accepts: InType[]; acceptAttr: string; outputs: OutFormat[]|'same'; defaults: {format?: OutFormat; quality: number}; emptyCopy: string };
export type PdfTool  = ToolBase & { kind:'pdf'; op:'merge'|'split' };
export type TextTool = ToolBase & { kind:'text'; transform:'json'|'base64'|'jwt' };
export type QrTool   = ToolBase & { kind:'qr' };
export type Tool = ImageTool|PdfTool|TextTool|QrTool;
export const CATEGORY_LABEL: Record<Category,string>; // { image:'Image', pdf:'PDF', developer:'Developer', qr:'QR code' }
export function getTool(slug: ToolSlug): Tool;
export function getImageTool(slug: ImageSlug): ImageTool;   // image code uses this
export function toolForType(t: InType): ImageSlug;          // unchanged behaviour
```

- [ ] **Step 1: Write failing tests** (extend `tools.test.ts`):
  - exactly 9 unique slugs, equal to the `ToolSlug` union
  - every `related` slug exists and isn't the tool itself
  - each tool has 3 how-to steps and 4–5 FAQs, `title` ≤ 60 chars and `description` 120–160 chars
  - kinds: merge-pdf → `pdf`/`merge`, split-pdf → `pdf`/`split`, json-formatter → `text`/`json`, base64-encode-decode → `text`/`base64`, jwt-decoder → `text`/`jwt`, qr-code-generator → `qr`
  - categories: image tools → `image`, pdf → `pdf`, text → `developer`, qr → `qr`
  - all existing image assertions still pass unchanged
- [ ] **Step 2:** Run `npx vitest run tests/unit/tools.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement. H1s come verbatim from spec §2. Write real titles, descriptions, subheads, how-to steps and FAQs: privacy-forward, honest, no placeholders. Related: PDF tools link each other + compress-image; dev tools link each other + qr; qr links json-formatter, base64-encode-decode and heic-to-jpg. Image tools also get one cross-link (heic-to-jpg → merge-pdf, compress-image → merge-pdf, webp-to-jpg → qr-code-generator) in addition to their existing two.
- [ ] **Step 4:** Narrow image-only consumers with `getImageTool`. Run `npm test && npm run typecheck`. Expected: PASS, 0 errors.
- [ ] **Step 5:** Commit `feat: tool registry supports pdf, text and qr kinds`.

### Task 2: Page shell, per-kind components, homepage by category

**Files:**
- Modify: `src/layouts/ToolPage.astro` (shell + per-kind switch; the image markup moves verbatim into `src/components/ImageTool.astro`)
- Create: `src/components/ImageTool.astro`, `src/components/PdfTool.astro`, `src/components/TextTool.astro`, `src/components/QrTool.astro` (static, no-JS fallbacks with the spec §4 empty states; each sets a `data-kind` mount)
- Modify: `src/pages/[tool].astro`, `src/pages/index.astro`, `src/layouts/Base.astro` (header brand text), `scripts/check-budget.mjs` (must cover all tool pages), `tests/unit/build-output.test.ts`, `tests/e2e/home.spec.ts`

**Interfaces:**
- Consumes: Task 1 types.
- Produces: mounts the islands will attach to (Tasks 4, 5, 7):
  - PDF: `<div data-kind="pdf" data-tool=<slug> data-op="merge|split">` containing the drop zone (label + `<input type=file accept="application/pdf,.pdf">`, `multiple` only for merge), the privacy line, and empty `[data-results]` / `[data-status]` regions
  - Text: `<div data-kind="text" data-tool data-transform>` containing the §4 inputs/outputs/buttons, initially disabled where §4 says
  - QR: `<div data-kind="qr" data-tool>` containing the input, the placeholder square with "Your QR code appears here.", the disabled download buttons, a collapsed Options `<details>`, and the static-code line

- [ ] **Step 1: Write failing tests:**
  - build-output: all 9 tool pages exist, each with one `<h1>` = registry H1, title, meta, canonical and FAQPage JSON-LD; each new page contains its kind's mount and the exact §4 empty-state copy; image pages' HTML for the mount is unchanged
  - the homepage has 4 category headings in the order Image, PDF, Developer, QR code, listing every tool under its category
  - the sitemap lists 9 tool URLs
  - home.spec: the filter still works across categories, and a category heading hides when all its tools are filtered out
- [ ] **Step 2:** Run `npx vitest run tests/unit/build-output.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement. Ruling (homepage and brand copy, which the spec leaves open):
  - Homepage `<title>`: "Private Online Tools - Image, PDF and Developer Tools"
  - meta description: "Free tools that run on your device: convert images, merge and split PDFs, format JSON, decode JWTs and make QR codes. Nothing is uploaded."
  - H1: "Tools that never upload your files"
  - subhead: "Convert images, merge PDFs, format JSON and make QR codes right in your browser. Free, no sign-up."
  - filter placeholder: "Try HEIC, PDF, JSON or QR"; no-match copy: `No tool matches that. Try "HEIC", "PDF", "JSON" or "QR".`
  - Header brand text: "Private tools".
- [ ] **Step 4:** Run `npm test`, `npm run typecheck`, `npm run build && npm run check:budget`, `npx playwright test`. Expected: all PASS; v1 E2E unchanged and green.
- [ ] **Step 5:** Commit `feat: shared tool shell with per-kind components and categorised homepage`.

### Task 3: Text transforms (pure functions)

**Files:**
- Create: `src/text/json.ts`, `src/text/base64.ts`, `src/text/jwt.ts`, `src/text/relative-time.ts`
- Test: `tests/unit/text-json.test.ts`, `tests/unit/text-base64.test.ts`, `tests/unit/text-jwt.test.ts`

**Interfaces:**
- Produces:
```ts
// json.ts
export type JsonResult = { ok: true; output: string } | { ok: false; line: number; column: number; message: string };
export function formatJson(input: string, indent: 2 | 4 | '\t'): JsonResult;
export function minifyJson(input: string): JsonResult;
// base64.ts
export function encodeBase64(text: string, opts: { urlSafe: boolean }): string;
export function decodeBase64(b64: string, opts: { urlSafe: boolean }): { ok: true; text: string } | { ok: false };
// jwt.ts
export interface Claim { date: Date; relative: string }
export type JwtResult = { ok: true; header: unknown; payload: unknown; claims: { exp?: Claim & { expired: boolean }; iat?: Claim; nbf?: Claim } } | { ok: false };
export function decodeJwt(token: string, now: Date): JwtResult;
// relative-time.ts
export function relativeTime(target: Date, now: Date): string; // "in 2 hours", "3 days ago", "just now"
```

- [ ] **Step 1: Write failing tests:**
  - **JSON:**
    - `formatJson('{"a":1}', 2).output === '{\n  "a": 1\n}'`
    - tab indent uses `\t`
    - `minifyJson('{ "a" : [1, 2] }').output === '{"a":[1,2]}'`
    - `formatJson('{\n  "a": 1,\n}', 2)` → `ok:false, line:3, column:1`
    - `'{"a" 1}'` → `line 1, column 6`
    - a BOM prefix + trailing `\n  ` formats OK (Review Focus 3)
    - the message is non-empty and engine-independent (computed by our own scanner, not V8's text)
  - **Base64:**
    - `encodeBase64('héllo 👋', {urlSafe:false})` round-trips via `decodeBase64`
    - `encodeBase64('??>', {urlSafe:true})` contains no `+`, `/` or `=`
    - `decodeBase64('aGVs\nbG8=\n', …)` → `'hello'` (Review Focus 1)
    - `decodeBase64('###', …)` → `ok:false`
    - an invalid UTF-8 byte sequence → `ok:false`
  - **JWT** (`now = 2026-10-24T12:00:00Z`):
    - decodes a known HS256 sample's header `{alg:'HS256',typ:'JWT'}` and payload
    - `exp` 2 h ahead → `relative 'in 2 hours'`, `expired false`
    - `exp` 3 days back → `'3 days ago'`, `expired true`
    - `'Bearer <token>'`, `'  "<token>"  '` → ok (Review Focus 2)
    - `'abc'`, `'a.b'`, `'a.b.c'` with non-JSON parts → `ok:false`
    - a payload with Unicode decodes correctly
  - **relativeTime:** 30 s → "just now"; 90 min ahead → "in 2 hours" (round half up to the largest unit); 1 day exactly → "1 day ago"; singular and plural forms.
- [ ] **Step 2:** Run `npx vitest run tests/unit/text-*.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement. JSON: on `JSON.parse` failure, find the error offset with a small validating scanner (strings with escapes, numbers, literals, structure) that returns the first bad offset and a message such as "unexpected comma", "unexpected end of input", "expected ':'" or "unterminated string". Convert the offset to a 1-based line/column. Base64: strip whitespace, map URL-safe characters, pad, `atob`, then `TextDecoder('utf-8', { fatal: true })`.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit `feat: json, base64 and jwt transforms`.

### Task 4: Text tools UI (3 pages)

**Files:**
- Create: `src/ui/text.ts`, `src/ui/clipboard.ts`
- Modify: `src/components/TextTool.astro` (enhancement hooks only), `src/styles/tokens.css` (textarea/output/pane styles within the existing system)
- Test: `tests/e2e/text.spec.ts`

**Interfaces:**
- Consumes: Task 3 functions; Task 2 `data-kind="text"` mounts.
- Produces: `mount(el: HTMLElement): void` (text.ts); `copyText(s: string): Promise<boolean>` (clipboard.ts, falling back to a hidden-textarea copy); and an event hook `onUsed(cb)` for Task 8.

- [ ] **Step 1: Write failing E2E tests** (all engines; exact §4 copy):
  - **JSON:**
    - Format/Minify output
    - the indent option
    - the invalid message "Invalid JSON at line 3, column 1: …" and the error line highlighted (a `.error-line` element or `aria-invalid` with a marked line)
    - buttons disabled when empty
    - Copy shows "Copied"
    - over 5 MB input shows "Large file: formatting may take a moment."
  - **Base64:**
    - typing text updates Base64 and vice versa
    - the URL-safe toggle
    - invalid shows "This isn't valid Base64." and the Text box keeps its last good value
  - **JWT:**
    - sample token → Header/Payload panes, with Copy on each
    - the always-visible "Signature not verified…" line
    - an expired token shows "Expired … ago" in the error colour
    - malformed shows "This doesn't look like a JWT. A JWT has three parts separated by dots."
  - **Mobile 390:** output panes ≤ 12 lines tall with scroll; buttons full width.
- [ ] **Step 2:** Run `npx playwright test tests/e2e/text.spec.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement (~150 lines). Debounce live updates at 150 ms. Never write user text with `innerHTML`.
- [ ] **Step 4:** Run the E2E tests, `npm run build && npm run check:budget`, and the full `npx playwright test`. Expected: PASS.
- [ ] **Step 5:** Commit `feat: json formatter, base64 and jwt decoder pages`.

### Task 5: QR code generator

**Files:**
- Create: `src/qr/qr.ts`, `src/ui/qr.ts`
- Modify: `src/components/QrTool.astro`, `src/styles/tokens.css`
- Test: `tests/unit/qr.test.ts`, `tests/e2e/qr.spec.ts`

**Interfaces:**
- Consumes: Task 2 `data-kind="qr"` mount; `copyText` isn't needed.
- Produces:
```ts
export type Level = 'L'|'M'|'Q'|'H';
export type QrResult = { ok: true; size: number; isDark(r: number, c: number): boolean } | { ok: false; max: number };
export function makeQr(text: string, level: Level): QrResult;        // UTF-8 byte mode
export function toSvg(qr: Extract<QrResult,{ok:true}>, px: number): string; // includes a 4-module quiet zone
export function maxBytes(level: Level): number;                       // byte-mode capacity at version 40
```

- [ ] **Step 1: Write failing unit tests:**
  - `makeQr('https://example.com', 'M')` → `ok`; rendering to RGBA and decoding with `jsqr` returns the input
  - `'naïve 👋 こんにちは'` round-trips (Review Focus 4)
  - `maxBytes('L') === 2953`
  - a string of 2954 ASCII bytes at L → `{ok:false, max:2953}`
  - `toSvg` returns a string starting `<svg` with `viewBox`, `shape-rendering="crispEdges"` and a quiet zone
- [ ] **Step 2: Write failing E2E tests:**
  - the empty placeholder and copy
  - typing updates the preview live
  - **Download PNG** downloads `qr-code.png` with PNG magic bytes at the chosen size (512 default; 1024 option)
  - **Download SVG** downloads `qr-code.svg` that parses as SVG
  - too long shows "Too much text for a QR code (2,953 characters max at level L)." (the count uses `toLocaleString('en-US')`)
  - options: level and size
  - the static-code line is visible
- [ ] **Step 3:** Run both test files. Expected: FAIL.
- [ ] **Step 4:** Implement with `qrcode-generator` (`typeNumber 0` = auto, `addData(text, 'Byte')` with a UTF-8 `stringToBytes`). The preview is SVG. PNG is drawn on a temporary canvas at the chosen size (≤ 1024 px). If the library pushes the page over 15 KB, dynamic-import it on first focus or keystroke of the input.
- [ ] **Step 5:** Run the unit tests, E2E tests, budget check and full E2E. Expected: PASS.
- [ ] **Step 6:** Commit `feat: qr code generator`.

### Task 6: PDF engine (worker)

**Files:**
- Create: `src/pdf/ranges.ts`, `src/pdf/ops.ts`, `src/pdf/worker.ts`, `src/pdf/client.ts`, `src/pdf/types.ts`
- Modify: `scripts/make-fixtures.sh` (PDF fixtures; needs `qpdf`; add it to the tool check and the brew hint, plus `.github/workflows/ci.yml` brew line)
- Create fixtures (committed, small): `tests/fixtures/pdf/three-pages.pdf`, `two-pages.pdf`, `encrypted.pdf` (qpdf 256-bit, user password), `not-a.pdf` (text), `truncated.pdf`
- Test: `tests/unit/pdf-ranges.test.ts`, `tests/unit/pdf-ops.test.ts`, `tests/unit/pdf-client.test.ts`

**Interfaces:**
- Produces:
```ts
// types.ts
export type PdfFail = 'encrypted' | 'corrupt' | 'codec-load';
export interface PdfOut { name: string; bytes: Uint8Array; pages: number }
// ranges.ts
export function parseRanges(input: string, pageCount: number): [number, number][] | RangeError;
export function rangesLabel(ranges: [number, number][]): string; // [[1,3],[5,5]] → "1-3-5"
// ops.ts (pure, Node-testable)
export async function pageCount(bytes: ArrayBuffer): Promise<number>;                      // throws PdfError(reason)
export async function merge(files: ArrayBuffer[]): Promise<PdfOut>;                        // name 'merged.pdf'
export async function split(bytes: ArrayBuffer, base: string, mode: { kind: 'every' } | { kind: 'ranges'; ranges: [number, number][] }): Promise<PdfOut[]>;
export class PdfError extends Error { reason: PdfFail }
// client.ts: same sequential/crash-safe pattern as src/engine/client.ts
export function createPdfEngine(workerFactory?: () => Worker): { count(id: string, file: File): Promise<number>; merge(files: File[]): Promise<PdfOut>; split(file: File, mode: ...): Promise<PdfOut[]> } // rejections are PdfError
```

- [ ] **Step 1:** Extend `make-fixtures.sh` and generate the PDF fixtures. Use pdf-lib via a small `scripts/make-pdf-fixtures.mjs` for the plain PDFs, and `qpdf --encrypt user owner 256 --` for `encrypted.pdf`. Commit them.
- [ ] **Step 2: Write failing tests:**
  - **parseRanges** (count 24):
    - `'1-3, 5'` → `[[1,3],[5,5]]`
    - `'7-'` → `[[7,24]]`; `'-4'` → `[[1,4]]`
    - `' 5 , 5 '` → `[[5,5]]`
    - `'3-1'` → RangeError; `'0'` → RangeError; `'25'` → RangeError; `'a'` → RangeError; `''` → RangeError
    - overlapping `'1-5, 3-7'` → `[[1,7]]`
  - **rangesLabel:** `[[1,3],[5,5]]` → `'1-3-5'`
  - **ops:**
    - `pageCount(three) === 3`
    - `merge([three, two])` → 5 pages, page order verifiable through per-page text or size marks put in by the fixture script
    - `merge([two, two])` → 4 pages (Review Focus 5)
    - `split(three, 'report', {kind:'every'})` → names `report-page-1.pdf` … `report-page-3.pdf`, 1 page each
    - `split(three, 'report', {kind:'ranges', ranges:[[1,2]]})` → `report-pages-1-2.pdf`, 2 pages
    - encrypted → `PdfError('encrypted')`; `not-a.pdf` and `truncated.pdf` → `PdfError('corrupt')`
  - **client:** sequential jobs; a worker crash → `codec-load` before the first message (mirror `src/engine/client.ts` semantics); a fresh worker afterwards
- [ ] **Step 3:** Run `npx vitest run tests/unit/pdf-*.test.ts`. Expected: FAIL.
- [ ] **Step 4:** Implement with `pdf-lib`: `PDFDocument.load(bytes)` (encrypted → catch `EncryptedPDFError` → `encrypted`), `copyPages`, `save()`. Dynamic-import pdf-lib inside the worker. The worker uses `{kind:'job', …}` messages like the image worker.
- [ ] **Step 5:** Run the tests, `npm test` and typecheck. Expected: PASS.
- [ ] **Step 6:** Commit `feat: pdf merge/split engine in a worker`.

### Task 7: PDF tools UI (2 pages)

**Files:**
- Create: `src/ui/pdf.ts`
- Modify: `src/components/PdfTool.astro`, `src/styles/tokens.css`, `src/ui/zip.ts` (reuse `zipFiles`), `src/ui/format.ts` (reuse `formatBytes`, `middleTruncate`)
- Test: `tests/e2e/pdf.spec.ts`

**Interfaces:**
- Consumes: Task 6 `createPdfEngine`, `parseRanges`, `rangesLabel`; Task 2 mounts.
- Produces: `mount(el)`, plus the analytics hooks used by Task 8: `onSuccess(count)` and `onError(reason)` callbacks.

- [ ] **Step 1: Write failing E2E tests** (exact §4 copy, all engines):
  - **Merge:**
    - empty state; loading state with the measured size (a delayed route)
    - one file shows "Add at least one more PDF to merge."
    - a list row shows "3 pages"; ↑ ↓ ✕ reorder/remove with aria-labels
    - **Merge PDFs** → "Merging 2 files…" → done `merged.pdf` · "5 pages · <size>"; the download has `%PDF` magic and 5 pages (parse it with pdf-lib in the test)
    - **Start over** clears
    - encrypted shows the password copy
    - `not-a.pdf` shows the damaged copy
    - codec load failed (abort the pdf-lib chunk) shows the copy, and **Try again** works
  - **Split:**
    - empty; loaded `three-pages.pdf` · "3 pages"
    - every page → **Download all (ZIP)** · "3 files"; the ZIP holds the 3 named PDFs
    - extract `1-2` → `three-pages-pages-1-2.pdf` with 2 pages
    - an invalid range `9` → "Pages must be between 1 and 3, like 1-3, 5."
    - encrypted and damaged copy
  - **Mobile 390:** full-width buttons, single column.
- [ ] **Step 2:** Run `npx playwright test tests/e2e/pdf.spec.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement. Preload the PDF engine on drop-zone hover/focus. Measure the engine's gzip size at build time (as `CODEC_SIZE` for images) and pass it via `data-codec-size`. Revoke object URLs on Start over.
- [ ] **Step 4:** Run the E2E tests, the budget check and the full `npx playwright test`. Expected: PASS.
- [ ] **Step 5:** Commit `feat: merge pdf and split pdf pages`.

### Task 8: Analytics + privacy coverage

**Files:**
- Modify: `src/ui/pdf.ts`, `src/ui/text.ts`, `src/ui/qr.ts` (event calls), a shared `src/ui/track.ts` (move `track` out of dropzone.ts, extended to the `tool_used` event name)
- Modify: `tests/e2e/privacy.spec.ts`

**Interfaces:**
- Produces: `track(name: 'convert_success'|'convert_error'|'tool_used', props: Record<string,string|number>): void`, used by every island.

- [ ] **Step 1: Write failing tests** (privacy.spec, Plausible stubbed as today):
  - merge 2 PDFs → exactly one `convert_success {tool:'merge-pdf', count:1}`; split every page of the 3-page PDF → `{tool:'split-pdf', count:3}`; encrypted → `convert_error {tool:'merge-pdf', reason:'encrypted'}`; an invalid range → `convert_error {reason:'range'}`
  - text/QR: typing never fires; the first Copy (or Download) fires one `tool_used {tool}`; a second Copy fires nothing
  - needles: pasted JSON `{"secret":"s3cr3t-json"}`, the sample JWT, QR text `qr-needle-123`, a fixture PDF's first 64 bytes and the file name `three-pages`. None appears in any request URL or body on any page.
  - props keys are only `tool`, `count`, `reason`
- [ ] **Step 2:** Run `npx playwright test tests/e2e/privacy.spec.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the full `npx playwright test`. Expected: PASS.
- [ ] **Step 5:** Commit `feat: analytics and privacy coverage for new tools`.

### Task 9: Visual pass + screenshots for new pages

**Files:**
- Modify: `src/styles/tokens.css` (and components, styling only)
- Modify: `tests/e2e/screenshots.spec.ts` (add every §4 state of the 6 new pages + the categorised homepage, at 390×844 and 1280×800)

- [ ] **Step 1:** Run `impeccable` critique against the existing approved system. Only bring the new pages in line with it; don't restyle v1.
- [ ] **Step 2:** Capture screenshots: `npx playwright test tests/e2e/screenshots.spec.ts --project=chromium`. Expected: the new PNGs in `review/screenshots/`.
- [ ] **Step 3:** Look at every new screenshot, critique it honestly, fix and re-capture. **The controller then gets the owner's approval.**
- [ ] **Step 4:** Run the full gate (`npm test`, `npm run typecheck`, `npm run build && npm run check:budget`, `npx playwright test`). Commit `style: visual pass for round 2 tools`.
