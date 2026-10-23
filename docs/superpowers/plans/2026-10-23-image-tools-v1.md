# Image Tools v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a static site with a homepage and three in-browser image tools (HEIC→JPG, Compress image, WebP→JPG/PNG) where no file ever leaves the device.

**Architecture:** Astro generates one static HTML page per entry in a typed tool registry. A ~5 KB vanilla-TS island handles file intake and UI states, and sends jobs to a Web Worker. The worker runs a pure `convert()` pipeline (sniff → decode → orient/flatten/downscale → encode) on lazily loaded WASM codecs, so it is unit-testable in Node.

**Tech Stack:** Astro 5 (static output), TypeScript strict, `@jsquash/jpeg`, `@jsquash/png`, `@jsquash/oxipng`, `@jsquash/webp`, `libheif-js`, `fflate`, `@astrojs/sitemap`, Vitest, Playwright, `exifr` (dev only), Cloudflare Pages, Plausible.

**Spec:** `docs/superpowers/specs/2026-10-23-image-tools-v1-design.md`

## Global Constraints

- Every file is processed on the user's device. No request ever carries file bytes, file names or pixel data.
- ≤ 15 KB JavaScript (gzip) on a tool page before a file is dropped. Codecs load only on drop-zone hover/focus (preload) or drop.
- Lighthouse performance ≥ 95 (mobile); LCP < 1.5 s on fast-4G.
- Full-size images never pass through a main-thread `<canvas>`. Worker `OffscreenCanvas` / `createImageBitmap` are allowed only for images ≤ 16 MP.
- The worker processes one file at a time.
- Output is always encoded from raw pixels, so no EXIF/GPS reaches the output. The UI shows "Location data removed".
- Defaults: HEIC→JPG quality 85; Compress quality 75 (JPG/WebP); PNG lossless via OxiPNG; WebP→ output JPG.
- Too-large cap: 50 MP default (constant `MAX_MEGAPIXELS`); downscale target 24 MP (`DOWNSCALE_MEGAPIXELS`).
- UI copy is exactly as written in spec §5. Visual system: one typeface pair, one accent colour, 4/8 px spacing, no shadows or gradients.
- Analytics: Plausible events `convert_success {tool, count}` and `convert_error {tool, reason}` only.

## Review Focus

1. **Zero-byte or non-image file** (e.g. a `.heic` that is really a text file): expect the `corrupt` or `wrong-type` row, never a hang. Owned by Task 2 and Task 4.
2. **Extension disagrees with content** (an iPhone HEIC renamed `.jpg` dropped on HEIC→JPG): sniffing by magic bytes means it converts normally. Owned by Task 2.
3. **User drops more files while a batch is running:** new files join the queue, the counter updates ("Converting 4 of 15"), nothing restarts. Owned by Task 7.
4. **HEIC with multiple images** (Live Photo or burst container): convert the primary image only. Owned by Task 3.
5. **Unusual PNGs** (16-bit, greyscale, palette) given to Compress: output stays PNG, decodes, and has the same dimensions. Owned by Task 4.

---

### Task 1: Scaffold + tool registry

**Files:**
- Create: `package.json`, `astro.config.mjs`, `tsconfig.json`, `vitest.config.ts`, `playwright.config.ts`, `.gitignore`
- Create: `src/tools.ts`
- Test: `tests/unit/tools.test.ts`

**Interfaces:**
- Produces:
```ts
export type ToolSlug = 'heic-to-jpg' | 'compress-image' | 'webp-to-jpg';
export type OutFormat = 'jpg' | 'png' | 'webp';
export type InType = 'heic' | 'jpg' | 'png' | 'webp';
export interface Tool {
  slug: ToolSlug; title: string; description: string; h1: string; subhead: string;
  accepts: InType[]; acceptAttr: string;           // value for <input accept>
  outputs: OutFormat[] | 'same';                   // 'same' = keep input format
  defaults: { format?: OutFormat; quality: number };
  emptyCopy: string;                                // e.g. "Drop HEIC photos here"
  howTo: [string, string, string]; faq: { q: string; a: string }[]; related: ToolSlug[];
}
export const TOOLS: Tool[];
export function getTool(slug: ToolSlug): Tool;
export function toolForType(t: InType): ToolSlug;   // used by the wrong-type link
```

