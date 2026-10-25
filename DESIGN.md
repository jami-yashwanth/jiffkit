---
name: jiffkit
description: Free image, PDF, AI, video and developer tools that run on your device, laid out on one calm tool wall.
colors:
  ink: "#141414"
  ink-soft: "#3a3a3a"
  z-image: "#ff6b1a"
  z-pdf: "#1f5eff"
  z-ai: "#12a150"
  z-video: "#c43c84"
  z-developer: "#e0a400"
  board: "#f7f7f4"
  paper: "#ffffff"
  tint: "#f1f1ee"
  tint-strong: "#e2e2dc"
  line: "#d4d4ce"
  edge: "#6b6b66"
  ink-muted: "#55554f"
  disabled: "#e4e4df"
  error: "#b3261e"
typography:
  display:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif"
    fontSize: "clamp(2rem, 4vw, 2.75rem)"
    fontWeight: 800
    lineHeight: 1.15
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif"
    fontSize: "2.5rem"
    fontWeight: 800
    lineHeight: 1.15
    letterSpacing: "-0.03em"
  title:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif"
    fontSize: "1.375rem"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.015em"
  zone-name:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif"
    fontSize: "1rem"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "0"
  wordmark:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif"
    fontSize: "1.25rem"
    fontWeight: 800
    lineHeight: 1.6
    letterSpacing: "-0.02em"
  subhead:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.5
  small:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  body:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
  tag-name:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif"
    fontSize: "1rem"
    fontWeight: 650
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  label:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 600
    lineHeight: 1.5
  small:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.6
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  md: "8px"
  lg: "16px"
  round: "50%"
spacing:
  s1: "4px"
  s2: "8px"
  s3: "16px"
  s4: "24px"
  s5: "32px"
  s6: "48px"
  s7: "64px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "8px 32px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.ink-soft}"
    textColor: "{colors.paper}"
  button-drop:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.md}"
    height: "64px"
    width: "320px"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "8px 24px"
    height: "44px"
  button-quiet-hover:
    backgroundColor: "{colors.tint}"
    textColor: "{colors.ink-soft}"
  button-disabled:
    backgroundColor: "{colors.disabled}"
    textColor: "{colors.ink-muted}"
  icon-button:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    size: "44px"
  zone:
    backgroundColor: "color-mix(in srgb, var(--zone) 7%, #fff)"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "16px"
  zone-dot:
    backgroundColor: "var(--zone)"
    rounded: "{rounded.round}"
    size: "10px"
  tag:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.tag-name}"
    rounded: "{rounded.md}"
    padding: "16px"
    height: "6.5rem"
  tool-tile:
    backgroundColor: "color-mix(in srgb, var(--zone) 12%, #fff)"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    size: "4rem"
  bench:
    backgroundColor: "color-mix(in srgb, var(--zone) 5%, #fff)"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "16px 16px 24px"
  text-input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "48px"
  pane:
    backgroundColor: "{colors.tint}"
    textColor: "{colors.ink}"
    typography: "{typography.mono}"
    rounded: "{rounded.md}"
    padding: "16px"
---

# Design System: jiffkit

<!-- This file supersedes the direction contract in .impeccable/surfaces/src-pages-index-astro.md, which describes the
     earlier loud Tool Wall (stencil display face, pegboard dots, black tape, stamped codes, tag holes, painted
     silhouettes, the swing, full-saturation zone fields). The user rejected that version as stressful; the shipped
     build is the calm version recorded here. Where the two disagree, this file and the code win. -->

## Overview

**Creative North Star: "The Calm Tool Wall"**

Every tool is in view at once, sorted onto one wall by what it works on, and the page stays quiet while you look. The wall keeps its structure from the first version (five zones, one place per tool, every tool a white tag) but drops everything that shouted. The ground is a soft off-white, zones are pale washes of their colour, tags are plain white cards with a hairline edge, and the only type is the device's own face in sentence case.

