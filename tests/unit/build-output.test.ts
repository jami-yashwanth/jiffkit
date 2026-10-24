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
  // Hermetic: the default build has no analytics and no AI stubs, whatever the shell exports.
  const env = { ...process.env };
  delete env.PUBLIC_PLAUSIBLE_DOMAIN;
  delete env.PUBLIC_AI_STUB;
  delete env.PUBLIC_MODEL_BASE_URL;
  execSync('npx astro build', { stdio: 'pipe', env });
}, 180_000);

// Spec §4: exact empty-state copy for each new page.
const COPY = {
  'merge-pdf': ['Drop PDF files here', 'Choose PDFs', 'Merged on your device. Your files are never uploaded.'],
  'split-pdf': ['Drop a PDF here', 'Choose PDF', 'Split on your device. Your files are never uploaded.'],
  'remove-background': [
    'Drop a photo here',
    'Choose photo',
    'Runs on your device with on-device AI. Your photos are never uploaded.',
  ],
  'image-to-text': [
    'Drop an image with text',
    'Choose image',
    'Runs on your device with on-device AI. Your images are never uploaded.',
  ],
  'upscale-image': ['Drop an image', 'Choose image', 'Runs on your device with on-device AI. Your images are never uploaded.'],
  'transcribe-audio': [
    'Drop an audio or video file',
    'Choose file',
    'Runs on your device with on-device AI. Your files are never uploaded.',
  ],
  'pdf-to-jpg': ['Drop a PDF here', 'Choose PDF', 'Converted on your device. Your PDFs are never uploaded.'],
  'jpg-to-pdf': ['Drop images here', 'Choose images', 'Converted on your device. Your images are never uploaded.'],
  'compress-video': ['Drop a video here', 'Choose video', 'Converted on your device. Your videos are never uploaded.'],
  'video-to-gif': ['Drop a video here', 'Choose video', 'Converted on your device. Your videos are never uploaded.'],
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
    const statusAndResults = () => {
      expect(h).toMatch(/<[^>]*role="status"[^>]*aria-live="polite"[^>]*data-status|<[^>]*data-status[^>]*role="status"/);
      expect(h).toContain('data-results');
    };
    if (tool.kind === 'pdf') {
      expect(h).toContain(`data-op="${tool.op}"`);
      const accept = tool.op === 'from-images' ? /accept="[^"]*image\/jpeg[^"]*image\/heic[^"]*"/ : /accept="application\/pdf,\.pdf"/;
      expect(h).toMatch(new RegExp(`<input[^>]*type="file"[^>]*${accept.source}`));
      expect(/<input[^>]*type="file"[^>]*multiple/.test(h)).toBe(tool.op === 'merge' || tool.op === 'from-images');
      statusAndResults();
    }
    if (tool.kind === 'ai') {
      expect(h).toMatch(new RegExp(`data-kind="ai"[^>]*data-model="${tool.model}"[^>]*data-model-size="[^"]+"`));
      expect(h).toContain(`accept="${tool.accepts}"`);
      expect(/<input[^>]*type="file"[^>]*multiple/.test(h)).toBe(false);
      statusAndResults();
    }
    if (tool.kind === 'video') {
      expect(h).toContain(`data-op="${tool.op}"`);
      expect(h).toMatch(/<input[^>]*type="file"[^>]*accept="[^"]*video\/mp4[^"]*"/);
      expect(/<input[^>]*type="file"[^>]*multiple/.test(h)).toBe(false);
      statusAndResults();
    }
    expect(h).not.toMatch(/\b(multiple|disabled|hidden|checked)="(false|undefined)"/);
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

  it('a production build carries no AI stub code', () => {
    // The marker lives in src/ai/stub.ts, which only the PUBLIC_AI_STUB=1 (Playwright) build may include.
    expect(readFileSync('src/ai/stub.ts', 'utf8')).toContain('__AI_STUB__'); // the scan below is not vacuous
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(`${dir}/${d.name}`) : [`${dir}/${d.name}`]));
    for (const f of walk('dist').filter((f) => /\.(js|mjs|html)$/.test(f))) {
      expect(readFileSync(f, 'utf8').includes('__AI_STUB__'), f).toBe(false);
    }
  });

  it('AI pages show model sizes from the model list', () => {
    expect(html('remove-background/')).toContain('data-model-size="45 MB"');
    expect(html('remove-background/')).toContain('data-model-size-small="5 MB"');
    expect(html('transcribe-audio/')).toContain('data-model-size="80 MB"');
  });

  it('homepage links to all tools and the filter', () => {
    const h = html('');
    for (const t of TOOLS) expect(h).toContain(`href="/${t.slug}/"`);
    expect(h).toContain('type="search"');
  });

  it('homepage groups tools under 6 category headings in order', () => {
    const h = html('');
    const order: Category[] = ['image', 'pdf', 'ai', 'video', 'developer', 'qr'];
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

  it('licences page covers pdf-lib, what its chunk bundles, and qrcode-generator', () => {
    const h = html('licenses/');
    const version = (n: string) => JSON.parse(readFileSync(`node_modules/${n}/package.json`, 'utf8')).version;
    const nested = (n: string) =>
      JSON.parse(readFileSync(`node_modules/pdf-lib/node_modules/${n}/package.json`, 'utf8')).version;
    for (const n of ['pdf-lib', 'pako', '@pdf-lib/standard-fonts', '@pdf-lib/upng', 'tslib', 'qrcode-generator']) {
      expect(h).toMatch(new RegExp(`<strong[^>]*>${n}</strong>`));
    }
    expect(h).toContain('MIT AND Zlib'); // pako
    expect(h).toContain('0BSD'); // tslib
    expect(h).toContain(`Hopding/pdf-lib/tree/v${version('pdf-lib')}`);
    expect(h).toContain(`nodeca/pako/tree/${version('pako')}`);
    expect(h).toContain(`microsoft/tslib/tree/v${nested('tslib')}`);
    expect(h).toContain(`kazuhikoarase/qrcode-generator/tree/js${version('qrcode-generator')}`);
    expect(h).toContain(`@pdf-lib/standard-fonts/v/${version('@pdf-lib/standard-fonts')}`);
    expect(h).toContain(`@pdf-lib/upng/v/${version('@pdf-lib/upng')}`);
    expect(h).toContain('Copyright (c) 2019 Andrew Dillon'); // pdf-lib
    expect(h).toContain('Copyright (c) 2009 Kazuhiko Arase'); // qrcode-generator
    expect(h).toContain('Copyright (c) 2017 Photopea'); // upng
    expect(h).toContain('Jean-loup Gailly and Mark Adler'); // pako's zlib half
    expect(h).toContain('Permission to use, copy, modify, and/or distribute'); // tslib 0BSD
  });

  it('licences page description covers all the tools', () => {
    expect(html('licenses/')).not.toContain('these image tools');
  });

  it('ships _headers caching hashed assets as immutable', () => {
    expect(readFileSync('dist/_headers', 'utf8')).toMatch(
      /^\/_astro\/\*\n\s+Cache-Control: public, max-age=31536000, immutable$/m,
    );
  });

  it('sitemap lists all 9 tool pages', () => {
    const xml = readFileSync('dist/sitemap-0.xml', 'utf8');
    for (const t of TOOLS) expect(xml).toContain(`<loc>${SITE}/${t.slug}/</loc>`);
    expect(TOOLS).toHaveLength(17);
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
