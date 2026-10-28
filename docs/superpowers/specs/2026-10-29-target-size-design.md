# Compress to a Target Size: Design Spec

**Date:** 2026-10-29
**Status:** Approved in conversation; waiting for review of this written spec
**Builds on:** `main` at a0409ee (PR #14, the search tools, and PR #15, the wall alignment). Every earlier rule still applies unless this spec says otherwise.

## 1. Intent

Search Console shows jiffkit with 10 impressions and 0 clicks in 28 days, so the pages we add now decide where traffic comes from. Google autocomplete for India is dominated by target-size searches tied to exam and government upload forms: "compress image to 20kb / 50kb / 100kb / 200kb", "resize image to 20kb" and "signature resize 10 to 20 kb". These people are handling ID photos and signatures, often on a phone, which is exactly where "never uploaded" is worth the most. No jiffkit tool can hit a target size today.

Success means a visitor drops a photo, gets a JPG that is under the form's limit and still looks right, and uploads it.

## 2. Scope

| Slug | H1 | Target | Controls |
|---|---|---|---|
| `/compress-image-to-kb/` | Compress image to KB | any, default 100 KB | KB box; optional max width and height |
| `/compress-image-to-20kb/` | Compress image to 20 KB | 20 KB | none |
| `/compress-image-to-50kb/` | Compress image to 50 KB | 50 KB | none |
| `/compress-image-to-100kb/` | Compress image to 100 KB | 100 KB | none |
| `/compress-image-to-200kb/` | Compress image to 200 KB | 200 KB | none |
| `/signature-resize-10-20kb/` | Resize signature to 10–20 KB | 10 to 20 KB | none |

All six are `kind: 'image'`, `category: 'image'`, and accept JPG, PNG, WebP and HEIC. The output is always JPG.

**Not in this round:** exact pixel dimensions and exam or ID presets (the next PR, with each spec cited from an official notice); compress PDF; padding a file to reach a minimum; any page beyond these six. The existing Compress image and Resize image pages do not change.

## 3. Decisions (made with the product owner, 2026-10-29)

1. **Always JPG.** Upload forms almost always require JPG/JPEG, PNG cannot be pushed to a set size, and many portals reject WebP. Transparency becomes white, and the page says so.
2. **No padding.** If the best result is under a minimum, the row says so and suggests a larger scan. Every byte in the file is image data.
3. **Quality floor of 40, then shrink.** Below quality 40, faces and text break into blocks, and a smaller clean image reads better on a form than a full-size blocky one.
4. **No exact pixel dimensions yet.** Forcing a set size with a different shape means cropping photos or padding signatures, and those rules need the official specs, which the presets PR brings.
5. **One tag per tool on the homepage wall** (section 6).

## 4. Engine

`src/engine/target.ts` holds one pure function, testable with a stub encoder:

```ts
fitToSize(pixels: Pixels, target: { maxBytes: number; minBytes?: number }, encode: (p: Pixels, q: number) => Promise<Uint8Array>)
  : Promise<{ bytes: Uint8Array; pixels: Pixels; quality: number; shrunk: boolean; underMinimum: boolean } | 'cannot-fit'>
```

`convert()` calls it when `Job.options.target` is set. The decoding, the orientation, the flattening onto white for JPG, the 50 MP guard with its "Resize to 24 MP" escape, and the thumbnail all stay as they are.

**What a KB is.** Portals disagree on whether a KB is 1,000 or 1,024 bytes, so the engine counts whichever way is safer:
- A maximum of N KB means at most N × 1,000 bytes.
- A minimum of N KB means at least N × 1,024 bytes.

A file that meets both passes a form whichever definition the form uses. The page shows sizes the way the existing tools do (`formatBytes`).

**The steps:**
1. **Starting size.** If the image has more pixels than `maxBytes × 8` (one bit per pixel, a generous estimate for a quality-40 JPEG), shrink it to that many pixels with `downscaleTo` first. This keeps a 12 MP phone photo from being encoded at full size several times. The image is never enlarged.
2. **Quality search.** Binary-search JPEG quality between 40 and 92 for the highest quality whose file is ≤ `maxBytes`. That takes at most 6 encodes per round. Keep the largest file that fits.
3. **Shrink.** If quality 40 is still too big, scale each side by `sqrt(maxBytes / size at quality 40) × 0.95`, resize with `resizeBox`, and run step 2 again. Allow at most 6 rounds.
4. **Give up.** If the long edge would drop below 64 px, return `'cannot-fit'` (a new `FailReason`). A smaller image can't be read on a form.
5. **Minimum.** If the result is under `minBytes` and was not shrunk, try once at quality 100. If that's still under, return it with `underMinimum: true`. It is never padded.

The image is always re-encoded, even when the input already fits, so location data is always removed (the `gps-removed` note stays true).

**New notes:**
- `shrunk-to-fit`: the dimensions were reduced.
- `under-minimum`: the result is still under the minimum.

The existing `transparency-filled` and `gps-removed` notes still apply.

## 5. Pages and UI

The pages use the existing `ImageTool` and dropzone. The registry gains `target?: { maxKB: number; minKB?: number; editable?: boolean }` on `ImageTool`.

- **`/compress-image-to-kb/`:**
  - A "Target size" number box in KB (default 100, min 5, max 5000).
  - Optional "Max width" and "Max height" boxes, blank by default. They reuse Resize image's fit-within logic: shrink only, never crop.
  - Changing any box re-runs the list, the same way Resize image does (a fresh row id per run).
  - Under the drop zone, links to the four size pages and the signature page.
- **The five fixed pages:** no controls, because the number is the page. They show one line: "Every image comes out as a JPG of 20 KB or less." Each has a "Need a different size?" link to the KB page.

**What each finished row shows:**
- `48 KB · 1200 × 900 px · quality 72`
- If the image was shrunk, a note: "Made smaller to fit under 50 KB."
- If it's under the minimum: "This is 6 KB, under the 10 KB minimum. Scan or photograph it larger and try again."
- If it can't fit: "We couldn't get this under 20 KB and keep it readable." This counts as a failed row.

**Copy:** each page has its own title, description, How it works and Questions, written around the job people bring to it:

| Page | What the copy is about |
|---|---|
| 20 KB | Tight limits on exam and application forms, and why the image may come out smaller |
| 50 KB | Application forms, admit cards and job portals |
| 100 KB | ID and document photos, and keeping text readable |
| 200 KB | Certificates and documents, keeping detail, and email |
| Signature | The 10–20 KB range, the white background, cropping close to the ink before uploading, and the under-minimum case |
| KB page | Any size, plus the max-width and max-height boxes |

Rules for all of it:
- No page states an exam's official spec. That comes with the presets PR, cited.
- Every page says nothing is uploaded and that location data is removed.
- The 50, 100 and 200 KB pages must be different enough from each other that none reads as the same page with a number swapped.

## 6. Homepage wall: one tag per tool

A tool can have landing pages: the same tool with its own copy, made for a search. A landing page gets a page, sitemap entry, search-index entry and Related-tools links, but **no tag on the homepage wall**. The registry marks it with `landingOf: <slug of the tool it belongs to>`.

**Landing pages:**
- The four fixed-size pages are landing pages of `compress-image-to-kb`.
- `png-to-pdf` and `image-to-pdf` are landing pages of `jpg-to-pdf`.

**Tags on the wall:**
- `compress-image-to-kb` and `signature-resize-10-20kb`, because signature resizing is a task of its own.
- The wall stays at 23 tags: Image 8, PDF 5, AI 4, Video 2, Developer 4.

**Layout:**
- **Phone:** unchanged.
- **Tablet:** bands of 4 tags. PDF comes out 4 + 1.
- **Desktop:** 7 tracks. Image takes 4 and PDF 3, two rows each. AI takes 4 and Video 3. Developer runs across.
- The alignment test from #15 still holds: one tag height, and zones side by side are one height.

## 7. States

| State | What the visitor sees |
|---|---|
| Empty | Drop zone, the target line (or the boxes), the privacy line |
| Codec loading | The existing banner with the measured size (HEIC adds the 0.8 MB codec when a HEIC is dropped) |
| Working | "Converting 1 of 3", a spinner on the active row |
| Done | Size, pixels and quality; Download; ZIP for 2 or more |
| Shrunk to fit | Done, plus the note |
| Under minimum | Done, plus the under-minimum note (the file can still be downloaded) |
| Can't fit | Error row, no download |
| Wrong type | The existing copy, with a link to the right tool |
| Too large (over 50 MP) | The existing copy and the "Resize to 24 MP" escape |
| Codec failed to load | The existing copy and Try again |

## 8. Analytics

The existing events are unchanged: `convert_success {tool, count}` and `convert_error {tool, reason}`. The new reason `cannot-fit` joins the allowed reasons in the privacy test. `under-minimum` is a success, not an error.

## 9. Tests

- **Unit, `target.ts` with a stub encoder** whose size is a known function of pixels and quality:
  - It finds the highest quality that fits.
  - It never returns a file over the maximum.
  - It shrinks once quality 40 is too big.
  - It returns `cannot-fit` below 64 px.
  - It retries quality 100 for a minimum and reports `underMinimum` without padding.
  - It applies the starting-size rule.
  - The KB rules: maximum × 1,000 and minimum × 1,024.
- **Unit, `convert` with the real codecs:**
  - A 1600 × 1200 JPG to 20 KB comes out ≤ 20,000 bytes and is JPG.
  - A HEIC to 50 KB comes out as JPG with no GPS.
  - A transparent PNG becomes JPG on white.
  - A tiny signature under a 10 KB minimum is reported.
- **Registry:** six slugs, title and description lengths, distinct FAQs (no two size pages share an answer), `landingOf` targets exist, homepage counts (Image 8, PDF 5, still 23 tags).
- **E2E (`tests/e2e/target-size.spec.ts`), on all three engines:** each page's empty state, a done row ≤ target, a KB change re-running the list, the under-minimum, can't-fit and wrong-type states, no sideways scroll at 390 px.
- **Privacy:** a target-size run sends no file name or bytes, and only `convert_success` for that tool.
- **Build output and budget:** the sitemap and search index list all six, the wall has no landing-page tags, and every page stays under 15 KB of gzip JS before interaction.
- **Screenshots:** every state in section 7, at 390 px and 1280 px.

## 10. Risks

- **Speed on a cheap phone.** About 6 to 18 encodes of an image of 1.6 MP or less should take a few seconds. If it's slow on a real mid-range Android, lower the starting-size estimate.
- **Near-duplicate pages.** The size pages share an engine, so their copy is the only thing that makes them different. The registry test that no two size pages share an FAQ answer is a floor, not the bar; the copy gets reviewed by eye.
- **Portals that recompress uploads or check dimensions.** Out of our control. The presets PR addresses dimensions.