The reason is the user's: the bright, saturated version felt stressful. That is the governing principle of this system. Colour is a quiet signpost, not the main event. It tells you where a tool lives at a glance and then gets out of the way; ink, white and generous space do the rest.

Tool pages carry the same calm: the top bar, then the tool's icon on a small tile of its zone's wash, and the tool itself on a bench, a 5% mat with a hairline border that says what goes in and what comes out before anything runs. Below sit How it works, Questions, and Related tools as the same white tags.

**Key Characteristics:**
- Off-white ground on every wall page and tool page; white for tags, fields and the bench's inner surfaces.
- Five zone colours used only as pale washes (5 to 16%); never as a solid mark.
- White tags with a 1px hairline border; hover turns the border ink and underlines the name.
- System UI face only, sentence case everywhere, weight and size carry hierarchy.
- Gently rounded: 8px on controls and tags, 16px on zones, tiles and benches.
- Flat: no shadows, no gradients, no ornament. Motion is a 120ms colour or border change.
- Ink controls (buttons, links, focus) at about 17:1 on the ground; every pair checked for WCAG AA.

## Colors

A neutral ink-and-paper system on an off-white ground, with five zone colours held to pale washes.

### Primary
- **Ink** (`ink`): every control and all body text. Primary buttons, links, the focus ring, tag icons, a tag's hover border. Tokenised in code as both ink and "accent", because the accent is ink.
- **Hover Ink** (`ink-soft`): hover fill for primary buttons and hover colour for links. The only hover tone.

### Secondary
The five zone colours. They never appear at full strength on a surface: as washes behind zones and icon tiles, and as a dark tone (58% with black) for icons and the underline of matched text in search results. Everywhere else they are mixed into white.
- **Image Orange** (`z-image`): Image tools.
- **PDF Blue** (`z-pdf`): PDF tools.
- **AI Green** (`z-ai`): on-device AI tools.
- **Video Magenta** (`z-video`): Video tools.
- **Developer Amber** (`z-developer`): every developer tool, on the homepage's Developer zone and on all five /developer/ groups (Security, Encoding, Convert, Text, Code). The zone's name says which group.

Zone tones are mixed in code from the current zone, never stored as extra hexes:
- **Zone wash**: the zone at 7% in white, the ground of a zone on a wall.
- **Tile wash**: the zone at 12% in white, behind a tool's icon on its own page.
- **Bench wash**: the zone at 5% in white, the bench mat's ground.
- **Bench held-over**: the zone at 16% in white, the drop zone while a file is held over it on a bench.

### Neutral
- **Off-white Ground** (`board`): the page ground on walls and tool pages. Plain reading pages (licences) sit on paper.
- **Paper** (`paper`): tags, text inputs, icon buttons, and quiet fills inside a bench.
- **Quiet Fill** (`tint`): panes, loading and alert panels, quiet-button hover.
- **Held Fill** (`tint-strong`): drop zone while a file is held over it off a bench, highlighted error line, selection.
- **Hairline** (`line`): tag and bench borders, row dividers, footer rule, spinner track.
- **Field Edge** (`edge`): input and quiet-button borders, the dashed drop-zone edge (5:1 on paper).
- **Muted Ink** (`ink-muted`): subheads, zone counts, the homepage promises, the In → Out values, FAQ answers, step numbers (7:1 on the ground).
- **Disabled Fill** (`disabled`): disabled button ground; muted ink on it is 5.3:1.
- **Expired Red** (`error`): text only, for a fact that is wrong (an expired token). Never a fill, never a border.

### Named Rules
**The Quiet Signpost Rule.** Colour says where a tool lives and is never the main event. Every surface a zone colour touches is a wash of 16% or less. If a new surface makes colour the first thing you see, it is wrong.

**The Ink Controls Rule.** Buttons, links, focus rings and icons are ink. A zone colour never becomes a button, a link, a border or a focus ring.

**The One Amber Rule.** A developer tool is amber on every wall and every page. Group identity comes from the zone's name, never from a second colour.