- [ ] **Step 1:** Run `npm create astro@latest . -- --template minimal --typescript strict --no-install --no-git`, then `npm i` and `npm i -D vitest @playwright/test exifr`. Set `output: 'static'`, `site: 'https://web-tools.pages.dev'` and the sitemap integration in `astro.config.mjs`.
- [ ] **Step 2: Write the failing test** `tests/unit/tools.test.ts`:
  - slugs are unique and exactly the 3 `ToolSlug`s
  - every `related` slug exists and is not the tool itself
  - each tool has 4–5 FAQ entries and 3 how-to steps
  - `title` ≤ 60 chars and `description` 120–160 chars
  - `getTool('heic-to-jpg').defaults.quality === 85`; `getTool('compress-image').defaults.quality === 75`; `getTool('webp-to-jpg').defaults.format === 'jpg'`
  - `getTool('heic-to-jpg').acceptAttr === '.heic,.heif,image/heic,image/heif'`
  - `toolForType('png') === 'compress-image'`; `toolForType('heic') === 'heic-to-jpg'`
- [ ] **Step 3:** Run `npx vitest run tests/unit/tools.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 4:** Implement `src/tools.ts` with real copy (real FAQ answers, no placeholders).
- [ ] **Step 5:** Run the test. Expected: PASS.
- [ ] **Step 6:** Commit `feat: scaffold Astro project and tool registry`.

### Task 2: Test fixtures + file sniffing

**Files:**
- Create: `scripts/make-fixtures.sh`, `tests/fixtures/*` (committed output)
- Create: `src/engine/sniff.ts`
- Test: `tests/unit/sniff.test.ts`

**Interfaces:**
- Produces:
```ts
export interface Sniffed { type: InType | 'unknown'; width?: number; height?: number; animated?: boolean }
export async function sniff(file: Blob): Promise<Sniffed>;   // reads first 64 KB only
```

- [ ] **Step 1:** Write `scripts/make-fixtures.sh` (macOS; needs `brew install exiftool webp`). Use `sips` and `exiftool` to produce:
  - `iphone-12mp.heic` (4032×3024, with GPS tags)
  - `iphone-48mp.heic` (8064×6048)
  - `rotated-6.heic` (Orientation=6, stored 400×300)
  - `multi.heic` (2 images; primary 400×300)
  - `photo.jpg` (with GPS), `lossy.webp`, `lossless.webp`, `animated.webp` (2 frames via `img2webp`)
  - `alpha.png` and `alpha.webp` (fully transparent left half), `png16.png`, `grey.png`, `palette.png`
  - `truncated.heic` (first 2 KB of the 12 MP file), `empty.heic` (0 bytes), `text-as.heic` (ASCII text)
  - `heic-named.jpg` (a copy of `iphone-12mp.heic`)

  Run it and commit `tests/fixtures/`. Keep 48 MP out of git if it's > 10 MB; generate it in CI instead.
- [ ] **Step 2: Write failing tests:**
  - `sniff(iphone-12mp.heic)` → `{type:'heic', width:4032, height:3024}`
  - `photo.jpg` → `jpg`; `alpha.png` → `png`; `lossy.webp` → `webp` with `animated:false`; `animated.webp` → `animated:true`
  - `heic-named.jpg` → `heic`
  - `empty.heic` and `text-as.heic` → `unknown`
- [ ] **Step 3:** Run `npx vitest run tests/unit/sniff.test.ts`. Expected: FAIL.
- [ ] **Step 4:** Implement `sniff.ts`:
  - **Type** from magic bytes: JPEG `FF D8 FF`; PNG `89 50 4E 47`; WebP `RIFF....WEBP`; HEIC `ftyp` box with brand in {`heic`,`heix`,`mif1`,`msf1`,`hevc`}.
  - **Dimensions:** JPEG SOF0/2, PNG IHDR, WebP VP8/VP8L/VP8X, HEIC `ispe` box of the primary item (best effort; undefined if not found in 64 KB).
  - **Animated:** VP8X flag bit `0x02`.
- [ ] **Step 5:** Run the tests. Expected: PASS.
- [ ] **Step 6:** Commit `feat: add fixtures and magic-byte sniffing`.

### Task 3: Decoding

**Files:**
- Create: `src/engine/codecs.ts`, `src/engine/decode.ts`
- Test: `tests/unit/decode.test.ts`

**Interfaces:**
- Consumes: `InType` (Task 1).
- Produces:
```ts
export interface Pixels { data: Uint8ClampedArray; width: number; height: number; orientation: number /*EXIF 1–8*/; hasAlpha: boolean }
export async function decode(bytes: ArrayBuffer, type: InType): Promise<Pixels & { firstFrameOnly?: boolean }>;
export class CodecLoadError extends Error {}
export class DecodeError extends Error {}
// codecs.ts — memoised lazy loaders; each throws CodecLoadError on fetch/instantiate failure
export const load: { heif(): Promise<unknown>; jpeg(): Promise<unknown>; png(): Promise<unknown>; oxipng(): Promise<unknown>; webp(): Promise<unknown> };
export function preload(types: InType[]): void;
```

- [ ] **Step 1: Write failing tests** (Node; init each codec from its `node_modules` `.wasm` file via fs):
  - 12 MP HEIC → 4032×3024, `data.length === 4032*3024*4`
  - `rotated-6.heic` → stored dims 400×300 with `orientation === 6`
  - `multi.heic` → 400×300 (primary)
  - `photo.jpg` / `lossless.webp` → expected dims
  - `alpha.png` → `hasAlpha === true`; `png16.png`, `grey.png` and `palette.png` decode to RGBA8
  - `truncated.heic` → rejects with `DecodeError`
- [ ] **Step 2:** Run `npx vitest run tests/unit/decode.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement:
  - `codecs.ts`: dynamic `import()` per codec, memoised promise; reset the memo on failure so **Try again** works.
  - `decode.ts`: HEIC via `libheif-js/wasm-bundle`, using the primary image handle. Read the orientation from EXIF (`exifr.orientation` is dev-only, so parse the EXIF orientation tag inline for JPEG/HEIC). jSquash decoders for the other types.
  - **Animated WebP:** if the jSquash decoder rejects it, fall back to `createImageBitmap` in the worker (browser only) and set `firstFrameOnly`. This branch is covered by an E2E test in Task 7, not by unit tests.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit `feat: lazy codecs and decoding`.

