# Compress to a Target Size: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Six image pages that turn a photo or signature into a JPG under a target size (and over a minimum for the signature page), with a new size-search engine, and a homepage wall that shows one tag per tool.

**Architecture:**
- A pure `fitToSize` in `src/engine/target.ts` searches JPEG quality, then shrinks the image, against an injected encoder.
- `convert()` calls it when `Job.options.target` is set.
- The six pages are `ImageTool` registry entries with a `target` field, driven by the existing dropzone.
- A new `landingOf` field keeps landing pages off the homepage wall while they keep their pages, sitemap entries and search entries.

**Tech Stack:** Astro 7, TypeScript, the existing jSquash codecs (mozjpeg encoder) in the image worker, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-29-target-size-design.md`

## Global Constraints

- Nothing is uploaded and there are no third-party requests. Analytics stays Umami only, with props `tool`, `count`, `reason`.
- Under 15 KB of gzip JS per page before interaction (`npm run check:budget`).
- WCAG AA: 44 px targets, labelled inputs, results in the existing `role="status"` region.
- Works at 390 px with no sideways scroll.
- Output is always JPG. Never pad a file.
- Quality is searched between 40 and 92 (100 only for the minimum retry). Shrink below quality 40. Give up below a 64 px long edge. At most 6 shrink rounds.
- A KB maximum is N × 1,000 bytes; a KB minimum is N × 1,024 bytes.
- Titles ≤ 60 characters, descriptions 120 to 160, 4 or 5 FAQs and 3 How it works steps per tool (`tests/unit/tools.test.ts`).
- No page states an exam's official spec.
- The existing Compress image and Resize image pages do not change.
- The homepage wall stays at 23 tags: Image 8, PDF 5, AI 4, Video 2, Developer 4.

## Review Focus

1. **A target smaller than any readable image** (for example 5 KB on a 12 MP photo) must end in `cannot-fit` or a tiny but valid JPG, never an endless loop or a file over the target. Owner: Task 1 test `stops after 6 rounds or at 64 px`.
2. **An input already under the target** must still be re-encoded (location data removed) and stay ≤ the target. Owner: Task 2 test `re-encodes a JPG that already fits and strips GPS`.
3. **The KB box set to empty, 0, a negative number or text** must not re-run with a bad target. The box keeps the last valid value and shows the error. Owner: Task 4 e2e `an invalid target keeps the last one`.
4. **Changing the target while a batch is running** must leave every row at the new target, with no stale result. Owner: Task 4 e2e `a new target re-runs the list` (change it while the codec is held).
5. **A landing page's tool page renders its zone colour and tile** even though it has no wall tag (`placeOf` must not be undefined). Owner: Task 3 test `every tool, landing pages included, has a place`.

---

### Task 1: The size-search engine

**Files:**
- Create: `src/engine/target.ts`
- Test: `tests/unit/target.test.ts`

**Interfaces:**
- Consumes: `Pixels` from `src/engine/decode.ts`; `downscaleTo` and `resizeBox` from `src/engine/pixels.ts`.
- Produces:
  - `export interface TargetBytes { maxBytes: number; minBytes?: number }`
  - `export function bytesFor(t: { maxKB: number; minKB?: number }): TargetBytes`. It returns `maxKB * 1000`, and `minKB * 1024` when `minKB` is given.
  - `export type Encode = (p: Pixels, quality: number) => Promise<Uint8Array>`
  - `export interface Fit { bytes: Uint8Array; pixels: Pixels; quality: number; shrunk: boolean; underMinimum: boolean }`
  - `export async function fitToSize(p: Pixels, t: TargetBytes, encode: Encode): Promise<Fit | 'cannot-fit'>`
  - `export const Q_MIN = 40, Q_MAX = 92, MIN_EDGE = 64, MAX_ROUNDS = 6`

- [ ] **Step 1: Write the failing tests.** Use a stub encoder whose size is `Math.round(width * height * quality / 100 * k)` bytes (pick `k` per test), returning a `Uint8Array` of that length, and recording each `(width, height, quality)` call.
  - `bytesFor: max is KB × 1000, min is KB × 1024`: `bytesFor({ maxKB: 20, minKB: 10 })` equals `{ maxBytes: 20000, minBytes: 10240 }`.
  - `finds the highest quality that fits`: with a 1000 × 1000 image and a target that quality 70 fits but quality 71 doesn't, the result has quality 70, `shrunk: false`, and `bytes.length <= maxBytes`.
  - `never encodes above 92 or below 40 while searching`: every recorded quality is within [40, 92].
  - `shrinks once quality 40 is too big`: with a target under the size at quality 40, the result has `shrunk: true`, a smaller width and height with the same aspect ratio within 1 px, and `bytes.length <= maxBytes`.
  - `stops after 6 rounds or at 64 px`: with a stub that never fits, the result is `'cannot-fit'`, there are no more than 6 × 7 + 7 calls, and no call has a long edge under 64.
  - `starts from at most maxBytes × 8 pixels`: with a 4000 × 3000 image and `maxBytes` 50,000, the first call's `width * height` is ≤ 400,000.
  - `retries quality 100 for a minimum, without padding`: when a 10,240-byte minimum isn't met at quality 92, the stub sees a quality-100 call. If that's still under, the result has `underMinimum: true` and `bytes` is exactly the encoder's output, no longer.

- [ ] **Step 2: Run and see it fail.** Run `npx vitest run tests/unit/target.test.ts`. Expected: it fails because `target.ts` doesn't exist.

- [ ] **Step 3: Implement `fitToSize`.** Follow spec §4 steps 1 to 5:
  - Starting size: `downscaleTo(p, maxBytes * 8 / 1e6)`.
  - Quality: binary-search integers in [40, 92] for the largest that fits.
  - Shrink factor: `Math.sqrt(maxBytes / sizeAt40) * 0.95` per side, applied with `resizeBox` from the current pixels.
  - Give up with `'cannot-fit'` when the next long edge would be under 64 or after 6 shrink rounds.
  - Minimum retry only when not shrunk.

- [ ] **Step 4: Run and see it pass.** Run `npx vitest run tests/unit/target.test.ts`. Expected: all pass.

- [ ] **Step 5: Commit.** `git add src/engine/target.ts tests/unit/target.test.ts && git commit -m "feat(engine): fitToSize, a JPEG quality and size search under a byte budget"`

### Task 2: `convert()` with a target

**Files:**
- Modify: `src/engine/types.ts`. Add to `Note`: `'shrunk-to-fit' | 'under-minimum'`. Add to `FailReason`: `'cannot-fit'`. Add to `Job['options']`: `target?: { maxKB: number; minKB?: number }`. Add to `Done`: `quality?: number`.
- Modify: `src/engine/convert.ts`
- Test: `tests/unit/convert.test.ts`

**Interfaces:**
- Consumes: Task 1's `fitToSize`, `bytesFor`, `Encode`.
- Produces: a `Done` carrying `quality` and the notes above, or `Failed { reason: 'cannot-fit' }`. The output is JPG with the name from `outputName(name, 'jpg')`.

- [ ] **Step 1: Write the failing tests** in a new `describe('convert: target size', ...)`. They use `'compress-image-to-kb'`; until Task 3 adds that slug, add it to `ImageSlug` with a minimal registry entry.
  - `a 1600 × 1200 JPG to 20 KB is a JPG of at most 20,000 bytes`: magic `ff d8`, `outBytes <= 20000`, `quality` between 40 and 92.
  - `a HEIC to 50 KB is a JPG with no GPS`: run `iphone-12mp.heic` with `{ target: { maxKB: 50 } }`. `exifr.gps` is undefined and the notes include `shrunk-to-fit`.
  - `a transparent PNG becomes a JPG on white`: `alpha.png` to 20 KB has the notes `transparency-filled`.
  - `re-encodes a JPG that already fits and strips GPS`: `photo.jpg` with `maxKB: 5000` has the notes `gps-removed` and `exifr.gps` undefined.
  - `a small image under a 10 KB minimum is reported, not padded`: `grey.png` (200 × 150) with `{ maxKB: 20, minKB: 10 }` has the notes `under-minimum` and `outBytes < 10240`.
  - `an impossible target is cannot-fit`: `photo.jpg` with `maxKB: 0.05` gives `reason: 'cannot-fit'`.

- [ ] **Step 2: Run and see them fail.** Run `npx vitest run tests/unit/convert.test.ts -t "target size"`. Expected: they fail.

- [ ] **Step 3: Implement.** In `convert()`, when `options.target` is set:
  - Force the format to `'jpg'` and load the codecs for jpg.
  - After orientation and the existing resize box, flatten onto white.
  - Call `fitToSize(pixels, bytesFor(options.target), (p, q) => encode(p, 'jpg', q))`.
  - Map `'cannot-fit'` to `fail('cannot-fit')`, and `shrunk` and `underMinimum` to the notes.
  - Build the thumbnail from `fit.pixels`.
  - Skip the compress-image "hand back the original" branch.

- [ ] **Step 4: Run and see them pass.** Run `npx vitest run tests/unit/convert.test.ts`. Expected: all pass, the old tests included.

- [ ] **Step 5: Commit.** `git commit -am "feat(engine): convert to a target size"`, with the test file added.

### Task 3: Registry, landing pages and the wall

**Files:**
- Modify: `src/tools.ts`:
  - `ToolBase` gets `landingOf?: ToolSlug`; `ImageTool` gets `target?: { maxKB: number; minKB?: number; editable?: boolean }`.
  - Six entries in `IMAGE_TOOLS`, after `resize-image`: `compress-image-to-kb` (`target: { maxKB: 100, editable: true }`); `-20kb`, `-50kb`, `-100kb` and `-200kb` (`landingOf: 'compress-image-to-kb'`); and `signature-resize-10-20kb` (`target: { maxKB: 20, minKB: 10 }`).
  - All six: `accepts ['jpg','png','webp','heic']`, `outputs ['jpg']`, `defaults { format: 'jpg', quality: 92 }`.
  - `landingOf: 'jpg-to-pdf'` on `png-to-pdf` and `image-to-pdf`.
  - `HOME_TOOLS` filters out `landingOf`.
- Modify: `src/wall.ts`. Add `IO` entries, and give `PLACE` an entry for every tool that has no wall tag, using its category's home zone.
- Modify: `src/icons.ts`. `ICON_NAME`: `file-down` for the five compress pages and `signature` for the signature page; check each exists in `node_modules/lucide-static/icons/`, then copy the SVG inner as the existing script does.
- Modify: `src/search-index.ts`. Add `WORDS` for all six: kb, kilobyte, reduce, size, limit, form, exam, upload, and for the signature page sign and signature.
- Modify: `src/styles/tokens.css`. At 1200 px and up: `image` gets `--tracks: 4`, `pdf` gets 3, `ai` 4, `video` 3, `developer` 7. Update the comment's counts.
- Modify: `src/components/ImageTool.astro`. Add `CODEC_SIZE` entries: measure from the build, jpeg, png and webp decoders plus the jpeg encoder, and note that HEIC loads 0.8 MB more.
- Tests: `tests/unit/tools.test.ts`, `tests/unit/build-output.test.ts`, `tests/unit/search.test.ts`, `tests/unit/icons.test.ts` (no change expected), `tests/e2e/home.spec.ts`.

**Interfaces:**
- Consumes: Task 2's `Job['options']['target']` shape (`ImageTool.target` minus `editable`).
- Produces: `getImageTool(slug).target`; `HOME_TOOLS` without landing pages; `placeOf(slug)` defined for every slug in `TOOLS`.

- [ ] **Step 1: Write the failing tests.**
  - `tools.test`, `the six target-size tools`: each has `outputs ['jpg']`, the `target` shown in the Files list above, and accepts heic.
  - `tools.test`, `landing pages point at a real tool that is on the wall`: every `landingOf` exists in `HOME_TOOLS`.
  - `tools.test`, `no two size pages share an FAQ answer`: across the 20, 50, 100 and 200 KB pages, all FAQ answers are distinct, and all titles and descriptions are distinct.
  - `tools.test`: the homepage has 23 tags; `TOOLS` has 54.
  - `tools.test`, `every tool, landing pages included, has a place`: `placeOf(t.slug)` is defined for every tool.
  - `build-output`: zones are `[['Image','8'],['PDF','5'],['AI','4'],['Video','2'],['Developer','29']]`; `TOOLS` has length 54; the sitemap has all six; the homepage HTML has no `href="/compress-image-to-20kb/"` tag but the KB page does.
  - `search.test`: `top('compress image to 20kb')` is `compress-image-to-20kb`, `top('signature 20kb')` is `signature-resize-10-20kb`, and `top('resize image to 50kb')` is `compress-image-to-50kb`.
  - `home.spec`: zone counts `Image 8, PDF 5`; the PDF hrefs are `['/merge-pdf/','/split-pdf/','/rotate-pdf/','/pdf-to-jpg/','/jpg-to-pdf/']`; the #15 alignment test still passes.

- [ ] **Step 2: Run and see them fail.** Run `npx vitest run tests/unit/tools.test.ts tests/unit/search.test.ts`. Expected: they fail.

- [ ] **Step 3: Implement the registry, wall, icons, search words and CSS.** Write each page's copy to spec §5:
  - The six themes in the copy table.
  - Each FAQ says nothing is uploaded and that location data is removed.
  - The signature page explains the white background, cropping close to the ink, and the under-minimum case.
  - The 20 KB page explains why the image may come out smaller.
  - Related tools: the size pages link each other and the KB page; the KB page links compress-image and resize-image.

- [ ] **Step 4: Run and see them pass.** Run `npm test`. Expected: all pass; the build-output test rebuilds.

- [ ] **Step 5: Commit.** `git commit -m "feat: six target-size pages in the registry, landing pages off the wall"`

### Task 4: The page UI and its states

**Files:**
- Modify: `src/components/ImageTool.astro`:
  - For `tool.target?.editable`: a fieldset "Target size" with `<input type="number" min="5" max="5000" step="1" value="100" data-target-input>` followed by "KB". Then the Resize "Fit within" box with both sides blank (`data-width-input`, `data-height-input`, width with no value). Then a "Common sizes" line linking the four size pages and the signature page.
  - For a fixed `target`: `<p class="note" data-target-line>`, reading "Every image comes out as a JPG of {maxKB} KB or less." or, with `minKB`, "Every signature comes out as a JPG between {minKB} and {maxKB} KB.". Plus `<a class="link" href="/compress-image-to-kb/">Need a different size? →</a>`.
  - `data-target-max`, `data-target-min` on the root.
  - The privacy line reads "Compressed on your device. Your {noun} are never uploaded." (the signature page uses noun "signatures").
  - The "more" button reads "Compress more".
- Modify: `src/ui/dropzone.ts`:
  - `options()` adds `target` from the root data attributes or the KB box.
  - A KB-box `change` with a valid integer between 5 and 5000 calls the existing `resizeAgain()`. An invalid one restores the last valid value and shows `<p class="error" role="alert">Enter a size between 5 and 5000 KB.</p>`.
  - Done rows show `${formatBytes(outBytes)} · ${w} × ${h} px · quality ${q}`.
  - Notes: `shrunk-to-fit` → `Made smaller to fit under ${maxKB} KB.`; `under-minimum` → `This is ${formatBytes(outBytes)}, under the ${minKB} KB minimum. Scan or photograph it larger and try again.`
  - `failure()` gets `case 'cannot-fit'`: `We couldn't get this under ${maxKB} KB and keep it readable.`, with no action.
