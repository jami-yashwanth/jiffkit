// Gzip-sums every <script> asset referenced by each tool page in dist/. Fails over 15 KB.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const BUDGET = 15 * 1024;
const dist = 'dist';
const skip = new Set(['_astro']);
const pages = readdirSync(dist, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !skip.has(d.name) && existsSync(join(dist, d.name, 'index.html')))
  .map((d) => d.name);

let failed = false;
for (const slug of pages) {
  const html = readFileSync(join(dist, slug, 'index.html'), 'utf8');
  let bytes = 0;
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    const attrs = m[1];
    if (/type="application\/ld\+json"/.test(attrs)) continue;
    const src = attrs.match(/\bsrc="([^"]+)"/);
    if (src) {
      const file = join(dist, src[1].replace(/^\//, ''));
      if (existsSync(file)) bytes += gzipSync(readFileSync(file)).length;
    } else {
      bytes += gzipSync(m[2]).length;
    }
  }
  const ok = bytes <= BUDGET;
  console.log(`${ok ? 'OK  ' : 'FAIL'} /${slug}/ ${(bytes / 1024).toFixed(2)} KB gzip (budget 15 KB)`);
  if (!ok) failed = true;
}
process.exit(failed ? 1 : 0);
