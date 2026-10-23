# Image Tools v1 — Design Spec

**Date:** 2026-10-23
**Status:** Approved in conversation, awaiting written-spec review
**Working name:** web-tools (brand and domain decided separately; build under a placeholder)

## 1. Intent

**Problem:** People who need a quick image conversion (most often Windows/Android users who received iPhone photos) land on ad-heavy sites that upload their files to a server.

**Product:** A single site of browser-based tools. Every file is processed on the user's device and never uploaded.

**v1 goal:** Prove we can earn organic search traffic. Revenue is not a v1 goal.

**Success signals (weeks 2–6 after launch):** pages indexed in Search Console, search impressions, organic visits, and file conversions per visit. If impressions are under ~100/week by week 6, treat it as a distribution problem before adding tools.

## 2. Scope

### In v1
| Slug | H1 | Input | Output | Visible settings |
|---|---|---|---|---|
| `/heic-to-jpg` | HEIC to JPG | `.heic`, `.heif` | JPG | None (quality 85 under collapsed "Options") |
| `/compress-image` | Compress image | JPG, PNG, WebP | Same format as input | Quality slider, default 75, applies to JPG/WebP. PNG files are compressed losslessly with OxiPNG, and the slider shows "PNG is compressed without quality loss" instead. |
| `/webp-to-jpg` | WebP to JPG or PNG | `.webp` | JPG (default) or PNG | JPG / PNG toggle |

Plus a homepage (`/`) that lists the tools, with a filter box.

### Not in v1
Accounts, ads, a backend, AVIF output, resize/crop as standalone tools, more languages, PWA/offline install, a blog.

## 3. Architecture

**Stack:** Astro (static output) · vanilla TypeScript islands · Web Worker + WASM codecs · Cloudflare Pages · Plausible analytics.

Rejected alternatives:
- **React islands:** about 40 KB of extra JavaScript per page for no v1 benefit.
- **Single-page app:** gives Google one page instead of one per search; it defeats the strategy.

### Units

```
src/
  tools.ts               tool registry (single source of truth)
  pages/index.astro      homepage directory + filter
  pages/[tool].astro     static page per registry entry (getStaticPaths)
  layouts/ToolPage.astro shared template + SEO head
  ui/dropzone.ts         file intake, queue, progress, results, download
  engine/worker.ts       decode → pixels → encode, one job at a time
  engine/codecs.ts       lazy loaders for each codec
  engine/sniff.ts        reads magic bytes and dimensions from the file header
```

| Unit | Responsibility | Depends on | Knows nothing about |
|---|---|---|---|
| `tools.ts` | Per tool: slug, title, meta description, H1, subhead, accepted MIME types and extensions, output formats, defaults, how-to steps, FAQ, related slugs | — | Rendering, codecs |
| `ToolPage.astro` | Layout order, `<title>`, meta, canonical, FAQPage JSON-LD, related links | `tools.ts` | Images |
| `dropzone.ts` | UI states, queue, worker messaging, ZIP download | `sniff.ts`, worker message contract | Codec internals |
| `worker.ts` + `codecs.ts` | One input file + options → one output blob + metadata | Codec libs | DOM |

Adding a new conversion pair means a new entry in `tools.ts`, plus a codec only if the format is new.

### Codecs (loaded on demand, never on page load)
- HEIC decode: `libheif` WASM (~1–2 MB)
- JPEG encode: jSquash MozJPEG
- PNG encode/optimise: jSquash OxiPNG
- WebP decode/encode: jSquash WebP
- JPEG/PNG decode: jSquash decoders. Inside the worker, `createImageBitmap` + `OffscreenCanvas` is allowed only for images ≤ 16 MP.
- ZIP: `fflate`

The decoder download starts when the user hovers or focuses the drop zone (preload), and is required once a file is dropped.

### Worker message contract
```ts
// page → worker
type Job = { id: string; file: File; tool: ToolSlug; options: { format?: 'jpg'|'png'|'webp'; quality?: number; downscaleTo?: number } };
// worker → page
type Progress = { id: string; stage: 'loading-codec'|'decoding'|'encoding'; loaded?: number; total?: number };
type Done     = { id: string; blob: Blob; name: string; width: number; height: number; inBytes: number; outBytes: number; notes: Note[] };
type Failed   = { id: string; reason: 'wrong-type'|'corrupt'|'too-large'|'oom'|'codec-load'; detectedType?: string; megapixels?: number };
type Note     = 'gps-removed'|'first-frame-only'|'already-optimized'|'transparency-filled';
```

### Data flow
1. The user drops or picks files, and `sniff.ts` reads the real type (magic bytes) and dimensions for each.
2. If the type doesn't match the tool, show the wrong-type state without sending it to the worker.
3. Otherwise queue it. The worker processes **one file at a time** (memory safety).
4. The worker decodes to raw RGBA, applies EXIF orientation, encodes, and strips metadata (GPS included).
5. The page shows the result. A single file downloads directly; with several, "Download all" builds a ZIP.