- Create: `tests/e2e/target-size.spec.ts`
- Modify: `tests/e2e/privacy.spec.ts` (add `'cannot-fit'` to `REASONS`, plus one case), `tests/e2e/screenshots.spec.ts` (a block for the six pages).

**Interfaces:**
- Consumes: Task 2's notes, `Done.quality` and `'cannot-fit'`; Task 3's registry `target`.
- Produces: nothing later tasks use.

- [ ] **Step 1: Write the failing e2e tests** in `target-size.spec.ts`, in the style of `new-tools.spec.ts`:
  - `each page: empty copy`: all six show their H1, the privacy line, and the target line or KB box.
  - `20 KB: photo.jpg comes out at 20,000 bytes or less`: download, check the length and the JPEG magic, and check the row text matches `/ · \d+ × \d+ px · quality \d+$/`.
  - `KB page: a new target re-runs the list`: hold `mozjpeg_enc`, add two files, set the KB box to 30 and press Enter, then release. Both rows are ≤ 30,000 bytes when downloaded.
  - `KB page: an invalid target keeps the last one`: fill `0` and press Enter. The alert text shows and the box value goes back to 100.
  - `signature: a small clean image is under the minimum`: `grey.png` shows the under-minimum copy and can still be downloaded.
  - `KB page: the smallest target shrinks the image to fit`: set the box to 5 and add `photo.jpg`. The row shows `Made smaller to fit under 5 KB.`, and the download is ≤ 5,000 bytes. (`cannot-fit` can't be reached from the UI's 5 KB minimum. Task 1's `stops after 6 rounds or at 64 px` and Task 2's `an impossible target is cannot-fit` pin it.)
  - `wrong type`: a PDF shows the existing wrong-type copy.
  - `390 px: no sideways scroll on the KB page with results`.
  - `privacy.spec`, `compress to 20 KB`: one `convert_success {compress-image-to-20kb, count: 1}`, and no file name or first bytes in any request.

