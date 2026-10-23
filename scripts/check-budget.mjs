// Gzip-sums every script a tool page loads before a file is dropped: entry <script>s (inline and src),
// <link rel="modulepreload">, and every chunk those import statically, recursively. Dynamic import()
// targets (codecs, the worker, the ZIP code) load only on hover/drop and are not counted. Fails over 15 KB.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, posix } from 'node:path';

const BUDGET = 15 * 1024;
const dist = 'dist';
const skip = new Set(['_astro']);
const pages = readdirSync(dist, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !skip.has(d.name) && existsSync(join(dist, d.name, 'index.html')))
  .map((d) => d.name);

// `import x from "./a.js"`, `import"./a.js"`, `export * from "./a.js"`. Not `import("./a.js")`.
const STATIC_IMPORT = /(?:^|[^\w$.])(?:import|export)\s*(?:[\w$*{}\s,]*?\s*from\s*)?["']([^"']+)["']/g;

const fileFor = (url) => join(dist, url.replace(/^\//, ''));

/** Absolute URL path of a static import specifier, or null for bare/remote specifiers. */
function resolveImport(fromUrl, spec) {
  if (spec.startsWith('/')) return spec;
  if (spec.startsWith('./') || spec.startsWith('../')) return posix.join(posix.dirname(fromUrl), spec);
  return null;
}

let failed = false;
for (const slug of pages) {
  const html = readFileSync(join(dist, slug, 'index.html'), 'utf8');
  const seen = new Set();
  let bytes = 0;

  const addScript = (url) => {
    if (seen.has(url)) return;
    seen.add(url);
    const file = fileFor(url);
    if (!existsSync(file)) return;
    const code = readFileSync(file);
    bytes += gzipSync(code).length;
    for (const m of code.toString('utf8').matchAll(STATIC_IMPORT)) {
      const next = resolveImport(url, m[1]);
      if (next) addScript(next);
    }
  };

  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    const attrs = m[1];
    if (/type="application\/ld\+json"/.test(attrs)) continue;
    const src = attrs.match(/\bsrc="([^"]+)"/);
    if (src) {
      addScript(src[1]);
    } else {
      bytes += gzipSync(m[2]).length;
      for (const i of m[2].matchAll(STATIC_IMPORT)) {
        const next = resolveImport(`/${slug}/index.html`, i[1]);
        if (next) addScript(next);
      }
    }
  }
  for (const m of html.matchAll(/<link\b[^>]*\brel="modulepreload"[^>]*>/g)) {
    const href = m[0].match(/\bhref="([^"]+)"/);
    if (href) addScript(href[1]);
  }

  const ok = bytes <= BUDGET;
  console.log(`${ok ? 'OK  ' : 'FAIL'} /${slug}/ ${(bytes / 1024).toFixed(2)} KB gzip (budget 15 KB)`);
  if (!ok) failed = true;
}
process.exit(failed ? 1 : 0);
