# Tools Round 2 — Design Spec

**Date:** 2026-10-24
**Status:** Approved in conversation, awaiting written-spec review
**Builds on:** `2026-10-23-image-tools-v1-design.md` (v1, merged). Every v1 rule still applies unless this spec says otherwise.

## 1. Intent

Add six browser-only tools to the same site so that launch (the day after tomorrow) covers more search demand. Each tool is one page aimed at one search. The constraints are the same as v1: nothing is uploaded, ≤ 15 KB JS before interaction, every state designed, and the approved visual system.

Time box: built in about one day, with the same test-and-review bar as v1.

## 2. Scope

| Slug | H1 | Kind |
|---|---|---|
| `/merge-pdf/` | Merge PDF | pdf (`op: 'merge'`) |
| `/split-pdf/` | Split PDF | pdf (`op: 'split'`) |
| `/json-formatter/` | JSON formatter | text (`transform: 'json'`) |
| `/base64-encode-decode/` | Base64 encode and decode | text (`transform: 'base64'`) |
| `/jwt-decoder/` | JWT decoder | text (`transform: 'jwt'`) |
| `/qr-code-generator/` | QR code generator | qr |

The homepage groups tools by category: Image, PDF, Developer, QR.

**Not in this round:** PDF compress, drag-to-reorder, PDF page thumbnails, regex tester, code screenshot, colour tools, file-to-Base64, dynamic/tracked QR codes.

## 3. Architecture

**Approach:** one shared page shell, with a separate engine and island per category. We rejected per-category page copies (duplicated SEO) and a UI framework (JS budget).

### Registry (`src/tools.ts`)
`Tool` becomes a discriminated union on `kind`:
```ts
interface ToolBase { slug: ToolSlug; title: string; description: string; h1: string; subhead: string;
  howTo: [string, string, string]; faq: { q: string; a: string }[]; related: ToolSlug[]; category: 'image'|'pdf'|'developer'|'qr' }
type ImageTool = ToolBase & { kind: 'image'; /* existing v1 fields unchanged */ };
type PdfTool   = ToolBase & { kind: 'pdf'; op: 'merge' | 'split' };
type TextTool  = ToolBase & { kind: 'text'; transform: 'json' | 'base64' | 'jwt' };
type QrTool    = ToolBase & { kind: 'qr' };
export type Tool = ImageTool | PdfTool | TextTool | QrTool;
```
`getTool` and `toolForType` keep their contracts. Image code narrows on `kind === 'image'`. Related links may cross categories.

### Page shell (`src/layouts/ToolPage.astro`)
Shell order: H1, subhead, tool area, how-to, FAQ, related tools. SEO is unchanged. The tool area renders a per-kind component with a static, no-JS fallback:
- `image` → existing drop zone (unchanged)
- `pdf` → `components/PdfTool.astro` + island `src/ui/pdf.ts`
- `text` → `components/TextTool.astro` + island `src/ui/text.ts`
- `qr` → `components/QrTool.astro` + island `src/ui/qr.ts`

Each island loads only on its own pages. Heavy libraries (pdf-lib) are dynamically imported on first interaction (drop-zone hover/focus/drop) and don't count toward the budget, as in v1.

### PDF engine (`src/pdf/`)
- `pdf-lib`, run in a Web Worker (`src/pdf/worker.ts`), one job at a time.
- `merge(files: ArrayBuffer[]): Promise<{ bytes: Uint8Array; pages: number }>` — order as given.
- `split(file, mode: { kind: 'every' } | { kind: 'ranges'; ranges: [number, number][] })` returns `{ name, bytes, pages }[]`.
- `pageCount(file): Promise<number>`.
- `parseRanges(input: string, pageCount: number): [number, number][] | RangeError` — accepts `1-3, 5`, `7-` (open end) and `-4` (open start). Spaces are ignored and duplicates are merged in order. Pages are 1-based.
- Errors map to `'encrypted' | 'corrupt' | 'codec-load'`. pdf-lib's encrypted error → `encrypted`. Never use `ignoreEncryption` to write output.
- Output names: merge → `merged.pdf`; split every page → `<base>-page-<n>.pdf` in `<base>-pages.zip` (fflate, level 0); extract → `<base>-pages-<ranges>.pdf` (e.g. `report-pages-1-3-5.pdf`).

### Text transforms (`src/text/`)
Pure, synchronous functions, unit-testable in Node:
- `json.ts`: `formatJson(input, indent: 2|4|'\t')` and `minifyJson(input)` return `{ ok: true, output } | { ok: false, line, column, message }`. Line and column are 1-based, computed from the parse error position (all three engines report it differently; normalise, or find the offset with a small fallback scanner).
- `base64.ts`: `encode(text, { urlSafe })` and `decode(b64, { urlSafe })` use UTF-8 via TextEncoder/TextDecoder. `decode` returns `{ ok: false }` on invalid input. URL-safe means `-_`, no padding.
- `jwt.ts`: `decodeJwt(token, now: Date)` returns `{ ok: true, header, payload, claims: { exp?, iat?, nbf? } } | { ok: false }`. Claims carry a Date and relative wording ("in 2 hours", "3 days ago") from an injected clock. There is no signature verification.

