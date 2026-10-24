# Tools Round 3 — On-device AI, PDF↔images and Video — Design Spec

**Date:** 2026-10-24
**Status:** Approved in conversation, awaiting written-spec review
**Builds on:** round 2 (`feat/tools-round-2`, PR #2) and v1. Every earlier rule still applies unless this spec says otherwise.

## 1. Intent

Add eight pages of heavier tools that competitors run on servers, and run them on the user's device instead. The pitch is "on-device AI: your files are never uploaded". After this round, the site gets deployed.

## 2. Scope

| Slug | H1 | Kind | Category |
|---|---|---|---|
| `/remove-background/` | Remove background | ai (`model: 'bg'`) | AI |
| `/image-to-text/` | Image to text | ai (`model: 'ocr'`) | AI |
| `/upscale-image/` | Upscale image | ai (`model: 'upscale'`) | AI |
| `/transcribe-audio/` | Transcribe audio | ai (`model: 'whisper'`) | AI |
| `/pdf-to-jpg/` | PDF to JPG | pdf (`op: 'to-images'`) | PDF |
| `/jpg-to-pdf/` | JPG to PDF | pdf (`op: 'from-images'`) | PDF |
| `/compress-video/` | Compress video | video (`op: 'compress'`) | Video |
| `/video-to-gif/` | Video to GIF | video (`op: 'gif'`) | Video |

The homepage categories are Image, PDF, AI, Video, Developer and QR code.

**Not in this round:** OCR languages other than English, batch background removal, speaker labels, video formats beyond MP4/MOV/WebM, PDF to Word, server inference.

## 3. Architecture

**Approach:** onnxruntime-web (via transformers.js where it fits) for the background, upscale and Whisper models; tesseract.js for OCR; pdf.js plus the existing pdf-lib for PDF↔images; the browser's WebCodecs video API plus mp4box.js, mp4-muxer and gifenc for video.

Rejected:
- ffmpeg.wasm: about 30 MB, slow, and GPL when built with x264.
- Server inference: breaks the privacy promise and costs money to run.
- RMBG-1.4: non-commercial licence.
- @imgly/background-removal: AGPL licence.

### Models and libraries (all allow commercial use)

| Tool | Library (licence) | Model (licence) | First-use download (approx.) |
|---|---|---|---|
| Remove background | onnxruntime-web (MIT) | U²-Net general (Apache-2.0); u2netp (Apache-2.0) on low-memory devices | 45 MB / 5 MB |
| Image to text | tesseract.js (Apache-2.0) | tessdata_fast `eng` (Apache-2.0) | 4 MB |
| Upscale | onnxruntime-web (MIT) | realesr-general-x4v3 (BSD-3) | 5 MB |
| Transcribe | @huggingface/transformers (Apache-2.0) | Whisper base, quantised (MIT) | 80 MB |
| PDF to JPG | pdf.js (Apache-2.0) | — | 1 MB |
| JPG to PDF | pdf-lib (MIT, existing) + image engine | — | 0 |
| Video | mp4box.js (BSD-3), mp4-muxer (MIT), gifenc (MIT) | — | 0.3 MB |

Each implementation task must check the licence of the exact model file it uses (via its model card or repo LICENSE) and record it on `/licenses/`. A model whose licence can't be confirmed must not ship.

### Model hosting
- Every model URL is built as `${PUBLIC_MODEL_BASE_URL}/<path>`. The default points at public CDNs (Hugging Face / jsDelivr); for launch the owner sets it to their own Cloudflare R2 bucket.
- Model files never go in `dist/` (Cloudflare Pages caps files at 25 MB).
- The privacy E2E allows the model host for **GET only**, and asserts that no request to it carries user data (needles in the URL or body).

### Shared units
- `src/ai/loader.ts`: `loadModel(url, { onProgress, signal })` returns `ArrayBuffer`. It streams the download with progress, caches in Cache Storage (`models-v1`), and serves later loads from the cache. It has a cancel signal, and failures raise `ModelError('network' | 'cancelled' | 'unavailable')`.
- `src/ai/capability.ts`: `detect()` returns `{ webgpu: boolean, deviceMemoryGB?: number, webcodecs: { h264Encode: boolean, decode: boolean }, connection?: 'cellular' | 'other' }`.
- Each tool runs in its own Worker (one job at a time, crash handling as `src/pdf/client.ts` does it):
  - `src/ai/bg/worker.ts`
  - `src/ai/ocr/worker.ts`
  - `src/ai/upscale/worker.ts`
  - `src/ai/whisper/worker.ts`
  - `src/pdf/raster-worker.ts`
  - `src/video/worker.ts`
- Islands: `src/ui/ai.ts` (shared states for model tools), `src/ui/pdf-images.ts` and `src/ui/video.ts`. Components: `AiTool.astro` and `VideoTool.astro`; the existing `PdfTool.astro` is extended for the two new ops.

### Engines

- **Background removal:**
  - Resize to the model's input (320 px).
  - Predict an alpha mask, upsample it to the original size with bilinear filtering, and compose RGBA.
  - Output a PNG (via the existing OxiPNG/PNG encoder), or flatten onto white or a chosen colour.
  - Use u2netp when `deviceMemoryGB < 4` or the device is a phone.
  - Input cap: 25 MP; larger images are downscaled to 25 MP first, with a note.
- **OCR:**
  - tesseract.js with `eng` from `${PUBLIC_MODEL_BASE_URL}/tessdata`.
  - Returns text plus mean confidence. Below 70 the page shows the low-confidence note.
- **Upscale:**
  - Process the image in 128 px tiles with 16 px overlap, blended to avoid seams, on WebGPU or WASM.
  - 4× is offered only when WebGPU is present and the device is not a phone.
  - Output is capped at 16 MP.
- **Whisper:**
  - Decode audio with `AudioContext.decodeAudioData`. That covers MP3/M4A/WAV/OGG, and MP4/MOV/WebM audio tracks where the browser supports them.
  - Resample to 16 kHz mono and process in 30 s chunks.
  - Stream text segments as they are produced.
  - Language is auto-detected.
  - Cap: 30 min.
  - SRT/VTT generated from segment timestamps.
- **PDF to images:**
  - pdf.js renders in a worker via OffscreenCanvas at 150 or 300 dpi.
  - Each page is capped at 25 MP; if 300 dpi would exceed that, use 150 dpi and add a note.
  - Output JPG (quality 85) or PNG; several pages go in a ZIP named `<base>-pages.zip` with `<base>-page-<n>.<ext>`.
- **Images to PDF:**
  - Decode with the existing image engine, then embed with pdf-lib (JPEG kept as-is; everything else as PNG).
  - Page size: "Fit to image" (default), A4 or Letter, centred with 36 pt margins.
  - Output: `images.pdf`.
- **Video compress:**
  - mp4box.js demuxes MP4/MOV; WebM is demuxed via the `webm` demux path in mp4box (or rejected with the unsupported-format copy if it isn't feasible; record that ruling).
  - VideoDecoder → optional scale → VideoEncoder H.264 (bitrate presets).
  - Audio: AAC is copied through when present.
  - Output via mp4-muxer.
  - Caps: 2 min, 200 MB.
- **Video to GIF:**
  - Decode the chosen trim (≤ 15 s), sample frames at 10 or 15 fps, scale to 320 or 480 px wide.
  - gifenc with a palette per frame (quantize), then output.

### Analytics
- File and AI tools use `convert_success {tool, count}` / `convert_error {tool, reason}`.
- Reasons are the per-tool error union (`network`, `cancelled`, `unsupported`, `too-large`, `too-long`, `corrupt`, `wrong-type`, `device`).
- Props never carry content.

## 4. Screen states and copy (binding)

Shared AI and heavy-tool states:

| State | Copy |
|---|---|
| Empty | Tool drop line · **Choose <noun>** · "Runs on your device with on-device AI. Your <noun> are never uploaded." (for non-AI tools: "Converted on your device. Your <noun> are never uploaded.") |
| Large model consent (first use, model > 20 MB, not cached) | "This tool downloads a <size> AI model the first time. It's cached for next time." · **Download and start** |
| Mobile data warning (connection cellular, model > 20 MB) | Added line: "You seem to be on mobile data." |
| Downloading | "Downloading the AI model… <done> of <total> MB, one time only" + progress · **Cancel** |
| Download failed | "Couldn't download the AI model. Check your connection." · **Try again** |
| Cancelled | Back to the consent state |
| Low memory | "This tool needs more memory than this device has." |
| No video encoding | "Your browser can't encode video. Try Chrome, Edge, Safari 17+ or Firefox 130+." |
| Working | "<Verb>… <n>%" + progress (Removing background / Reading text / Upscaling / Transcribing / Converting / Compressing / Making GIF) |
| Wrong type | "This is a <TYPE>, not a <input noun>." + **Try <tool> →** where one exists |
| Damaged | "We couldn't read this file. It may be damaged or incomplete." |

Per tool:
- **Remove background:**
  - Drop line: "Drop a photo here".
  - Result on a checkerboard with a before/after slider (aria-label "Compare before and after").
  - Background option: Transparent (default) / White / Colour.
  - **Download PNG** → `<base>-no-bg.png`.
  - Downscale note: "Large photo: processed at 25 MP."
- **Image to text:**
  - Drop line: "Drop an image with text".
  - Output box with **Copy** and **Download .txt** (`<base>.txt`).
  - "Language: English".
  - Low confidence: "Some text may be wrong. Check it before using."
  - No text: "We couldn't find any text in this image."
- **Upscale image:**
  - Drop line: "Drop an image".
  - Choice 2× / 4× (4× hidden when not supported).
  - Before/after slider; **Download PNG** → `<base>-<n>x.png`.
  - Too large: "Upscaled image would be too large. Try 2×." (or "This image is too large to upscale." at 2×).
- **Transcribe audio:**
  - Drop line: "Drop an audio or video file".
  - Live transcript.
  - **Copy** · **Download .txt** · **Download .srt** · **Download .vtt** (`<base>.<ext>`).
  - Too long: "Audio up to 30 minutes for now."
  - Slow device: "This will be slow on this device (about as long as the audio)."
  - No speech: "We couldn't hear any speech in this file."
- **PDF to JPG:**
  - Drop line: "Drop a PDF here".
  - "<n> pages".
  - Format JPG / PNG; quality "Standard (150 dpi)" / "High (300 dpi)".
  - **Convert**.
  - Done: one page gives **Download** `<base>-page-1.jpg`; several give **Download all (ZIP)** with "<n> files".
  - Encrypted and damaged copy as in round 2.
- **JPG to PDF:**
  - Drop line: "Drop images here".
  - Rows with ↑ ↓ ✕ (as in Merge).
  - Page size Fit to image / A4 / Letter.
  - **Create PDF** → `images.pdf` · "<n> pages · <size>".
  - Accepts JPG, PNG, WebP and HEIC.
- **Compress video:**
  - Drop line: "Drop a video here".
  - Quality Smaller file / Balanced (default) / Better quality.
  - Max width Original / 1080p / 720p.
  - Result "<in> → <out>" · **Download MP4** → `<base>-compressed.mp4`.
  - Limits: "Videos up to 2 minutes and 200 MB for now."
  - Unsupported codec: "This video format isn't supported yet. Try an MP4 or MOV."
- **Video to GIF:**
  - Drop line: "Drop a video here".
  - Trim start/end inputs (seconds, ≤ 15 s span) with a preview `<video>`.
  - Width 320 / 480; frame rate 10 / 15.
  - **Make GIF** → `<base>.gif`.
  - Span too long: "GIFs can be up to 15 seconds."

Mobile ≤ 600 px follows the round 2 rules. Before/after sliders are keyboard operable (arrow keys).

## 5. Testing
1. **Unit:**
   - loader: progress, cache hit/miss, cancel, retry, error mapping (fake fetch and Cache API)
   - capability mapping
   - background-removal mask compose and upsample (synthetic mask)
   - upscale tile split and blend (identity "model" yields the input, with no seams)
   - SRT/VTT formatting
   - PDF render sizing and the dpi cap
   - images-to-PDF page sizing
   - video limit checks and trim validation
   - GIF frame sampling
2. **E2E (all engines):**
   - every §4 state with exact copy;
   - models are served from local fixture files by routing `PUBLIC_MODEL_BASE_URL` to the Playwright server (tiny test models where feasible, or a stub worker that returns fixed outputs behind a test flag for model inference);
   - real outputs checked: PNG with an alpha channel, PDF page count, ZIP contents, MP4 `ftyp` and GIF89a headers, SRT timing format, OCR text from a fixture image of known text (real tesseract with the real `eng` fast model, which is small);
   - the WebCodecs-unsupported state is forced by deleting `VideoEncoder` in an init script.
3. **Model quality (manual, `npm run test:models`, not in CI):** background removal on 3 sample photos (visual check), OCR on a receipt (≥ 90% word accuracy), Whisper on a 10 s English clip (WER ≤ 15%).
4. **Privacy:** all new pages; the model host gets GET only; needles (file bytes head, file name, OCR text, transcript text) never appear in any request.
5. **Budget:** ≤ 15 KB JS per page before interaction. All engines, models and libraries are dynamically imported.
6. **Visual:** screenshots of every §4 state at 390 and 1280 px, reviewed by the controller and approved by the owner.

## 6. Definition of done
All tests and reviews clean, the owner has approved the screenshots, and the branch is merged. Then deployment: Cloudflare Pages plus an R2 bucket for models (owner setup).
