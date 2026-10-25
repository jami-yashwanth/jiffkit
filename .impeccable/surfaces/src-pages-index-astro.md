---
version: 1
slug: "src-pages-index-astro"
primary_target: "src/pages/index.astro"
related_targets: ["src/pages/developer.astro","src/layouts/ToolPage.astro","src/pages/404.astro"]
---

# jiffkit site: The Tool Wall

Scope: homepage (Persuade), /developer/ hub (Persuade), every tool page (Operate), 404. Two audiences of equal weight (PRODUCT.md). Constraints: system fonts only, no third-party requests, 15 KB JS before interaction, WCAG AA, 390 px.

## Direction contract

THESIS: Every tool hangs in its own painted outline on one wall, so you always know where it lives and can see it never leaves the workshop. Refuses the category grid of interchangeable icon cards and its dark-neon opposite.

OWN-WORLD: Light steel pegboard (#efefeb) with a 24 px peg-hole dot grid; zones are full flat fields of one tape colour each (Image orange #ff6b1a, PDF cobalt #1f5eff, AI green #12a150, Video magenta #c43c84, Developer yellow #ffc21a); tools are white hanging tags with a punched hole, a large ink line icon (Lucide, 1.8 stroke) and a stamped mono code (IMG-01); black tape labels with white uppercase stencil-spaced text; ink #141414; no shadows, no gradients, no rounded-pill chips.

STORY: The visitor sees every tool at once, sorted onto a wall they understand, reads that nothing leaves the workshop, picks a tag, and finds that tool on a bench where their file goes.

FIRST VIEWPORT: Desktop: a thin header strip (wordmark left, tape label NOTHING LEAVES THE WORKSHOP right); one line of headline copy; then the wall filling the rest: five zone fields in a grid (Image, PDF, AI wide on top, Video and Developer below), each with its tape label and tags. Phone: the headline, then zones stacked full width, two tags per row. The primary action is any tag; there is no hero button.

FORM: Pegboard tool wall with painted outlines, position 6 of 7 on the ordered grounded list (re-roll round 1), seed key ed2c54b6. Raises: colour at page scale (each zone a full flat field, from the cut-paper title cards); edge codes on every tool (from hand-processed film); tool-page steps as horizontal bands (from the coiled tower); the bench shows what comes out before you run it (from the live-code floor). Signature interaction: a tag swings on its peg on hover and focus (reduced motion: no swing). Tool pages: a zone-coloured strip with the tool's code and a way back to the wall, the tag large, the drop zone as a bench mat that shows IN → OUT.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
