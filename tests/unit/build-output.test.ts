import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import config from '../../astro.config.mjs';
import { TOOLS } from '../../src/tools';

// The same value the build used: SITE_URL or the default in astro.config.mjs.
const SITE = config.site as string;
const html = (p: string) => readFileSync(`dist/${p}index.html`, 'utf8');

beforeAll(() => {
  // Hermetic: the default build has no analytics, whatever the shell exports.
  const env = { ...process.env };
  delete env.PUBLIC_PLAUSIBLE_DOMAIN;
  execSync('npx astro build', { stdio: 'pipe', env });
}, 180_000);

describe.each(TOOLS)('tool page $slug', (tool) => {
  const page = () => html(`${tool.slug}/`);

  it('has registry title, description, own canonical, one h1', () => {
    const h = page();
    expect(h).toContain(`<title>${tool.title}</title>`);
    expect(h).toMatch(/<meta name="description" content="[^"]+"/);
    expect(h).toContain(`<link rel="canonical" href="${SITE}/${tool.slug}/"`);
    expect(h.match(/<h1[\s>]/g)).toHaveLength(1);
  });

  it('has FAQPage JSON-LD matching the registry', () => {
    const blocks = [...page().matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) =>
      JSON.parse(m[1]),
    );
    const faq = blocks.find((b) => b['@type'] === 'FAQPage');
    expect(faq.mainEntity).toHaveLength(tool.faq.length);
  });

  it('related links point at existing pages', () => {
    const h = page();
    for (const slug of tool.related) {
      expect(h).toContain(`href="/${slug}/"`);
      expect(existsSync(`dist/${slug}/index.html`)).toBe(true);
    }
  });

  it('has the mount point with static empty state', () => {
    const h = page();
    expect(h).toContain(`data-tool="${tool.slug}"`);
    expect(h).toContain(`data-accept="${tool.acceptAttr}"`);
    expect(h).toContain('data-quality=');
    expect(h).toContain('data-format=');
    expect(h).toContain(tool.emptyCopy);
    expect(h).toMatch(/<input[^>]*type="file"[^>]*multiple/);
    expect(h).toContain('never uploaded.');
  });

  it('links the licences page from the footer', () => {
    expect(page()).toContain('href="/licenses/"');
  });
});

describe('site', () => {
  it('a build without PUBLIC_PLAUSIBLE_DOMAIN ships no plausible markup', () => {
    // Pages: no tag, no queue stub, no mention at all. Scripts: the optional-call `window.plausible?.()` in the
    // dropzone is inert without the tag, so JS may name it, but must never carry the plausible.io host.
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
        d.isDirectory() ? walk(`${dir}/${d.name}`) : [`${dir}/${d.name}`],
      );
    const files = walk('dist');
    const pages = files.filter((f) => f.endsWith('.html'));
    expect(pages.length).toBeGreaterThan(3); // the scan is not vacuous
    for (const f of pages) expect(/plausible/i.test(readFileSync(f, 'utf8')), f).toBe(false);
    for (const f of files.filter((f) => /\.(js|mjs|css|xml|txt)$/.test(f))) {
      expect(/plausible\.io/i.test(readFileSync(f, 'utf8')), f).toBe(false);
    }
  });

  it('homepage links to all tools and the filter', () => {
    const h = html('');
    for (const t of TOOLS) expect(h).toContain(`href="/${t.slug}/"`);
    expect(h).toContain('type="search"');
  });

  it('homepage has no licences entry in the tool list', () => {
    expect(html('').match(/<li[^>]*>[\s\S]*?<\/li>/g)!.join('')).not.toContain('/licenses/');
  });

  it('licences page lists the dependencies', () => {
    const h = html('licenses/');
    for (const n of ['libheif-js', 'LGPL-3.0', '@jsquash', 'Apache-2.0', 'fflate', 'Astro']) expect(h).toContain(n);
  });

  it('licences page carries the LGPL text, the IJG sentence and version-tagged source links', () => {
    const h = html('licenses/');
    const version = (n: string) => JSON.parse(readFileSync(`node_modules/${n}/package.json`, 'utf8')).version;
    expect(h).toContain('GNU LESSER GENERAL PUBLIC LICENSE');
    expect(h).toContain('GNU GENERAL PUBLIC LICENSE');
    expect(h).toContain('based in part on the work of the Independent JPEG Group');
    expect(h).toContain(`catdad-experiments/libheif-js/tree/v${version('libheif-js')}`);
    expect(h).toContain('strukturag/libheif/tree/v');
    expect(h).toContain('strukturag/libde265/tree/v');
    for (const p of ['jpeg', 'png', 'oxipng', 'webp']) {
      expect(h).toContain(encodeURIComponent(`@jsquash/${p}@${version(`@jsquash/${p}`)}`));
    }
    expect(h).toContain(`101arrowz/fflate/tree/v${version('fflate')}`);
    expect(h).toContain(`withastro/astro/tree/astro@${version('astro')}`);
    expect(h).toContain('Apache License'); // jSquash
    expect(h).toContain('Permission is hereby granted'); // MIT: fflate, Astro
  });

  it('ships _headers caching hashed assets as immutable', () => {
    expect(readFileSync('dist/_headers', 'utf8')).toMatch(
      /^\/_astro\/\*\n\s+Cache-Control: public, max-age=31536000, immutable$/m,
    );
  });

  it('has sitemap index and robots.txt', () => {
    expect(existsSync('dist/sitemap-index.xml')).toBe(true);
    expect(readFileSync('dist/robots.txt', 'utf8')).toContain(`Sitemap: ${SITE}/sitemap-index.xml`);
  });
});