### QR (`src/qr/`)
- A small QR library (e.g. `qrcode-generator`, ≤ 15 KB min). If it pushes the page over budget, load it via dynamic import on first keystroke or focus.
- `makeQr(text, level: 'L'|'M'|'Q'|'H')` returns a module matrix; `toSvg(matrix)` returns a string; PNG is drawn onto a small canvas (≤ 1024 px; the v1 canvas rule covers only full-size photos).
- Capacity errors are detected before rendering and give the "Too much text" state.

### Analytics
File tools keep `convert_success {tool, count}` / `convert_error {tool, reason}`. PDF uses them too: `count` is the number of output files; reasons are the PDF error union plus `range`. Text and QR tools fire `tool_used {tool}` at most once per page view, on the first Copy or Download. Props never carry content.

## 4. Screen states and copy

The copy is binding. Merge PDF:

| State | Copy |
|---|---|
| Empty | "Drop PDF files here" · **Choose PDFs** · "Merged on your device. Your files are never uploaded." |
| Loading engine | "Getting the PDF tools ready… <measured size>, one time only" |
| One file | "Add at least one more PDF to merge." |
| List | Row: name, "<n> pages", ↑ ↓ ✕ (buttons with aria-labels "Move up/down", "Remove"). **Merge PDFs** (primary) |
| Merging | "Merging <n> files…" |
| Done | `merged.pdf` · "<pages> pages · <size>" · **Download** · **Start over** |
| Password-protected | "This PDF is password-protected. Remove the password and try again." |
| Damaged / not PDF | "We couldn't read this file. It may be damaged or not a PDF." |
| Codec load failed | "Couldn't load the PDF tools. Check your connection." **Try again** |

Split PDF:

| State | Copy |
|---|---|
| Empty | "Drop a PDF here" · **Choose PDF** · "Split on your device. Your files are never uploaded." |
| Loaded | `<name>` · "<n> pages". ◉ "Every page as a separate file" ○ "Extract pages:" `[input, placeholder "1-3, 5"]`. **Split PDF** |
| Invalid range | "Pages must be between 1 and <n>, like 1-3, 5." |
| Done (every) | **Download all (ZIP)** · "<n> files" · **Start over** |
| Done (extract) | `<name>-pages-<ranges>.pdf` **Download** · **Start over** |
| Errors | as Merge |

JSON formatter: textarea (placeholder "Paste JSON here"), **Format** · **Minify** · **Copy**, output below. Options: indent 2 / 4 / tab (default 2). Invalid: "Invalid JSON at line <l>, column <c>: <message>." with the error line highlighted. Empty: buttons disabled. Over 5 MB: "Large file: formatting may take a moment." Copy confirmation: "Copied".

Base64: two boxes, "Text" and "Base64"; editing either updates the other. Toggle "URL-safe". Invalid: "This isn't valid Base64." The text box keeps its last good value.

JWT decoder: input (placeholder "Paste a JWT (eyJ…)"), with **Header** and **Payload** panes below, each with **Copy**. `exp`: "Expires <date> (<relative>)" or "Expired <relative>" in the error colour; `iat` "Issued <date> (<relative>)"; `nbf` "Not valid before <date> (<relative>)". Always visible: "Signature not verified. This tool only decodes the token. Your token never leaves this page." Malformed: "This doesn't look like a JWT. A JWT has three parts separated by dots."

QR code generator: input "Text or URL", live preview, **Download PNG** · **Download SVG**. Options: error correction L/M/Q/H (default M), size 256/512/1024 px (default 512). Empty: placeholder square, "Your QR code appears here." Too long: "Too much text for a QR code (<max> characters max at level <level>)." Under preview: "Static code: works forever, no tracking, no sign-up." Downloads are named `qr-code.png` / `qr-code.svg`.

Mobile (≤ 600 px): single column, full-width buttons, output panes capped at 12 lines with internal scroll.

## 5. Testing
1. **Unit (Vitest):**
   - PDF merge page count and order
   - PDF split, every page and by range
   - `parseRanges`: valid forms, open ranges, duplicates, out of range, garbage
   - encrypted and damaged PDF fixtures map to the right errors
   - JSON line/column
   - Base64 Unicode/emoji round trip and the URL-safe variant
   - JWT decode and relative wording with an injected clock
   - QR round trip via a test-only decoder (e.g. `jsqr`) and the capacity limit
2. **E2E (Playwright, chromium/webkit/firefox):**
   - every §4 state with exact copy
   - downloads are real: PDF magic bytes and page count, ZIP contents, PNG/SVG validity
   - the privacy spec extends to every new page (no request carries file bytes, pasted JSON, a JWT or QR text; needles include a sample JWT)
   - the homepage groups by category
3. **Budget:** `check:budget` covers all 9 tool pages, ≤ 15 KB each.
4. **Visual:** screenshots at 390 and 1280 px for every new page's states. The controller reviews them and the owner approves them.

## 6. Definition of done
All tests and reviews clean, the owner has approved the screenshots, and the branch is merged. Deploy happens separately (owner, day after tomorrow).