### Task 4: Pixel ops + `convert()` pipeline

**Files:**
- Create: `src/engine/pixels.ts`, `src/engine/convert.ts`, `src/engine/types.ts`
- Test: `tests/unit/pixels.test.ts`, `tests/unit/convert.test.ts`

**Interfaces:**
- Consumes: `sniff` (Task 2), `decode`, `load`, the error classes (Task 3), `getTool` (Task 1).
- Produces (`types.ts`, copied from spec §3):
```ts
export type Note = 'gps-removed'|'first-frame-only'|'already-optimized'|'transparency-filled';
export type FailReason = 'wrong-type'|'corrupt'|'too-large'|'oom'|'codec-load';
export interface Job { id: string; file: File; tool: ToolSlug; options: { format?: OutFormat; quality?: number; downscaleTo?: number } }
export interface Done { id: string; blob: Blob; name: string; width: number; height: number; inBytes: number; outBytes: number; notes: Note[] }
export interface Failed { id: string; reason: FailReason; detectedType?: string; megapixels?: number }
export interface Progress { id: string; stage: 'loading-codec'|'decoding'|'encoding'; loaded?: number; total?: number }
export const MAX_MEGAPIXELS = 50; export const DOWNSCALE_MEGAPIXELS = 24;
// pixels.ts
export function applyOrientation(p: Pixels): Pixels;          // returns orientation 1
export function flattenOnWhite(p: Pixels): Pixels;            // hasAlpha false
export function downscaleTo(p: Pixels, megapixels: number): Pixels;  // keeps aspect ratio, box/area filter
// convert.ts
export async function convert(job: Job, onProgress?: (p: Progress) => void): Promise<Done | Failed>;
export function outputName(inputName: string, format: OutFormat): string;
```