- [ ] **Step 2: Run and see them fail.** Run `npx playwright test tests/e2e/target-size.spec.ts --project=chromium`. Expected: they fail.

- [ ] **Step 3: Implement the markup, the dropzone changes and the copy above.** Add the screenshot block: empty, loading, done, shrunk, under-minimum, cannot-fit and wrong type, at both widths.

- [ ] **Step 4: Run and see them pass on all three engines.** Run `npx playwright test tests/e2e/target-size.spec.ts tests/e2e/privacy.spec.ts tests/e2e/states.spec.ts tests/e2e/home.spec.ts`. Expected: all pass.

- [ ] **Step 5: Review every screenshot by eye.** Run `npx playwright test tests/e2e/screenshots.spec.ts --project=chromium --grep "kb|signature|home"` and read each PNG at 390 px and 1280 px. Fix anything misaligned, any wrong copy or any overflow before going on. Include the homepage wall.

- [ ] **Step 6: Commit.** `git commit -m "feat(ui): target-size pages: KB box, target line, size and quality on each row"`

### Task 5: Docs, full checks and the PR

**Files:**
- Modify: `PRODUCT.md`. Change the count 48 to 54, keep 23 homepage tags, and add the landing-page rule in a line under Capabilities.
- Modify: `README.md`. Add the six pages to the Image line, and the landing-page rule under "Adding a tool".

- [ ] **Step 1: Run everything.** `npm test`, `npm run typecheck`, `npm run check:budget`, and the full `npx playwright test` in the background. Expected: 0 failures, 0 type errors, and every page under 15 KB.
- [ ] **Step 2: Commit the docs, push `claude/target-size`, and open a PR against `main`.** The PR description carries the screenshots, uploaded to the `pr-assets/search-tools` branch under `target-size/`.
- [ ] **Step 3: Report.** Send the PR link to the parent session (`local_e8fb794f-31d3-4a73-a587-0e0726272715`) and bind the PR.