The full-size image never goes through a main-thread `<canvas>`. iOS Safari limits canvas area to ~16.7 MP, and 48 MP iPhone photos exceed that.

## 4. Behaviour and edge cases

| Case | Behaviour |
|---|---|
| Transparent PNG/WebP → JPG | Composite onto white; note `transparency-filled` |
| Animated WebP | Convert first frame; note "Animated WebP: converted the first frame." |
| Compressed output ≥ input | Return the original; note "Already optimized. We couldn't make it smaller." |
| EXIF orientation | Applied to the pixels before metadata is stripped |
| Location data | Always removed; the result shows "Location data removed" |
| Duplicate names in a ZIP | Suffix `-1`, `-2`, … |
| Output file name | Same base name, new extension (`IMG_2041.heic` → `IMG_2041.jpg`) |
| Image > device budget | `too-large` → offer "Resize to 24 MP and convert" (`downscaleTo`) |
| One file fails mid-batch | That row shows the error and **Retry**; the rest continue |

**Device budget:** decoding is tried on every device. A `too-large` result comes from a caught allocation failure or from a pixel count above a cap (default 50 MP, tuned after the real iPhone test).

## 5. Screen and states

Order: H1 → subhead → drop zone → results list → how-to (3 steps) → FAQ (4–5) → related tools (3–4).

| State | Copy (HEIC example) |
|---|---|
| Empty | "Drop HEIC photos here" · **Choose photos** · "Converted on your device. Your photos are never uploaded." |
| Loading codec | "Getting the converter ready… 1.4 MB, one time only" + progress bar |
| Processing | Row per file: name, spinner; header "Converting 3 of 12" |
| Done | Row: thumbnail, output name, "2.4 MB → 1.1 MB", **Download**. Header: **Download all (ZIP)** · **Convert more** · "Location data removed" |
| Wrong type | "This is a PNG, not a HEIC photo." + **Try PNG to JPG →** (or a related tool) |
| Corrupt | "We couldn't read this file. It may be damaged or incomplete." |
| Too large | "This photo is too large for your device to convert (48 MP)." **Resize to 24 MP and convert** |
| Codec load failed | "Couldn't load the converter. Check your connection." **Try again** |
| Out of memory | Row: "Ran out of memory" + **Retry** |
| Long names | Middle-truncated: `IMG_20261023_…_final.heic` |

**Mobile (≤ 600 px):** the drop zone becomes one full-width **Choose photos** button. Results go in a single column; download buttons are full width.

**iOS picker:** the file input uses `accept=".heic,.heif,image/heic,image/heif"` to discourage Safari from transcoding HEIC to JPEG. Verify on a device.

**Visual system:** one typeface pair, one accent colour, a 4/8 px spacing scale, no shadows or gradients. Visual polish is done during the build with `frontend-design` / `impeccable`.

## 6. SEO and analytics
- Each tool page has its own `<title>` and meta description from `tools.ts`, plus a self-referencing canonical URL.
- `FAQPage` JSON-LD generated from the registry FAQ.
- `sitemap.xml` (via `@astrojs/sitemap`), `robots.txt`.
- Internal links: related tools on every page; wrong-type errors link to the matching tool.
- Plausible: pageviews plus custom events `convert_success` (tool, file count) and `convert_error` (tool, reason). File names and contents are never sent.

## 7. Performance budgets
- ≤ 15 KB JavaScript (gzip) on a tool page before a file is dropped
- Lighthouse performance ≥ 95 (mobile)
- LCP < 1.5 s on a fast-4G profile

## 8. Testing
1. **Engine unit tests (Vitest, Node):** fixtures are iPhone HEIC at 12 MP and 48 MP, a rotated HEIC, lossy/lossless/animated WebP, a transparent PNG, and a truncated file. Assert output format, dimensions, orientation, no GPS in output, and each `Note`.
2. **End-to-end tests (Playwright on Chromium, WebKit, Firefox):** every state in §5, including a forced codec-load failure (blocked route) and a wrong file type.
3. **Privacy test:** during a full conversion, fail if any request is sent other than same-origin GET for static assets/codecs and the Plausible event endpoint (which never carries file data).
4. **Real devices (manual):** iPhone Safari (48 MP photo, HEIC picker behaviour) and a mid-range Android phone on Chrome.
5. **Visual review:** screenshots of every §5 state at 390 px and 1280 px, reviewed before calling v1 done.

## 9. Definition of done
- Homepage + 3 tool pages deployed to Cloudflare Pages (`*.pages.dev` now, own domain once the brand is chosen).
- All automated tests pass; both real-device checks pass.
- State screenshots at 390 px and desktop reviewed by the user.
- Search Console property set up and sitemap submitted; Plausible receiving events.

## 10. Open items (do not block the build)
- Brand name and domain.
- The real-device pixel cap for `too-large` (start at 50 MP, tune after the iPhone test).