- [ ] **Step 1: Write failing pixel tests:**
  - orientation 6 on 400×300 → 300×400, with the top-left source pixel at the top-right
  - orientations 3 and 8 checked the same way
  - `flattenOnWhite` turns a fully transparent pixel into `255,255,255,255`
  - `downscaleTo` on 8064×6048 at 24 MP → width × height ≤ 24,000,000, aspect ratio within 0.5 %
- [ ] **Step 2: Write failing `convert` tests:**
  - `heic-to-jpg` on the 12 MP fixture → JPEG blob (magic `FF D8`), 4032×3024, notes include `gps-removed`, and `exifr.gps(blob)` returns undefined
  - `rotated-6.heic` → 300×400
  - `alpha.png` on `webp-to-jpg` → `wrong-type` with `detectedType:'png'`
  - `lossless.webp` with `format:'png'` → PNG blob
  - `alpha.webp` → JPG → note `transparency-filled`
  - `compress-image` on an already-tiny PNG → returns the original bytes with `already-optimized` and `outBytes === inBytes`
  - `compress-image` on `photo.jpg` at q75 → `outBytes < inBytes`, still JPEG
  - `png16`, `grey` and `palette` PNGs through Compress → PNG with the same dims
  - 48 MP HEIC → `too-large` with `megapixels: 49`; the same job with `downscaleTo: 24` → Done ≤ 24 MP
  - `empty.heic` / `truncated.heic` → `corrupt`; `text-as.heic` → `wrong-type`
  - `outputName('IMG_2041.heic','jpg') === 'IMG_2041.jpg'`; `outputName('a.b.webp','png') === 'a.b.png'`
- [ ] **Step 3:** Run `npx vitest run tests/unit/pixels.test.ts tests/unit/convert.test.ts`. Expected: FAIL.
- [ ] **Step 4:** Implement. The `convert` order: 0-byte file → `corrupt` → sniff → type check against `tool.accepts` → megapixel check (skipped if `downscaleTo` is set) → decode → `applyOrientation` → `downscaleTo`? → `flattenOnWhite` if output is JPG and `hasAlpha` → encode → already-optimized check (Compress only).
  - Map `CodecLoadError` → `codec-load`, `DecodeError` → `corrupt`, and `RangeError` / `WebAssembly.RuntimeError` mentioning memory → `oom`.
  - Always add `gps-removed`.
- [ ] **Step 5:** Run the tests. Expected: PASS.
- [ ] **Step 6:** Commit `feat: convert pipeline with orientation, alpha, downscale`.

### Task 5: Worker

**Files:**
- Create: `src/engine/worker.ts`, `src/engine/client.ts`
- Test: `tests/unit/client.test.ts`

**Interfaces:**
- Consumes: `convert`, `Job`/`Done`/`Failed`/`Progress` (Task 4), `preload` (Task 3).
- Produces:
```ts
// client.ts — main-thread wrapper; owns the Worker, runs jobs strictly one at a time
export interface EngineClient {
  enqueue(job: Job): void;
  preload(types: InType[]): void;
  on(e: 'progress', cb: (p: Progress) => void): void;
  on(e: 'done', cb: (d: Done) => void): void;
  on(e: 'failed', cb: (f: Failed) => void): void;
  pending(): number;
}
export function createEngine(workerFactory?: () => Worker): EngineClient;
```

- [ ] **Step 1: Write failing tests** with a fake Worker:
  - three enqueued jobs post to the worker one at a time, in order
  - a job enqueued mid-run is appended, and `pending()` reflects it
  - a `failed` message for job 1 still starts job 2
  - the worker terminating unexpectedly turns the in-flight job into `oom`, and a fresh worker is created for the next job
