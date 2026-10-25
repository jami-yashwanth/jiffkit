# Developer Tools (25) — Design Spec

**Date:** 2026-10-25
**Status:** Decided in conversation (scope, licence, placement, delivery). The product owner asked for an uninterrupted build ending in one PR, so this spec and its plan are a record, not approval gates.
**Builds on:** Layout A (PR #7). Every earlier rule still applies: privacy (no request but same-origin; nothing typed ever leaves the page), 15 KB gzip JS before interaction per page, WCAG AA, honest copy, 60-character titles, 120–160-character descriptions, 4–5 FAQ entries and 3 how-to steps per tool.

## 1. Intent and decisions

Add the 25 developer tools from it-tools.tech's catalogue with the most search demand where privacy matters (people paste tokens, passwords, customer data and internal SQL into these).

- **Clean-room code.** it-tools is GPL-3.0. Nothing is copied from it: no code, copy or assets. Each tool is written from its public specification (RFCs, the JS platform) or uses a permissively licensed library.
- **A `/developer/` hub.** The homepage keeps its 17 tool cards and gains one hub card under Developer. The hub lists every developer tool (the 25 new ones plus JSON formatter, Base64, JWT decoder and QR code generator) as cards with group chips.
- **One PR at the end.**

## 2. The 25 tools

Group, then `slug` — H1 — what it does. "live" means the output updates as you type (150 ms debounce); "button" means a primary button runs it; "load" means it also runs once when the page loads.

**Security**
1. `hash-generator` — Hash generator — MD5, SHA-1, SHA-256, SHA-384 and SHA-512 of the text, hex. Live. MD5 is our own implementation (WebCrypto has none); SHA via `crypto.subtle`. Each row copyable.
2. `password-generator` — Password generator — length 8–64 (default 20), upper, lower, digits, symbols, "avoid look-alike characters". Load + button "Generate". `crypto.getRandomValues` with rejection sampling (no modulo bias). Shows the entropy in bits.
3. `uuid-generator` — UUID generator — v4 (`crypto.randomUUID`) or v7 (time-ordered, RFC 9562), 1–100 at once. Load + button.
4. `bcrypt-generator` — Bcrypt hash and verify — password, cost 4–14 (default 10); button "Hash". Optional "Hash to check" box: says whether the password matches. bcryptjs (BSD-3-Clause), async API so the page stays responsive.
5. `hmac-generator` — HMAC generator — message, key, SHA-1/256/384/512, hex or Base64. Live. `crypto.subtle`.

**Encoding**
6. `url-encode-decode` — URL encode and decode — encode/decode, as a component (`encodeURIComponent`) or a full URL (`encodeURI`). Live. A malformed `%` sequence is an error naming its position.
7. `html-entities` — HTML entity encoder and decoder — encode `& < > " '` (optionally all non-ASCII as numeric entities) or decode any named/numeric entity. Live. Decoding uses the browser's HTML parser in an inert document.
8. `unix-timestamp-converter` — Unix timestamp converter — seconds, milliseconds or an ISO/date string in; Unix s, Unix ms, ISO 8601 UTC, UTC, local time and relative time out. Load (with "now") + live.
9. `number-base-converter` — Number base converter — a value in base 2, 8, 10 or 16 out to all four. BigInt, so any length. Live.

**Convert**
10. `yaml-to-json` — YAML to JSON — `yaml` (ISC). Indent 2/4. Live.
11. `json-to-yaml` — JSON to YAML — `yaml`. Live.
12. `json-to-csv` — JSON to CSV — an array of objects (or of arrays) to RFC 4180 CSV, columns from the union of keys in first-seen order, nested values as JSON. Delimiter comma/semicolon/tab. Live. Own code.
13. `csv-to-json` — CSV to JSON — RFC 4180 parsing (quotes, escaped quotes, newlines in fields), first row as headers (on by default), delimiter auto/comma/semicolon/tab. Live. Own code.
14. `color-converter` — Color converter — HEX, RGB, HSL (and a colour picker, kept in sync). Live. Own code.
15. `case-converter` — Case converter — camelCase, PascalCase, snake_case, CONSTANT_CASE, kebab-case, Title Case, Sentence case, lower, UPPER. Live. Own code.

**Text**
16. `word-counter` — Word counter — words, characters (with and without spaces), sentences, paragraphs, lines, reading (238 wpm) and speaking (150 wpm) time. Live. `Intl.Segmenter` for words where available.
17. `text-diff` — Text diff — original and changed text, line diff with added/removed lines marked, option to ignore whitespace. Live. `diff` (BSD-3-Clause).
18. `lorem-ipsum-generator` — Lorem ipsum generator — 1–50 paragraphs, sentences or words, optional classic opening. Load + button. Own code (deterministic word list, random order).
19. `slugify` — Slugify — URL slug from any text: accents stripped, separator `-` or `_`, lowercase on by default. Live. Own code.
20. `markdown-to-html` — Markdown to HTML — HTML source (copyable) and a rendered preview in a sandboxed iframe (`sandbox=""`, no scripts). Live. `marked` (MIT).

**Code**
21. `regex-tester` — Regex tester — pattern, flags, test text; matches highlighted, with each match's groups listed. Live. The match runs in a worker with a 1-second limit, so a catastrophic pattern says "took too long" instead of freezing the page.
22. `cron-expression-parser` — Cron expression explainer — 5-field cron to plain English (`cronstrue`, MIT) and the next 5 run times in local time (own matcher). Live.
23. `sql-formatter` — SQL formatter — dialects SQL, PostgreSQL, MySQL, SQLite, T-SQL, BigQuery; keyword case upper/lower/preserve. Live. `sql-formatter` (MIT).
24. `xml-formatter` — XML formatter — indent 2/4/tab; validated with the browser's XML parser, error shown with its line. Live. Own pretty-printer.
25. `subnet-calculator` — IPv4 subnet calculator — CIDR (`10.0.0.0/22`) or address + netmask in; network, netmask, wildcard, broadcast, first/last host, usable hosts, total addresses and whether it's private. Live. Own code.

## 3. Architecture

- **Registry:** `src/dev/tools.ts` holds the 25 entries (copy, group, form). `TOOLS` in `src/tools.ts` gains them as `kind: 'dev'`, `category: 'developer'`, so every existing per-tool rule and test applies.
- **Form spec:** each entry declares `fields` (textarea, text, number, range, select, checkbox, color), `outputs` (`text`, `table`, `diff`, `highlight`, `preview`) and `run` (`live`, `button`, `load`). `DevTool.astro` renders it as static, labelled markup; nothing about a tool's form reaches the client bundle except what is in the HTML.
- **Logic:** one module per tool in `src/dev/run/<slug>.ts` exporting `run(values, changed) → { out, error?, status?, set? }`. Pure where possible, unit-tested. `src/ui/dev.ts` mounts any form, reads its fields, imports the tool's module **dynamically** (on the first interaction, or at load for `load` tools), renders outputs with `textContent` and DOM nodes only (never `innerHTML` from user input; the Markdown preview goes into a `sandbox=""` iframe's `srcdoc`), and reports `tool_used` on the first successful Copy, as the text tools do.
- **Budget:** the page loads `ui/dev.ts` (small) before interaction; tool modules and libraries are dynamic imports, outside the 15 KB budget by the existing rule.
- **Privacy:** no tool makes a network request. An e2e check asserts that every request each tool page makes is same-origin.