## Typography

**Body Font:** the system UI stack (system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue), for headings and text alike.
**Mono Font:** the system monospace stack (ui-monospace, SFMono-Regular, Menlo, Consolas), for code and data only.

**Character:** One family, no font bytes. The device's own face, set tight and heavy for headlines and plain for everything else, so the site reads like the phone it runs on rather than a poster.

### Hierarchy
- **Display** (`display`): the wall headline on the homepage, /developer/ and 404.
- **Headline** (`headline`): a tool page's name beside its icon tile. All headlines drop to 2.125rem on phones.
- **Title** (`title`): section headings (How it works, Questions, Related tools), 64px above (48px on phones).
- **Zone name** (`zone-name`): a zone's heading, with the tool count in muted ink at 500.
- **Wordmark** (`wordmark`): lowercase "jiffkit" at 800, top left, after the mark: a 28px ink square with 8px corners and a white "j".
- **Subhead** (`subhead`): one plain sentence under a headline in muted ink, max 34rem (1.0625rem on phones).
- **Body** (`body`): everything you read; FAQ answers, notes, rows.
- **Tag name** (`tag-name`): a tool's name on its tag.
- **Label** (`label`): button text at 600; the big drop button is 1.1875rem at 700.
- **Small** (`small`): the homepage promises, the In → Out line and the zone link (0.875 to 0.9375rem).
- **Mono** (`mono`): text areas, panes, key-value values and developer text inputs.

### Named Rules
**The Sentence Case Rule.** Every heading, label and button is sentence case. Nothing is set in uppercase or letter-spaced capitals.

**The One Family Rule.** Headings and text share the system face; hierarchy comes from weight (800, 700, 650, 600) and size. Mono is for what a visitor pastes or copies, never for labels.

## Layout

Two measures. Wall pages (home, /developer/, 404) use a 76rem container; tool pages and reading pages keep a 40rem measure. Pages have 16px side padding and 48px bottom padding. All spacing comes from the 4/8 scale; 16px separates zones and pads them, 8px separates tags.

**The walls.** On phones zones stack full width (8px side padding) and tags sit two to a row. From 720px the homepage wall is a six-column grid: Image, PDF and AI two columns each on top, Video two and Developer four below. The /developer/ wall is two columns from 720px and three from 1100px. Inside a zone, tags auto-fill at a 9.5rem minimum. The wall head is the headline over its subhead, 32px above the wall.

**The frame.** The top bar, the walls and the footer share one width on every page: 76rem, with 16px gutters. Tool pages and the licences page narrow only their content, to the 40rem reading measure, under the same full-width bar. Every page has the same off-white ground.

**The top bar.** One white strip with a hairline under it, on every page: the mark and wordmark on the left (a link to the homepage) and the quiet search on the right. On phones the search takes its own full-width row. The footer is one muted line over a hairline.

**The wall heading** (homepage, /developer/, 404). Centred, one size (clamp 1.875rem to 2.5rem; every h1 is 1.875rem on phones), with an optional muted line under it. On the homepage: the headline, "Free tools for images, PDFs, video and code" (clamp 1.875rem to 2.5rem), and three promises with a Lucide check in ink: Nothing uploaded, No account, No watermarks. 32px of air before the wall.

**Tool pages.** Top to bottom: the top bar, the tool head 32px under it (the 4rem icon tile beside the name and subhead; 3.25rem on phones), the bench 32px below, then How it works as numbered rows between hairlines, Questions, and Related tools as white tags. On phones the drop button goes full width (64px tall) and the drop zone's dashed edge and hint text drop away.

**The Every Tool Is In View Rule.** A wall shows every tool it holds at once; there is no carousel, tab or "show more" on a wall.

