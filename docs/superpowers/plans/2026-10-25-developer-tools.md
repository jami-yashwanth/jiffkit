# Developer Tools (25) Implementation Plan

> Executed natively in one session (superpowers:executing-plans), one PR at the end, per the product owner.

**Goal:** 25 clean-room developer tools on their own pages, a `/developer/` hub, and a hub card on the homepage.
**Architecture:** a declarative form spec per tool (`src/dev/tools.ts`), one generic Astro component and one client runtime (`src/ui/dev.ts`), and one pure, unit-tested logic module per tool (`src/dev/run/<slug>.ts`) loaded by dynamic import.
**Tech stack:** Astro 7, vanilla TS, Vitest, Playwright; yaml 2.9.1, marked 18.1.0, sql-formatter 15.9.0, bcryptjs 3.0.3, cronstrue 3.31.0, diff 9.0.0 (exact pins).
**Spec:** `docs/superpowers/specs/2026-10-25-developer-tools-design.md`

## Global constraints

- No request but same-origin on a dev page; typed text never leaves the page; outputs rendered with `textContent`/DOM nodes, never `innerHTML` of user input.
- 15 KB gzip JS before interaction on every page; tool modules and libraries are dynamic imports.
- Titles ≤ 60 chars, descriptions 120–160, 4–5 FAQs, 3 how-to steps; no copy from it-tools.
- Labels on every field, outputs announced via `role="status"`, 44 px targets, AA contrast.

## Review focus

1. Huge input (1 MB pasted): live tools stay responsive (debounce; no quadratic work on keystroke).
2. Hostile input: `<script>` in Markdown, HTML entities, regex text, SQL: never executed, never injected as HTML.
3. Catastrophic regex `(a+)+$` on `aaaa…b`: worker limit fires, page stays usable, next pattern works.
4. Empty input on every tool: no error, outputs clear.
5. Keyboard-only use of every form, and copy buttons announce "Copied".

## Tasks

1. **Shell:** pin the six libraries; `DevTool` types and form spec; `DevTool.astro`; `src/ui/dev.ts` runtime (field reading, dynamic import, debounce, renderers, copy, `tool_used`); `ToolPage` wiring; icons; `/developer/` hub with chips; homepage hub card; licences entries. First tool end-to-end: URL encode/decode. Tests: build output for hub/home, unit for the runtime-free URL module, e2e for URL.
2. **Security:** hash, password, UUID, bcrypt, HMAC. Unit vectors; e2e.
3. **Encoding:** HTML entities, timestamp, number base. Unit; e2e.
4. **Convert:** YAML→JSON, JSON→YAML, JSON→CSV, CSV→JSON, color, case. Unit; e2e.
5. **Text:** word counter, text diff, lorem ipsum, slugify, Markdown→HTML. Unit; e2e (preview sandbox).
6. **Code:** regex (worker + limit), cron, SQL, XML, subnet. Unit; e2e (regex limit).
7. **Cross-cutting e2e:** same-origin-only requests on all dev pages; hub chips; keyboard copy.
8. **Review and ship:** screenshots at 390/1280, full gate (unit, typecheck, build, budget, e2e with 3 workers), fresh whole-branch review, fixes, one PR.