- [ ] **Step 2:** Run `npx vitest run tests/unit/client.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement. `worker.ts` is a thin `onmessage` adapter around `convert`. Transfer the output `Blob` (no copying). The client uses `new Worker(new URL('./worker.ts', import.meta.url), {type:'module'})`.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit `feat: worker and sequential engine client`.

### Task 6: Pages, template, SEO

**Files:**
- Create: `src/layouts/Base.astro`, `src/layouts/ToolPage.astro`, `src/pages/index.astro`, `src/pages/[tool].astro`, `public/robots.txt`, `src/styles/tokens.css`
- Create: `scripts/check-budget.mjs`
- Test: `tests/unit/build-output.test.ts` (runs against `dist/`)

**Interfaces:**
- Consumes: `TOOLS`, `getTool` (Task 1).
- Produces: static pages `/`, `/heic-to-jpg/`, `/compress-image/`, `/webp-to-jpg/`. Each tool page has a `<div data-tool="<slug>" data-accept="..." data-quality="..." data-format="...">` mount point for Task 7.

- [ ] **Step 1: Write failing build-output tests** (run `astro build` in `beforeAll`):
  - each tool HTML has a `<title>` equal to the registry title, a meta description, a `<link rel=canonical>` to its own URL, and exactly one `<h1>`
  - JSON-LD of `@type: FAQPage` whose question count equals the registry FAQ count
  - related links point at existing slugs
  - the homepage links to all 3 tools
  - `dist/sitemap-index.xml` exists
- [ ] **Step 2:** Run `npx vitest run tests/unit/build-output.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement the template in spec §5 order:
  - H1 → subhead → mount point → results area → how-to → FAQ → related
  - the homepage tool list with a filter `<input>` (≤ 1 KB inline script)
  - `tokens.css` with the type pair, accent, and 4/8 spacing variables
- [ ] **Step 4:** Implement `scripts/check-budget.mjs`: gzip-sum all `<script>` assets referenced by each tool page in `dist/`; exit 1 if > 15 KB. Add `"check:budget"` to package.json.
- [ ] **Step 5:** Run the tests and `npm run build && npm run check:budget`. Expected: PASS, budget OK.
- [ ] **Step 6:** Commit `feat: tool pages, homepage, SEO markup`.

### Task 7: Drop zone UI and every state

**Files:**
- Create: `src/ui/dropzone.ts`, `src/ui/format.ts`, `src/ui/zip.ts`
- Modify: `src/layouts/ToolPage.astro` (mount the island)
- Test: `tests/unit/format.test.ts`, `tests/e2e/states.spec.ts`

**Interfaces:**
- Consumes: `createEngine` (Task 5), `sniff` (Task 2), `getTool`, `toolForType` (Task 1).
- Produces:
```ts
// format.ts
export function formatBytes(n: number): string;                 // "2.4 MB", "820 KB"
export function middleTruncate(name: string, max: number): string; // keeps extension
export function uniqueNames(names: string[]): string[];         // a.jpg, a-1.jpg, a-2.jpg
// zip.ts
export async function zipFiles(files: { name: string; blob: Blob }[]): Promise<Blob>; // fflate, level 0
// dropzone.ts
export function mount(el: HTMLElement): void;
```

- [ ] **Step 1: Write failing unit tests:**
  - `formatBytes(2_400_000) === '2.4 MB'`
  - `middleTruncate('IMG_20261023_123456_final.heic', 28) === 'IMG_20261023_…_final.heic'`
  - `uniqueNames(['a.jpg','a.jpg','a.jpg']) → ['a.jpg','a-1.jpg','a-2.jpg']`
- [ ] **Step 2: Write failing E2E tests** (Playwright projects: chromium, webkit, firefox; `astro preview` web server). One test per spec §5 state, asserting the exact copy:
  - empty
  - loading codec (delay the codec route by 1 s)
  - processing ("Converting 1 of 2")
  - done (output name, size line, **Download**, **Download all (ZIP)**, "Location data removed")
  - wrong type (drop `alpha.png` on `/heic-to-jpg` → "This is a PNG, not a HEIC photo." and a link to `/compress-image`)
  - corrupt (`truncated.heic`)
  - too large (48 MP → the resize button; clicking it gives a Done row)
  - codec load failed (`route.abort()` on the libheif wasm → copy + **Try again**; unblocking and clicking it succeeds)
  - drop during a batch (Review Focus 3)
  - animated WebP → "Animated WebP: converted the first frame."
  - ZIP download contains uniquely named files
  - at 390 px the drop zone shows only the full-width **Choose photos** button