### Icon tiles
Every icon sits on a tile: a 16% wash of its zone with the icon in a dark tone of the same colour (the zone mixed 58% with black, at least 4.5:1 on the wash). Tags: 40px tiles, 10px corners, 22px icons. A tool page's head: a 4rem tile (3.25rem on phones), 32px icon. Search results: 36px tiles, 18px icons. Each zone's name has a 26px white mark with the zone's own Lucide icon in the dark tone (Image image, PDF file-text, AI sparkles, Video film, Developer code; on /developer/ Security shield-check, Encoding binary, Convert arrow-left-right, Text type, Code braces); white, so it stands off the zone's wash.

## Elevation & Depth

Flat. No shadows, no glows, no gradients. Separation comes from three quiet layers: the off-white ground, a pale zone wash or bench, and a white tag or field with a hairline edge. The only patterned fill is the transparency checkerboard behind a cut-out image.

### Named Rules
**The Hairline Lift Rule.** A tag shows it is live by its border turning from hairline to ink and its name underlining, over 120ms. Nothing moves, lifts or casts a shadow. Under reduced motion the change is instant.

## Shapes

Gently rounded. Controls, tags, inputs, panes, panels and thumbnails use 8px; the larger containers (zones, the icon tile, the bench, the QR preview, the drop zone) use 16px. Round only for discs: spinners and the compare slider's grip. Borders are few and thin: 1px hairline on tags, the bench and icon buttons; 1px field edge on inputs and quiet buttons; a 2px dashed edge on the drop zone only while a file is held over it.

Icons are Lucide (lucide-static) drawn inline as SVG at 1.8 stroke with round caps and joins, in ink: 28px on tags, 32px in a tool's tile, 16px in links and the In → Out arrow. Status marks (lock, check, alert, up, down, remove) are authored 16px SVG masks.

## Components

### Buttons
Ink blocks with 8px corners; one primary per state.
- **Primary:** ink fill, white label at 600, 44px minimum height, 8px by 24px padding (32px sides on a file label).
- **Drop button:** the file chooser, 64px tall and 320px wide at 700; full width on phones.
- **Hover / Focus:** hover changes the fill to hover ink; focus is a 2px ink ring offset 3px. Hover and focus never look alike.
- **Quiet:** transparent with a field-edge border and ink label; quiet fill on hover. Used for every secondary action (Start over, Cancel, Add more, per-file downloads once "Download all (ZIP)" exists). A failed row's recovery and a lone remaining action are promoted back to primary.
- **Disabled:** disabled fill with muted ink.
- **Icon button:** 44px white square, 8px corners, hairline border, a drawn 16px mask icon; hover takes quiet fill and a field-edge border.

### Zones
A pale wash of the zone's colour with 16px corners and 16px padding. The head holds the zone's name and its count in muted ink; on the homepage's Developer zone it also holds the link "All 29 developer tools" with an arrow, in ink at 600. Below, the tags in their grid.

### Tool Tag (signature)
The unit of the whole site. A white card with a 1px hairline border and 8px corners, at least 6.5rem tall with 16px padding: a 28px ink line icon over the tool's name at 650. The whole tag is the link. On hover the border turns ink and the name underlines; focus adds the 2px ink ring. Tags look the same on every wall and under Related tools.

### Tool Head
The tool's icon at 32px in ink, centred on a 4rem tile of its zone's 12% wash with 16px corners, beside the headline and subhead.

### Bench
Where the file goes. A mat of the zone's 5% wash with a 1px hairline border, 16px corners and 16px padding (24px bottom). It opens with the In → Out line ("In PDFs → Out one PDF": the words In and Out in ink at 650, the values in muted ink), present on every tool before anything runs. Inside the bench, quiet fills become white and the held-over fill becomes the zone at 16%. The tool (drop button and privacy line, or text areas and options) sits 16px under the In → Out line.

