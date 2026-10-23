import { execSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import config from '../../astro.config.mjs';
import { CATEGORY_LABEL, TOOLS, type Category } from '../../src/tools';

// The same value the build used: SITE_URL or the default in astro.config.mjs.
const SITE = config.site as string;
const html = (p: string) => readFileSync(`dist/${p}index.html`, 'utf8');

beforeAll(() => {
  // Hermetic: the default build has no analytics, whatever the shell exports.
  const env = { ...process.env };
  delete env.PUBLIC_PLAUSIBLE_DOMAIN;
  execSync('npx astro build', { stdio: 'pipe', env });
}, 180_000);

// Spec §4: exact empty-state copy for each new page.
const COPY = {
  'merge-pdf': ['Drop PDF files here', 'Choose PDFs', 'Merged on your device. Your files are never uploaded.'],
  'split-pdf': ['Drop a PDF here', 'Choose PDF', 'Split on your device. Your files are never uploaded.'],
  'json-formatter': ['placeholder="Paste JSON here"', '>Format<', '>Minify<', '>Copy<', 'Options', '2 spaces', '4 spaces', 'Tab'],
  'base64-encode-decode': ['>Text<', '>Base64<', 'URL-safe'],
  'jwt-decoder': [
    'placeholder="Paste a JWT (eyJ…)"',
    '>Header<',
    '>Payload<',
    'Signature not verified. This tool only decodes the token. Your token never leaves this page.',
  ],
  'qr-code-generator': [
    'Text or URL',
    'Your QR code appears here.',
    'Download PNG',
    'Download SVG',
    'Options',
    'Static code: works forever, no tracking, no sign-up.',
  ],
};

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

  it('has its kind mount with the static empty state', () => {
    const h = page();
    if (tool.kind === 'image') {
      expect(h).toContain(`data-tool="${tool.slug}"`);
      expect(h).toContain(`data-accept="${tool.acceptAttr}"`);
      expect(h).toContain('data-quality=');
      expect(h).toContain('data-format=');
      expect(h).toContain(tool.emptyCopy);
      expect(h).toMatch(/<input[^>]*type="file"[^>]*multiple/);
      expect(h).toContain('never uploaded.');
      expect(h).not.toContain('data-kind=');
      return;
    }
    expect(h).toMatch(new RegExp(`<div[^>]*data-kind="${tool.kind}"[^>]*data-tool="${tool.slug}"`));
    for (const copy of COPY[tool.slug as keyof typeof COPY]) expect(h, copy).toContain(copy);
    if (tool.kind === 'pdf') {
      expect(h).toContain(`data-op="${tool.op}"`);
      expect(h).toMatch(/<input[^>]*type="file"[^>]*accept="application\/pdf,\.pdf"/);
      expect(/<input[^>]*type="file"[^>]*multiple/.test(h)).toBe(tool.op === 'merge');
      expect(h).toContain('data-results');
      expect(h).toContain('data-status');
    }
    if (tool.kind === 'text') expect(h).toContain(`data-transform="${tool.transform}"`);
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

  it('homepage groups tools under 4 category headings in order', () => {
    const h = html('');
    const order: Category[] = ['image', 'pdf', 'developer', 'qr'];
    const heads = [...h.matchAll(/<h2[^>]*>([^<]*)<\/h2>/g)].map((m) => m[1]);
    expect(heads).toEqual(order.map((c) => CATEGORY_LABEL[c]));
    const pos = (needle: string) => h.indexOf(needle);
    order.forEach((c, i) => {
      const start = pos(`>${CATEGORY_LABEL[c]}</h2>`);
      const end = i + 1 < order.length ? pos(`>${CATEGORY_LABEL[order[i + 1]]}</h2>`) : h.length;
      for (const t of TOOLS.filter((t) => t.category === c)) {
        const at = pos(`href="/${t.slug}/"`);
        expect(at > start && at < end, `${t.slug} under ${c}`).toBe(true);
      }
    });
    expect(h).toContain('<h1>Tools that never upload your files</h1>');
    expect(h).toContain('<title>Private Online Tools - Image, PDF and Developer Tools</title>');
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

  it('sitemap lists all 9 tool pages', () => {
    const xml = readFileSync('dist/sitemap-0.xml', 'utf8');
    for (const t of TOOLS) expect(xml).toContain(`<loc>${SITE}/${t.slug}/</loc>`);
    expect(TOOLS).toHaveLength(9);
  });

  it('has sitemap index and robots.txt', () => {
    expect(existsSync('dist/sitemap-index.xml')).toBe(true);
    expect(readFileSync('dist/robots.txt', 'utf8')).toContain(`Sitemap: ${SITE}/sitemap-index.xml`);
  });
  it('PDF pages show the measured gzip size of the PDF worker and pdf-lib', () => {
    const astro = readdirSync('dist/_astro');
    const lib = astro.find((f) => /^pdf-lib-[^/]*\.js$/.test(f));
    expect(lib, 'pdf-lib chunk in dist/_astro').toBeDefined();
    const worker = astro.find((f) => /^worker-.*\.js$/.test(f) && readFileSync(`dist/_astro/${f}`, 'utf8').includes(lib!));
    expect(worker, 'PDF worker chunk importing pdf-lib').toBeDefined();
    const bytes = [lib!, worker!].reduce((n, f) => n + gzipSync(readFileSync(`dist/_astro/${f}`)).length, 0);
    const shown = `${(bytes / 1e6).toFixed(1)} MB`;
    for (const slug of ['merge-pdf', 'split-pdf']) expect(html(`${slug}/`)).toContain(`data-codec-size="${shown}"`);
  });
});