- [ ] **Step 3:** Run `npx vitest run tests/unit/format.test.ts && npx playwright test tests/e2e/states.spec.ts`. Expected: FAIL.
- [ ] **Step 4:** Implement `dropzone.ts`:
  - drag/drop + `<input type=file multiple accept=...>`
  - `preload` on `pointerenter`/`focusin`
  - rows rendered from engine events
  - the header counter, per-row **Retry**, **Convert more**
  - the quality slider (Compress only; PNG input shows the lossless message) and the JPG/PNG toggle (WebP tool)
  - collapsed "Options" on HEIC→JPG
  - copy verbatim from spec §5
- [ ] **Step 5:** Run both commands. Expected: PASS on all three browsers, and `npm run check:budget` still passes.
- [ ] **Step 6:** Commit `feat: drop zone UI with all states`.

### Task 8: Analytics + privacy test

**Files:**
- Modify: `src/layouts/Base.astro` (Plausible script, `data-domain` from env `PUBLIC_PLAUSIBLE_DOMAIN`; omitted when unset)
- Modify: `src/ui/dropzone.ts` (fire events)
- Test: `tests/e2e/privacy.spec.ts`

**Interfaces:**
- Consumes: `mount` (Task 7).
- Produces: `window.plausible('convert_success', {props:{tool, count}})` once per finished batch; `convert_error` once per failed file, with `{tool, reason}`.

- [ ] **Step 1: Write failing test:** record every request during a 3-file HEIC conversion plus ZIP download, with Plausible stubbed. Assert:
  - every request is a same-origin GET for `/_astro/*` or the codec wasm/js, or a POST to the Plausible endpoint
  - no request body contains bytes of the fixture or the string `IMG_`
  - exactly one `convert_success` with `count: 3`
- [ ] **Step 2:** Run `npx playwright test tests/e2e/privacy.spec.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement the events.
- [ ] **Step 4:** Run the test. Expected: PASS.
- [ ] **Step 5:** Commit `feat: plausible events and privacy test`.

### Task 9: Visual pass + state review

**Files:**
- Modify: `src/styles/tokens.css`, `src/layouts/*.astro`, `src/ui/dropzone.ts` (styling only)
- Create: `tests/e2e/screenshots.spec.ts`, output to `review/screenshots/`

- [ ] **Step 1:** Run the `frontend-design` skill for direction, then `impeccable` for critique and polish. Constraints: Global Constraints visual rules, no new elements beyond spec §5.
- [ ] **Step 2:** Write `screenshots.spec.ts`: capture every §5 state on the HEIC page, plus the homepage, at 390×844 and 1280×800.
- [ ] **Step 3:** Run `npx playwright test tests/e2e/screenshots.spec.ts --project=chromium`. Expected: 24+ PNGs in `review/screenshots/`.
- [ ] **Step 4:** Critique the screenshots honestly, fix any issues, and re-run. **Stop and get the user's review of the screenshots.**
- [ ] **Step 5:** Re-run the full E2E suite (copy must be unchanged). Commit `style: visual pass`.

### Task 10: Deploy + launch checks

**Files:**
- Create: `.github/workflows/ci.yml` (unit + e2e + budget on push), `README.md` (setup, fixtures, deploy)

- [ ] **Step 1:** CI: `npm ci && bash scripts/make-fixtures.sh --ci-48mp && npx vitest run && npx playwright install --with-deps && npx playwright test && npm run build && npm run check:budget`. On macOS runners only if `sips` is needed; otherwise commit the fixtures and generate only the 48 MP file with `sharp` in CI.
- [ ] **Step 2:** Create the Cloudflare Pages project (`npm run build`, output `dist`). **Ask the user before connecting accounts or deploying.**
- [ ] **Step 3:** Run Lighthouse mobile on each tool page on the `*.pages.dev` URL. Expected: performance ≥ 95, LCP < 1.5 s.
- [ ] **Step 4:** Real-device checks with the user:
  - iPhone Safari: the 48 MP photo; picking HEIC from Photos keeps HEIC (not transcoded)
  - mid-range Android on Chrome: a 12-photo batch
  - Record the results; tune `MAX_MEGAPIXELS` if the iPhone fails.
- [ ] **Step 5:** The user sets up the Search Console property and submits the sitemap. Plausible receives a test event.
- [ ] **Step 6:** Commit `chore: CI and launch docs`.