### Search
One box finds any tool by name, zone or the words people type ("png to jpg", "remove bg", "sha256"). It sits in the same place on every page, the homepage included: the right of the top bar. Quiet: 40px tall, up to 18rem, a hairline edge, 10px corners and a muted 18px Lucide search icon; the edge and icon turn ink on hover and focus, and focus thickens the edge instead of adding a ring. Placeholder: "Find a tool". On phones it takes its own full-width row under the mark. The "/" shortcut is named once, in the results footer ("/ to search"). Results open leftwards from the box's right edge.

The results panel: white, 1px edge, 12px corners, 6px inside. A muted count on top ("3 tools"), then up to six 56px rows: the tool's icon on a 36px tile of its zone's 14% wash, the name at 600 with the typed part underlined in a darker zone tone, the first sentence of its subhead in muted ink (one line, ellipsis), and the zone name on the right; the active row takes the quiet tint and shows "Enter ↵". A footer of key hints (↑ ↓ move, ↵ open, esc close) shows on pointer devices. Focused while empty, it shows "Try" and three starting points (never the page you are on) with "Search by format too, like heic or sha256." No match reads "No tool for “…” yet. See all tools"; a failed load reads "Search didn’t load. Check your connection, or see all tools." and tries again on the next focus. Nothing typed leaves the page: the input has no name, and the list (/search-index.json) is fetched whole on first focus and cached.

### Inputs / Fields
- **Style:** white field, 1px field-edge border, 8px corners, 48px minimum height, 8px by 16px padding. Text areas and developer text inputs are mono at 0.9375rem; a transcript text area returns to the body face.
- **Focus:** the border turns ink and the ink ring sits flush (offset 0).
- **Disabled:** white with a hairline border and muted text.
- **Checkboxes, radios, ranges, progress:** native controls tinted ink, 18px boxes, 44px tap rows, 8px progress bars.

### Panes, Panels and Rows
Output panes are quiet fill with mono text (max 36em, 18em on phones). Loading, AI consent, video and PDF alert panels share one quiet-fill shape with 8px corners, 16px padding and a 16px gap. Result rows are a 48px thumbnail, name and size, and an action, divided by hairlines. Warnings carry a drawn alert mark, never a glyph.

### Privacy Line
Under the drop button: a sentence in ink at 500 with the drawn lock mark ("Merged on your device. Your files are never uploaded."). The site-wide promise is the homepage's three checks: Nothing uploaded, No account, No watermarks.

### Motion
One family, one curve (`--ease-out`, cubic-bezier(0.2, 0.8, 0.2, 1)). Things that appear fade in and settle 4px: the search panel rises in (140ms); finished file rows, developer tool outputs, AI results, the JSON and JWT panes and the "Copied" note fade up (180ms). A tag's icon lifts 2px on hover (160ms); buttons press to 0.98 (80ms); the drop zone's tint eases in while a file is held over it. Nothing moves on page load or on scroll, and nothing staggers. Under reduced motion every transition and animation is off.

## Do's and Don'ts

### Do:
- **Do** put every tool in exactly one zone and show it as a white tag.
- **Do** keep zone colour to washes (16% or less), and keep every control ink.
- **Do** show In → Out on every tool's bench before the tool runs.
- **Do** give every tool page the top bar, the icon tile on its zone's wash, and the bench.
- **Do** use 8px corners on controls and tags, 16px on zones, tiles and benches.
- **Do** write plain copy in sentence case ("Your files never leave your device").
- **Do** draw icons as inline Lucide SVG at 1.8 stroke in ink, and status marks as drawn SVG masks.
- **Do** keep tap targets at 44px or more and check every new colour pair for WCAG AA.

### Don't:
- **Don't** fill a surface with a saturated zone colour; the bright version was rejected as stressful.
- **Don't** give a developer group its own colour; every developer tool is amber.
- **Don't** add a display or web font, uppercase labels, tape labels or stamped codes.
- **Don't** add drop shadows, glows, gradients, background patterns or decorative motion; a tag never moves.
- **Don't** colour a button, link, border or focus ring with a zone colour.
- **Don't** use text glyphs (↑ ↓ ✕ ⚠) for icons; draw them.
