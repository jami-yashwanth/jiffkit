# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two audiences of equal weight (confirmed by the product owner, 2026-10-25):

- **Everyday people with a file to fix right now:** an iPhone HEIC that won't open, PDFs to merge or split, a photo whose background must go, a recording to transcribe, a video too big to send. They arrive from search with one task, often on a phone, and leave as soon as it's done.
- **Developers and technical users:** people who paste tokens, keys, configs, SQL and customer data into utilities (JSON, JWT, hashes, regex, cron, YAML/CSV) and would rather none of it touched a server.

The homepage and navigation must serve both without making either feel like the secondary audience.

## Product Purpose

jiffkit is a free collection of file and developer tools (42 today: image, PDF, on-device AI, video, developer) that run entirely in the visitor's browser. Files and text are processed on the visitor's device and never uploaded. There is no sign-up and no paywall. Success is a visitor finishing their task in one visit and trusting the site enough to come back.

## Positioning

Open decision: the product owner has not chosen a single headline among "never uploaded" (privacy), "fast and simple" (the "jiffy" in the name) and "AI on your device" (background removal, transcription and upscaling running locally, which few competitors offer without uploads). What is true of all three: every tool runs on the device, nothing is uploaded, nothing requires an account.

## Operating Context

- Visitors land on a single tool page from search far more often than on the homepage; each tool page must stand alone.
- A tool page's job: choose or drop a file (or paste text), adjust a few options, download or copy the result.
- AI tools download a model once (5 MB to tens of MB) and then work offline; the page asks before a large download.
- Competitors (iLovePDF, Smallpdf, TinyPNG, remove.bg, it-tools, CyberChef) are free, established and well known. Most upload files to their servers.

## Capabilities and Constraints

- Static Astro site on Cloudflare Pages at jiffkit.com; AI models served from models.jiffkit.com (R2).
- Hard limits that every design must keep: under 15 KB of gzip JavaScript per page before interaction; no third-party requests (no web fonts from a CDN, no trackers; analytics is Umami Cloud only: cookieless, Do Not Track respected, events carry a tool name and a count or reason); WCAG AA; works at 390 px.
- Light theme only today; dark mode is not built.
- Tool pages carry SEO content (How it works, Questions, Related tools) that must stay.
- Tools are listed from one registry (`src/tools.ts`, `src/dev/tools.ts`); 17 tools on the homepage plus a card for the 29 developer tools on `/developer/`.

## Brand Commitments

- Name: **jiffkit** (lowercase wordmark). Domain jiffkit.com.
- Favicon: a white lowercase "j" on the green accent square (`public/favicon.svg`).
- Voice: plain, direct, honest. No hype; every privacy and capability claim must be true and is tested.
- Icons: Lucide (pinned, ISC).
- The current visual look (green accent, system font, card grid) is not binding: the product owner finds it generic, without brand feel, not trustworthy enough, and finds tools hard to locate.

## Evidence on Hand

- 42 working tools, verified on the live site.
- Open-source licences page (`/licenses/`) listing every library and model.
- No testimonials, user counts, press, ratings or reviews exist. None may be invented.
- No analytics yet: there is no usage data on which tools are popular.

## Product Principles

1. **Nothing leaves the device.** Every design choice that adds a request, a dependency or a tracker breaks the product.
2. **The task is the hero.** A visitor should reach "choose a file" or "paste here" in the first viewport of any tool page.
3. **Honest over impressive.** No claim, number or proof that isn't true and verifiable.
4. **Two audiences, one front door.** Everyday file tasks and developer utilities are equals.
5. **Light enough for a cheap phone.** Speed and small pages are part of the promise.

## Accessibility & Inclusion

WCAG 2.2 AA: text contrast 4.5:1, 44 px touch targets, full keyboard use, live regions for results and errors, reduced-motion respected.
