# Layout A: Tool Grid — Design Spec

**Date:** 2026-10-24
**Status:** Approved in conversation, awaiting written-spec review
**Builds on:** the jiffkit rebrand (PR #6). Mockups: the "A · Tool grid" row of the *jiffkit layout directions* canvas. Every earlier rule (privacy, JS budget, accessibility, copy) still applies unless this spec says otherwise.

## 1. Intent

Make the site as quick to scan as the market leaders (iLovePDF, Smallpdf) do it: a homepage grid of tool cards with icons and one-tap category filters, and tool pages that open with one large, unmistakable button. Keep what sets jiffkit apart: no ads, no sign-up, no banners, and "never uploaded" stays as prominent as it is today.

Decided in conversation: full A (homepage and tool pages); icons from Lucide; chips only, no search box.

## 2. Homepage

- **Hero**, centred: the h1 "Tools that never upload your files" and the subhead from the rebrand. The title, meta description and `WebSite` JSON-LD are unchanged.
- **Category chips** below the hero: `All`, `Image`, `PDF`, `AI`, `Video`, `Developer`.
  - Each chip is a `<button type="button">` with `aria-pressed`. `All` is pressed by default.
  - Pressing a chip shows only that category's cards. `Developer` covers both the `developer` and `qr` categories, so the JSON formatter, Base64, JWT decoder and QR code generator all show under it.
  - The filter is an inline script that replaces today's search script, within the 15 KB budget.
  - Without JavaScript, the chips are hidden (`hidden` until the script shows them) and every card shows.
  - On phones the chips sit in one row that scrolls sideways (`overflow-x: auto`), with no visible scrollbar on WebKit. Each chip is at least 40 px tall and has 8 px between chips.
- **Grid**: one `<ul>` of 17 cards in registry category order (Image, PDF, AI, Video, Developer, QR), then registry order within each category.
  - 4 columns from 1024 px, 3 from 720 px, and 2 below that.
  - Each card is one `<a href="/<slug>/">` containing a 40 px tile (`--tint` fill, 10 px radius) with a 22 px Lucide icon in `--accent`, the tool `h1` in bold, and the tool `subhead` in `--ink-muted`.
  - Below 720 px the subhead is hidden, the tile is 36 px and the card is at least 96 px tall.
  - Cards have a 1 px `--line` border and a 16 px radius, with no shadow. On hover and focus the border turns `--accent`, and focus also shows the site's focus ring.
- **Removed**: the "Find a tool" label and search input, the `#no-match` message, and the per-category `<h2>` headings. The chips replace all of them.
- `data-category` on each `<li>` is what the filter reads.

## 3. Tool pages: shared header (all 17)

`ToolPage.astro` renders, centred: a 56 px icon tile (14 px radius, 28 px icon), the h1 and the subhead. The subhead's maximum width stays at `--measure`, centred. "How it works", "Questions" and "Related tools" keep their current order and stay left-aligned.

## 4. File tools: the big button (image, PDF, AI and video kinds)

The `.drop` area keeps its markup, its drop handling and its size, so no component logic changes. Only its look changes.

- **At rest:**
  - No dashed border and no tint fill.
  - The `.drop-title` text stays in the DOM for screen readers and drag targets but is visually replaced: the primary `label.btn` becomes one centred, solid accent button, 64 px tall and at least 320 px wide (full width below 720 px), 19 px bold.
  - Under it, "or drop files here" in `--ink-muted`, hidden below 720 px since phones don't drag.
  - Under that, the existing privacy (lock) line, unchanged.
- **While a file is dragged over it** (`.is-over`): the area shows the dashed `--edge` border and `--tint-strong` fill it has today. This is the only time the dashed edge appears.
- **`.drop-compact`** (shown after files are chosen) keeps today's look.
- Each tool's existing button label stays ("Choose PDFs", "Choose photo", and so on). No copy changes.

## 5. Text tools (JSON formatter, Base64, JWT decoder, QR code generator)

They get the shared centred header from section 3. Their editors and output panels stay left-aligned and unchanged.

## 6. Related tools

Rendered with the homepage card markup (icon tile, name, subhead) in a grid of up to 3 columns, replacing today's text list.

## 7. Icons

`src/icons.ts` maps each tool slug to the inner SVG markup of one Lucide icon, copied from the pinned `lucide-static` version at authoring time (no runtime dependency, no extra request). A component `Icon.astro` renders `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">`. These are the planned picks; the implementation plan confirms each name exists in the pinned version:

| Slug | Lucide icon |
|---|---|
| heic-to-jpg | `image` |
| compress-image | `shrink` |
| webp-to-jpg | `images` |
| merge-pdf | `combine` |
| split-pdf | `split` |
| pdf-to-jpg | `file-image` |
| jpg-to-pdf | `file-input` |
| remove-background | `scissors` |
| image-to-text | `scan-text` |
| upscale-image | `maximize-2` |
| transcribe-audio | `mic` |
| compress-video | `video` |
| video-to-gif | `film` |
| json-formatter | `braces` |
| base64-encode-decode | `binary` |
| jwt-decoder | `key-round` |
| qr-code-generator | `qr-code` |

`/licenses/` gains a Lucide entry: version, ISC licence, source link and licence text. The existing licences test covers it.

## 8. Not in scope

A header category nav, a search box, dark mode, sample files for the AI tools, per-category pages, and any copy changes beyond what this spec names.

## 9. Testing

- **Unit (build output):**
  - The homepage has exactly 17 card links, one per tool, in category order.
  - The chips are rendered with `hidden` and `All` is pressed.
  - The homepage has no search input and no category `h2`.
  - Every tool page has the icon tile and every file tool still has its `label.btn` and lock line.
  - `src/icons.ts` has an entry for every slug.
  - `/licenses/` lists Lucide.
- **E2E:** rewrite `home.spec.ts`:
  - The chips are visible once the script runs.
  - `PDF` shows 4 cards, `Developer` 4, `AI` 4 and `All` 17.
  - `aria-pressed` follows the chip.
- **Existing e2e suites must pass unchanged**, since they cover every drop zone. A suite that must change is a sign the restyle reached logic, which it must not.
- **Budget:** `check:budget` stays green on every page.
- **Review:** screenshots at 390 px and desktop width of the homepage (All and one chip), Merge PDF, Remove background, JSON formatter and one drag-over state, reviewed before the PR.