## 4. Pages

- **Tool pages** use the existing `ToolPage` layout (icon header, How it works, Questions, Related tools).
- **`/developer/`** (wide container): h1 "Developer tools", subhead, chips All / Security / Encoding / Convert / Text / Code, a grid of 29 cards. JSON formatter → Code, Base64 → Encoding, JWT decoder → Security, QR code generator → Encoding. In the sitemap. Title and description follow the length rules.
- **Homepage:** one extra card, "Developer tools", in the Developer category, after QR code generator, linking `/developer/`. The Developer chip then shows 5 cards.
- **Icons:** Lucide 1.52.0 — hash, rectangle-ellipsis, fingerprint, lock-keyhole, shield-check, link, code-xml, clock, calculator, file-json, file-code, sheet, table, palette, case-sensitive, text, diff, pilcrow, link-2, file-text, regex, calendar-clock, database, code, network; the hub card uses terminal.

## 5. Copy

Every tool: title ≤ 60 characters, description 120–160, H1 as listed, a one-sentence subhead ending in the privacy point, 3 how-to steps, 4–5 FAQ entries. FAQs answer real questions (e.g. "Is MD5 safe for passwords?" — no) and never overclaim. No copy is taken from it-tools.

## 6. Licences

`/licenses/` lists yaml (ISC), marked (MIT), sql-formatter (MIT), bcryptjs (BSD-3-Clause), cronstrue (MIT) and diff (BSD-3-Clause), version-tagged, with their licence text. The existing test that every dependency is listed covers them.

## 7. Testing

- **Unit:** each `run` module against known vectors (RFC 1321 MD5, RFC 4231 HMAC, RFC 4180 CSV, RFC 9562 UUID v7 layout, known subnets, cron next-runs from a fixed date, case and slug edge cases, base conversion of large numbers, CSV↔JSON round trips).
- **Build output:** registry rules (automatic), hub page lists 29 cards with group chips, homepage has the hub card, every dev page has its labelled fields.
- **E2E (chromium):** every tool, real input → expected output; the hub chips; same-origin-only requests on every dev page; the regex worker's time limit; the Markdown preview runs no script.
- **Budget:** `check:budget` passes on every page.
- **Visual:** the hub and a representative tool from each group at 390 px and 1280 px, reviewed before the PR.

## 8. Not in scope

The other 57 it-tools tools, a search box, per-group pages, JSON↔XML and TOML, Plausible events beyond `tool_used`.
