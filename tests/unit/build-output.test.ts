import { execSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import config from '../../astro.config.mjs';
import { MODELS } from '../../src/ai/config';
import { WHISPER_SHA256 } from '../../src/ai/whisper/files';
import { CATEGORY_LABEL, HOME_TOOLS, TOOLS, type Category } from '../../src/tools';
import { DEV_TOOLS } from '../../src/dev/tools';

// The same value the build used: SITE_URL or the default in astro.config.mjs.
const SITE = config.site as string;
const html = (p: string) => readFileSync(`dist/${p}index.html`, 'utf8');

beforeAll(() => {
  // Hermetic: the default build has no analytics and no AI stubs, whatever the shell exports.
  const env = { ...process.env };
  delete env.PUBLIC_UMAMI_WEBSITE_ID;
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
  'png-to-pdf': ['Drop images here', 'Choose images', 'Converted on your device. Your images are never uploaded.'],
  'image-to-pdf': ['Drop images here', 'Choose images', 'Converted on your device. Your images are never uploaded.'],
  'rotate-pdf': ['Drop a PDF here', 'Choose PDF', 'Rotated on your device. Your files are never uploaded.', 'Turn every page', 'Rotate PDF'],
  'png-to-jpg': ['Drop PNG images here', 'Choose images', 'Converted on your device. Your images are never uploaded.'],
  'jpg-to-png': ['Drop JPG images here', 'Choose images', 'Converted on your device. Your images are never uploaded.'],
  'resize-image': ['Drop images here', 'Resized on your device. Your images are never uploaded.', 'Fit within', 'data-width-input', 'data-height-input', 'Images are never made bigger.'],
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
    if (tool.kind === 'dev') {
      // A declared form: every field labelled and readable by the runtime, every output a labelled section, one status line.
      expect(h).toContain(`data-run="${tool.form.run}"`);
      for (const f of tool.form.fields) {
        expect(h, f.id).toContain(`data-field="${f.id}"`);
        expect(h, f.label).toContain(f.label.replace(/&/g, '&amp;'));
      }
      for (const o of tool.form.outputs) expect(h, o.id).toMatch(new RegExp(`data-out="${o.id}" data-type="${o.type}" hidden`));
      expect(h).toMatch(/<p class="status" role="status" aria-live="polite" data-status>/);
      if (tool.form.button) expect(h).toContain(`data-run-button>${tool.form.button}</button>`);
      return;
    }
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

  it('links the licences page, the privacy page and the source code from the footer', () => {
    expect(page()).toContain('href="/licenses/"');
    expect(page()).toContain('href="/privacy/"');
    expect(page()).toContain('href="https://github.com/jami-yashwanth/jiffkit"');
  });
});

describe('site', () => {
  it('a build without PUBLIC_UMAMI_WEBSITE_ID ships no analytics markup', () => {
    // Pages: no tag, no queue, no mention at all. Scripts: track() in src/ui/track.ts names `umami` but is inert
    // without the tag, so JS may name it, but must never carry the Umami host.
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
        d.isDirectory() ? walk(`${dir}/${d.name}`) : [`${dir}/${d.name}`],
      );
    const files = walk('dist');
    const pages = files.filter((f) => f.endsWith('.html'));
    expect(pages.length).toBeGreaterThan(3); // the scan is not vacuous
    for (const f of pages) expect(/umami|plausible/i.test(readFileSync(f, 'utf8')), f).toBe(false);
    for (const f of files.filter((f) => /\.(js|mjs|css|xml|txt)$/.test(f))) {
      expect(/cloud\.umami\.is|plausible\.io/i.test(readFileSync(f, 'utf8')), f).toBe(false);
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

  it('ships the OCR language data from dist, at the size the model list says, named with its version', () => {
    expect(MODELS.tessdata.sameOrigin).toBe(true);
    // Served same-origin and cached by URL: a new version gets a new name, never the old one's cache.
    expect(MODELS.tessdata.path).toBe('models/tessdata/eng-fast-4.1.0.traineddata.gz.bin');
    expect(html('licenses/')).toContain('eng-fast-4.1.0.traineddata.gz.bin');
    const file = `dist/${MODELS.tessdata.path}`;
    expect(existsSync(file)).toBe(true);
    expect(statSync(file).size).toBe(MODELS.tessdata.bytes);
  });

  it('AI pages show model sizes from the model list', () => {
    expect(html('remove-background/')).toContain('data-model-size="5 MB"');
    expect(html('remove-background/')).toContain('data-model-bytes="4574861"');
    expect(html('transcribe-audio/')).toContain('data-model-size="80 MB"');
    expect(html('upscale-image/')).toContain('data-model-size="5 MB"');
    expect(html('upscale-image/')).toContain('data-model-bytes="4866420"');
  });

  it('Upscale image offers 2× and, once the device is known to take it, 4×', () => {
    const h = html('upscale-image/');
    expect(h).toMatch(/<legend[^>]*>Scale<\/legend>/);
    expect(h).toMatch(/<input[^>]*value="2"[^>]*checked[^>]*>2×/);
    expect(h).toMatch(/<label[^>]*hidden[^>]*data-scale-4[^>]*><input[^>]*value="4"[^>]*>4×/);
  });

  it('licences page lists the upscaling model, pinned, with the Real-ESRGAN licence', () => {
    const h = html('licenses/');
    expect(h).toContain('realesr-general-x4v3');
    expect(h).toContain('vlad-grig/realesr-general-x4v3-onnx/blob/0e95d93e454cf6b5de9bdf5a1c9e7ec340d38231/onnx/model.onnx');
    expect(h).toContain('7b10e80021ec3e0ff35017ae5022791879d93a799b2e201e1010a37510202266');
    expect(h).toContain('Copyright (c) 2021, Xintao Wang');
  });

  it('licences page lists Whisper base pinned, every file with its sha256, and Transformers.js', () => {
    const h = html('licenses/');
    expect(h).toContain('https://huggingface.co/Xenova/whisper-base/tree/64da57285918e20ea79ea5c88eed7197933abaa8');
    for (const [name, sha] of Object.entries(WHISPER_SHA256)) {
      expect(h).toContain(name);
      expect(h).toContain(sha);
    }
    expect(h).toContain('Copyright (c) 2022 OpenAI');
    expect(h).toContain('https://github.com/huggingface/transformers.js/tree/4.3.1');
    expect(h).toContain('@huggingface/tokenizers');
    expect(h).toContain('@huggingface/jinja');
  });

  it('ships no model and no file over the 25 MB cap: the WebGPU runtime comes from the model host', () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(`${dir}/${d.name}`) : [`${dir}/${d.name}`]));
    for (const f of walk('dist')) expect(statSync(f).size, f).toBeLessThan(25 * 1024 * 1024);
    expect(walk('dist').some((f) => /\.onnx$|asyncify[^/]*\.wasm$/.test(f))).toBe(false);
  });

  // The tags of a wall, in order, each with the zone it hangs in.
  const tags = (h: string) =>
    [...h.matchAll(/<section class="zone" data-zone="([a-z]+)"[\s\S]*?<\/section>/g)].flatMap((z) =>
      [...z[0].matchAll(/<a class="tag[^"]*" href="\/([^"]+)\/"/g)].map((m) => [z[1], m[1]]),
    );

  it('homepage is a wall of five zones: the 23 tools in category order, and the way into the developer tools', () => {
    const h = html('');
    const zone: Record<Category, string> = { image: 'image', pdf: 'pdf', ai: 'ai', video: 'video', developer: 'developer', qr: 'developer' };
    const order: Category[] = ['image', 'pdf', 'ai', 'video', 'developer', 'qr'];
    const expected = order.flatMap((c) => HOME_TOOLS.filter((t) => t.category === c)).map((t) => [zone[t.category], t.slug]);
    expect(tags(h)).toEqual(expected);
    const zones = [...h.matchAll(/<h2 id="zone-[a-z]+"><span class="zone-mark"><svg[^>]*>.*?<\/svg><\/span>([^<]+) <small>(\d+)<\/small><\/h2>/g)].map((m) => [m[1], m[2]]);
    expect(zones).toEqual([['Image', '6'], ['PDF', '7'], ['AI', '4'], ['Video', '2'], ['Developer', '29']]);
    expect(h).toMatch(/<a class="zone-link" href="\/developer\/">All 29 developer tools<svg/);
    expect(h).toContain('<h1>Free tools for images, PDFs, video and code</h1>');
    expect([...h.matchAll(/<li><svg[^>]*>.*?<\/svg>([^<]+)<\/li>/g)].map((m) => m[1])).toEqual(['Nothing uploaded', 'No account', 'No watermarks']);
    expect(h).toContain('<title>jiffkit - Private Image, PDF, Video and AI Tools</title>');
    expect(h).toContain('<body>');
  });

  it('the brand: the wordmark in Bungee, preloaded, and the Bungee J as favicon, ico and phone icon', () => {
    const h = html('');
    expect(h).toMatch(/<link rel="preload" href="\/_astro\/bungee-latin-400-normal\.[\w-]+\.woff2" as="font" type="font\/woff2" crossorigin>/);
    expect(h).toContain("font-family:'Bungee'");
    expect(h).toContain('<link rel="icon" href="/favicon.svg" type="image/svg+xml" sizes="any">');
    expect(h).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png">');
    const svg = readFileSync('dist/favicon.svg', 'utf8');
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 1000 1000"><rect[^>]*fill="#fff"\/><path fill="#141414" d="M/);
    const ico = readFileSync('dist/favicon.ico');
    expect([ico.readUInt16LE(2), ico.readUInt16LE(4)]).toEqual([1, 3]); // an icon file holding three sizes
    const png = readFileSync('dist/apple-touch-icon.png');
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([180, 180]);
  });

  it('brands every page as jiffkit: wordmark, og:site_name, and the titles with room for it', () => {
    const pages = ['', 'licenses/', 'privacy/', ...TOOLS.map((t) => `${t.slug}/`)];
    for (const p of pages) {
      const h = html(p);
      expect(h, p).toMatch(/<header class="topbar"><div class="frame topbar-in"><a class="wordmark" href="\/">jiffkit<\/a><form class="search"/);
      expect(h, p).toContain('<meta property="og:site_name" content="jiffkit">');
    }
    // Tool titles keep their keywords (60-char budget); the brand goes where there is room.
    for (const t of TOOLS) expect(html(`${t.slug}/`)).toContain(`<title>${t.title}</title>`);
    expect(html('licenses/')).toContain('<title>Open-source licences - jiffkit</title>');
    expect(html('privacy/')).toContain('<title>Privacy - jiffkit</title>');
    expect(readFileSync('dist/404.html', 'utf8')).toContain('<title>Page not found - jiffkit</title>');
  });

  it('every page has one tool search, in the top bar, and the list of every tool is a file', () => {
    const pages = ['', 'developer/', 'licenses/', 'privacy/', ...TOOLS.map((t) => `${t.slug}/`)];
    for (const p of pages) {
      const h = html(p);
      expect([...h.matchAll(/<form class="search" role="search" action="\/" method="get" data-search>/g)], p).toHaveLength(1);
      // The box has no name, so submitting it without the script sends nothing typed.
      expect(h.match(/<input id="search" type="search"[^>]*>/)![0], p).not.toContain('name=');
      expect(h, p).not.toContain('data-search-index'); // the list is a file, fetched on first focus, not page weight
    }
    const index = JSON.parse(readFileSync('dist/search-index.json', 'utf8'));
    expect(index.map((e: { slug: string }) => e.slug).sort()).toEqual(TOOLS.map((t) => t.slug).sort());
  });

  it('the walls have no chips: the zones sort the tools', () => {
    for (const p of ['', 'developer/']) {
      const h = html(p);
      expect(h, p).not.toContain('class="chips"');
      expect(h, p).not.toContain('id="no-match"');
    }
  });

  it('every tool page opens with its icon on its zone, straight under the top bar', () => {
    for (const t of TOOLS) {
      const h = html(`${t.slug}/`);
      const dev = t.kind === 'dev' || t.category === 'developer' || t.category === 'qr';
      expect(h, t.slug).not.toContain('zone-strip'); // the logo and the search are the way back
      // Developer tools keep their group's zone; the stylesheet paints every group the Developer yellow.
      const zone = h.match(/<header class="tool-head" data-zone="([a-z]+)">/)![1];
      expect(['security', 'encoding', 'convert', 'text', 'code'].includes(zone), t.slug).toBe(dev);
      const head = h.match(/<header class="tool-head" data-zone="[a-z]+">([\s\S]*?)<\/header>/);
      expect(head, t.slug).not.toBeNull();
      expect(head![1], t.slug).toMatch(/^<span class="tool-tile"><svg width="32" height="32"[^>]*>[\s\S]*?<\/svg><\/span><h1>[^<]+<\/h1><p class="subhead">/);
      expect(h, t.slug).toMatch(/<div class="bench" data-zone="[a-z]+">/);
      expect(h, t.slug).toContain('<ol class="courses">');
    }
  });

  it('every tool shows what goes in and what comes out on its bench', () => {
    for (const t of TOOLS) {
      expect(html(`${t.slug}/`), t.slug).toMatch(/<p class="bench-io"><b>In<\/b> [^<]+ <svg[^>]*>.*?<\/svg><span class="visually-hidden">, <\/span> <b>Out<\/b> [^<]+<\/p>/);
    }
  });

  it('related tools are tags, in registry order', () => {
    for (const t of TOOLS) {
      const h = html(`${t.slug}/`);
      const list = h.match(/<ul class="pegs related">([\s\S]*?)<\/ul>/);
      expect(list, t.slug).not.toBeNull();
      const related = [...list![1].matchAll(/<a class="tag" href="\/([^"]+)\/"/g)].map((m) => m[1]);
      expect(related, t.slug).toEqual(t.related);
    }
  });

  it('the 404 page is the homepage wall', () => {
    const h = readFileSync('dist/404.html', 'utf8');
    expect(tags(h).map((t) => t[1])).toEqual(tags(html('')).map((t) => t[1]));
  });

  it('the developer hub is a wall of five group zones holding all 29 developer tools', () => {
    const h = html('developer/');
    const placed = tags(h);
    expect(placed).toHaveLength(29);
    expect(new Set(placed.map((m) => m[1]))).toEqual(new Set([...DEV_TOOLS.map((t) => t.slug), 'json-formatter', 'base64-encode-decode', 'jwt-decoder', 'qr-code-generator']));
    expect([...new Set(placed.map((m) => m[0]))]).toEqual(['security', 'encoding', 'convert', 'text', 'code']);
    const zones = [...h.matchAll(/<h2 id="zone-[a-z]+"><span class="zone-mark"><svg[^>]*>.*?<\/svg><\/span>([^<]+) <small>/g)].map((m) => m[1]);
    expect(zones).toEqual(['Security', 'Encoding', 'Convert', 'Text', 'Code']);
    expect(h).toContain('<title>Developer Tools - Free, Private, Run in Your Browser</title>');
    const description = h.match(/<meta name="description" content="([^"]*)"/)![1];
    expect(description.length).toBeGreaterThanOrEqual(120);
    expect(description.length).toBeLessThanOrEqual(160);
    expect(h).toContain('<div class="page page-wide">');
  });

  it('the top bar and the footer are one width on every page; only the content between them narrows', () => {
    for (const p of ['', 'developer/', 'merge-pdf/', 'hash-generator/', 'licenses/']) {
      const h = html(p);
      expect(h, p).toContain('<header class="topbar"><div class="frame topbar-in">');
      expect(h, p).toContain('<footer class="site-footer"><p class="frame">');
    }
    const notFound = readFileSync('dist/404.html', 'utf8');
    for (const p of ['', 'developer/']) expect(html(p), p).toMatch(/<div class="hero"><h1>/);
    expect(notFound).toMatch(/<div class="hero"><h1>Page not found<\/h1>/);
  });

  it('homepage uses the wide page container; tool pages keep the measure', () => {
    expect(html('')).toContain('<div class="page page-wide">');
    expect(html('merge-pdf/')).toContain('<div class="page">');
  });

  it('homepage declares the WebSite name for search results', () => {
    const blocks = [...html('').matchAll(/<script type="application\/ld\+json">([^<]*)<\/script>/g)].map((m) => JSON.parse(m[1]));
    expect(blocks).toContainEqual({ '@context': 'https://schema.org', '@type': 'WebSite', name: 'jiffkit', url: `${SITE}/` });
  });

  it('homepage names every tool group in its description and on its tags, and the description fits 120-160 chars', () => {
    const h = html('');
    const description = h.match(/<meta name="description" content="([^"]*)"/)![1];
    expect(description.length).toBeGreaterThanOrEqual(120);
    expect(description.length).toBeLessThanOrEqual(160);
    const names = [...h.matchAll(/<strong class="tag-name">([^<]*)<\/strong>/g)].map((m) => m[1]).join(' ');
    for (const word of [/background/i, /transcribe/i, /video/i, /PDF/, /photo|image/i]) {
      expect(description).toMatch(word);
      expect(names).toMatch(word);
    }
    expect(h).not.toContain('class="subhead"'); // the three promises say it once
  });

  it('homepage has no licences entry in the tool list', () => {
    expect(html('').match(/<li[^>]*>[\s\S]*?<\/li>/g)!.join('')).not.toContain('/licenses/');
  });

  it('licences page lists mp4box.js (BSD-3) and mp4-muxer (MIT), version-tagged', () => {
    const h = html('licenses/');
    const version = (n: string) => JSON.parse(readFileSync(`node_modules/${n}/package.json`, 'utf8')).version;
    expect(h).toContain(`gpac/mp4box.js/tree/v${version('mp4box')}`);
    expect(h).toContain('BSD-3-Clause');
    expect(h).toContain('Telecom ParisTech');
    expect(h).toContain(`Vanilagy/mp4-muxer/tree/v${version('mp4-muxer')}`);
    expect(h).toContain('Copyright (c) 2023 Vanilagy');
  });

  it('licences page lists nearley (MIT), which sql-formatter bundles into the SQL formatter', () => {
    const h = html('licenses/');
    const version = JSON.parse(readFileSync('node_modules/nearley/package.json', 'utf8')).version;
    expect(h).toContain(`registry.npmjs.org/nearley/-/nearley-${version}.tgz`); // no version tags upstream: the exact published source
    expect(h).toContain('Kartik Chandra, Tim Radvan');
  });

  it('licences page lists Lucide (ISC), version-tagged', () => {
    const h = html('licenses/');
    for (const s of ['Lucide', 'ISC', 'lucide-icons/lucide/tree/1.52.0', 'Lucide Icons and Contributors']) expect(h).toContain(s);
  });

  it('licences page lists gifenc (MIT), version-tagged, with its licence text', () => {
    const h = html('licenses/');
    const version = JSON.parse(readFileSync('node_modules/gifenc/package.json', 'utf8')).version;
    expect(h).toContain(`mattdesl/gifenc/tree/v${version}`);
    expect(h).toContain('Copyright (c) 2017 Matt DesLauriers');
  });

  it('each video page loads only its own island', () => {
    const scripts = (slug: string) => [...html(`${slug}/`).matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1]).join(' ');
    expect(scripts('compress-video')).toContain('VideoCompressScript');
    expect(scripts('compress-video')).not.toContain('VideoGifScript');
    expect(scripts('video-to-gif')).toContain('VideoGifScript');
    expect(scripts('video-to-gif')).not.toContain('VideoCompressScript');
  });

  it('each AI page loads only its own island, statically (so the page-load budget counts it)', () => {
    const scripts = (slug: string) => [...html(`${slug}/`).matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1]).join(' ');
    const islands = { 'remove-background': 'AiBgScript', 'image-to-text': 'AiOcrScript', 'upscale-image': 'AiUpscaleScript', 'transcribe-audio': 'AiTranscribeScript' };
    for (const [slug, own] of Object.entries(islands)) {
      expect(scripts(slug), slug).toContain(own);
      for (const other of Object.values(islands)) if (other !== own) expect(scripts(slug), slug).not.toContain(other);
      // No dynamic import of a tool definition at page load: what loads is what the budget counts.
      for (const src of scripts(slug).split(' ').filter((u) => u.includes(own))) {
        expect(readFileSync(`dist${src}`, 'utf8'), src).not.toMatch(/import\(/);
      }
    }
  });

  it('Compress video and Video to GIF take MP4 and MOV, not WebM, and say so', () => {
    for (const slug of ['compress-video', 'video-to-gif']) {
      const h = html(`${slug}/`);
      expect(h).toContain('Drop an MP4 or MOV video onto the page');
      expect(h).not.toMatch(/accept="[^"]*webm/);
    }
  });

  it('licences page lists every dependency in package.json and every model in MODELS', () => {
    const h = html('licenses/');
    const deps = Object.keys(JSON.parse(readFileSync('package.json', 'utf8')).dependencies as Record<string, string>);
    for (const d of deps) expect(h, `dependency ${d}`).toContain(d);
    // Each model: its licence, and a version-tagged (commit-pinned) source or the runtime's own version.
    for (const [key, m] of Object.entries(MODELS)) {
      expect(h, `${key} licence`).toContain(m.licence);
      const hf = /^(.+?)\/resolve\/([0-9a-f]{40})(?:\/|$)/.exec(m.path);
      if (hf) expect(h, `${key} source`).toContain(`${hf[1]}/${m.files ? 'tree' : 'blob'}/${hf[2]}`);
      else if (key === 'ortWebgpu') expect(h, key).toContain(m.path.split('/').pop()!);
      else if (key === 'tessdata') expect(h, key).toContain('tessdata_fast');
      else expect(h, key).toContain('onnxruntime-web');
    }
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

  it('licences page lists pdf.js with its version-tagged source and licence text', () => {
    const h = html('licenses/');
    const v = JSON.parse(readFileSync('node_modules/pdfjs-dist/package.json', 'utf8')).version;
    expect(h).toMatch(/<strong[^>]*>pdf\.js \(pdfjs-dist\)<\/strong>/);
    expect(h).toContain(`mozilla/pdf.js/tree/v${v}`);
    expect(h).toContain('Apache License'); // its LICENSE text
    expect(h).toContain('Liberation font licence'); // the bundled font licences are listed too
  });

  it('licences page description covers all the tools', () => {
    expect(html('licenses/')).not.toContain('these image tools');
  });

  it('ships _headers caching hashed assets as immutable', () => {
    expect(readFileSync('dist/_headers', 'utf8')).toMatch(
      /^\/_astro\/\*\n\s+Cache-Control: public, max-age=31536000, immutable$/m,
    );
  });

  it('sitemap lists every tool page and the developer hub', () => {
    const xml = readFileSync('dist/sitemap-0.xml', 'utf8');
    for (const t of TOOLS) expect(xml).toContain(`<loc>${SITE}/${t.slug}/</loc>`);
    expect(xml).toContain(`<loc>${SITE}/developer/</loc>`);
    expect(TOOLS).toHaveLength(48);
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
    for (const slug of ['merge-pdf', 'split-pdf', 'rotate-pdf', 'jpg-to-pdf', 'png-to-pdf', 'image-to-pdf']) expect(html(`${slug}/`)).toContain(`data-codec-size="${shown}"`);
  });

  it('PDF to JPG shows the measured gzip size of its worker and the two pdf.js modules', () => {
    const astro = readdirSync('dist/_astro');
    const parts = astro.filter((f) => /^raster-worker-[^/]*\.js$/.test(f) || (/^pdf(\.worker)?-[\w-]+\.js$/.test(f) && !f.startsWith('pdf-lib-')));
    expect(parts, 'raster worker, pdf.js and pdf.js parser chunks').toHaveLength(3);
    const bytes = parts.reduce((n, f) => n + gzipSync(readFileSync(`dist/_astro/${f}`)).length, 0);
    expect(html('pdf-to-jpg/')).toContain(`data-codec-size="${(bytes / 1e6).toFixed(1)} MB"`);
  });
});
