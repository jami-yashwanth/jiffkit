import { describe, it, expect } from 'vitest';
import { TOOLS, HOME_TOOLS, CATEGORY_LABEL, getTool, getImageTool, toolForType } from '../../src/tools';
import { placeOf } from '../../src/wall';
import { DEV_TOOLS } from '../../src/dev/tools';

describe('tool registry', () => {
  it('JSON formatter FAQ is honest about what formatting rewrites', () => {
    const a = getTool('json-formatter').faq.find((f) => f.q === 'Does it change my data?')!.a;
    expect(a).not.toMatch(/only changes whitespace/);
    for (const s of ['1.0 becomes 1', 'duplicate keys', 'numeric keys', 'escapes']) expect(a).toContain(s);
  });

  it('QR copy does not claim the visit is untracked', () => {
    const t = getTool('qr-code-generator');
    expect(t.title).toBe('QR Code Generator - Free, Static, No Sign-up');
    expect(t.subhead).toBe('Turn text or a link into a QR code. Made on your device, and the code itself has no tracking.');
    expect(t.description).toMatch(/Nothing is uploaded, the code has no tracking, and it never expires\.$/);
    expect(`${t.title} ${t.description} ${t.subhead}`).not.toMatch(/nothing is tracked|Private, No Tracking/i);
  });

  it('has exactly the 23 unique slugs on the homepage, plus the 25 developer tools', () => {
    const slugs = TOOLS.map((t) => t.slug);
    expect(TOOLS.filter((t) => t.kind === 'dev').map((t) => t.slug)).toEqual(DEV_TOOLS.map((t) => t.slug));
    expect(DEV_TOOLS).toHaveLength(25);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect([...slugs].sort()).toEqual(
      [
        'base64-encode-decode',
        'compress-image',
        'resize-image',
        'compress-image-to-kb',
        'compress-image-to-20kb',
        'compress-image-to-50kb',
        'compress-image-to-100kb',
        'compress-image-to-200kb',
        'signature-resize-10-20kb',
        'png-to-jpg',
        'jpg-to-png',
        'rotate-pdf',
        'png-to-pdf',
        'image-to-pdf',
        'heic-to-jpg',
        'json-formatter',
        'jwt-decoder',
        'merge-pdf',
        'qr-code-generator',
        'split-pdf',
        'webp-to-jpg',
        'remove-background',
        'image-to-text',
        'upscale-image',
        'transcribe-audio',
        'pdf-to-jpg',
        'jpg-to-pdf',
        'compress-video',
        'video-to-gif',
        ...DEV_TOOLS.map((t) => t.slug),
      ].sort(),
    );
    expect(HOME_TOOLS.map((t) => t.slug)).toHaveLength(23);
  });

  it('uses the spec H1s', () => {
    const h1 = (s: Parameters<typeof getTool>[0]) => getTool(s).h1;
    expect(h1('merge-pdf')).toBe('Merge PDF');
    expect(h1('split-pdf')).toBe('Split PDF');
    expect(h1('json-formatter')).toBe('JSON formatter');
    expect(h1('base64-encode-decode')).toBe('Base64 encode and decode');
    expect(h1('jwt-decoder')).toBe('JWT decoder');
    expect(h1('qr-code-generator')).toBe('QR code generator');
    expect(h1('remove-background')).toBe('Remove background');
    expect(h1('image-to-text')).toBe('Image to text');
    expect(h1('upscale-image')).toBe('Upscale image');
    expect(h1('transcribe-audio')).toBe('Transcribe audio');
    expect(h1('pdf-to-jpg')).toBe('PDF to JPG');
    expect(h1('jpg-to-pdf')).toBe('JPG to PDF');
    expect(h1('png-to-pdf')).toBe('PNG to PDF');
    expect(h1('image-to-pdf')).toBe('Image to PDF');
    expect(h1('rotate-pdf')).toBe('Rotate PDF');
    expect(h1('resize-image')).toBe('Resize image');
    expect(h1('png-to-jpg')).toBe('PNG to JPG');
    expect(h1('jpg-to-png')).toBe('JPG to PNG');
    expect(h1('compress-video')).toBe('Compress video');
    expect(h1('video-to-gif')).toBe('Video to GIF');
  });

  it('has the kind, model, op and category of every round 3 tool', () => {
    const ai = (s: Parameters<typeof getTool>[0]) => {
      const t = getTool(s);
      return t.kind === 'ai' ? t.model : undefined;
    };
    expect(ai('remove-background')).toBe('bg');
    expect(ai('image-to-text')).toBe('ocr');
    expect(ai('upscale-image')).toBe('upscale');
    expect(ai('transcribe-audio')).toBe('whisper');
    const op = (s: Parameters<typeof getTool>[0]) => {
      const t = getTool(s);
      return t.kind === 'pdf' || t.kind === 'video' ? `${t.kind}:${t.op}` : undefined;
    };
    expect(op('pdf-to-jpg')).toBe('pdf:to-images');
    expect(op('jpg-to-pdf')).toBe('pdf:from-images');
    expect(op('png-to-pdf')).toBe('pdf:from-images');
    expect(op('image-to-pdf')).toBe('pdf:from-images');
    expect(op('rotate-pdf')).toBe('pdf:rotate');
    expect(op('compress-video')).toBe('video:compress');
    expect(op('video-to-gif')).toBe('video:gif');
    const cat = (s: Parameters<typeof getTool>[0]) => getTool(s).category;
    for (const s of ['remove-background', 'image-to-text', 'upscale-image', 'transcribe-audio'] as const) expect(cat(s)).toBe('ai');
    for (const s of ['pdf-to-jpg', 'jpg-to-pdf'] as const) expect(cat(s)).toBe('pdf');
    for (const s of ['compress-video', 'video-to-gif'] as const) expect(cat(s)).toBe('video');
  });

  it('Transcribe FAQ states both limits: 30 minutes and 300 MB', () => {
    const a = getTool('transcribe-audio').faq.find((f) => f.q === 'How long can the audio be?')!.a;
    expect(a).toContain('30 minutes');
    expect(a).toContain('300 MB');
  });

  it('Video to GIF FAQ names no limit on the video’s length (only the GIF’s 15 seconds)', () => {
    const faq = getTool('video-to-gif').faq.map((f) => f.a).join(' ');
    expect(faq).not.toMatch(/2 minutes|minute/);
  });

  it('every AI tool FAQ states the first-use download and that it is cached', () => {
    const sizes = { bg: '5 MB', ocr: '4 MB', upscale: '5 MB', whisper: '80 MB' };
    for (const t of TOOLS) {
      if (t.kind !== 'ai') continue;
      const faq = t.faq.map((f) => f.a).join(' ');
      expect(faq, t.slug).toContain(`about ${sizes[t.model]}`);
      expect(faq, t.slug).toMatch(/cached/);
      expect(`${t.title} ${t.description} ${t.subhead} ${faq}`, t.slug).not.toMatch(/unlimited|any language|all languages/i);
    }
  });

  it('has the kind, op/transform and category of every new tool', () => {
    const m = getTool('merge-pdf');
    const s = getTool('split-pdf');
    expect(m.kind === 'pdf' && m.op).toBe('merge');
    expect(s.kind === 'pdf' && s.op).toBe('split');
    const j = getTool('json-formatter');
    const b = getTool('base64-encode-decode');
    const w = getTool('jwt-decoder');
    expect(j.kind === 'text' && j.transform).toBe('json');
    expect(b.kind === 'text' && b.transform).toBe('base64');
    expect(w.kind === 'text' && w.transform).toBe('jwt');
    expect(getTool('qr-code-generator').kind).toBe('qr');
    for (const t of TOOLS) {
      const expected = { image: 'image', pdf: 'pdf', ai: 'ai', video: 'video', text: 'developer', qr: 'qr', dev: 'developer' }[t.kind];
      expect(t.category).toBe(expected);
    }
    expect(CATEGORY_LABEL).toEqual({
      image: 'Image',
      pdf: 'PDF',
      ai: 'AI',
      video: 'Video',
      developer: 'Developer',
      qr: 'QR code',
    });
  });

  it('getImageTool returns image tools and getTool throws on unknown slugs', () => {
    expect(getImageTool('heic-to-jpg').kind).toBe('image');
    expect(() => getTool('nope' as never)).toThrow('Unknown tool');
  });

  it('related slugs exist and are not the tool itself', () => {
    for (const t of TOOLS) {
      for (const r of t.related) {
        expect(r).not.toBe(t.slug);
        expect(TOOLS.some((x) => x.slug === r)).toBe(true);
      }
    }
  });

  it('has 4-5 FAQ entries and 3 how-to steps per tool', () => {
    for (const t of TOOLS) {
      expect(t.faq.length).toBeGreaterThanOrEqual(4);
      expect(t.faq.length).toBeLessThanOrEqual(5);
      expect(t.howTo).toHaveLength(3);
    }
  });

  it('keeps title <= 60 chars and description 120-160 chars', () => {
    for (const t of TOOLS) {
      expect(t.title.length).toBeLessThanOrEqual(60);
      expect(t.description.length).toBeGreaterThanOrEqual(120);
      expect(t.description.length).toBeLessThanOrEqual(160);
    }
  });

  it('has the specified defaults and accept attribute', () => {
    expect(getImageTool('heic-to-jpg').defaults.quality).toBe(85);
    expect(getImageTool('compress-image').defaults.quality).toBe(75);
    expect(getImageTool('webp-to-jpg').defaults.format).toBe('jpg');
    expect(getImageTool('heic-to-jpg').acceptAttr).toBe('.heic,.heif,image/heic,image/heif');
    expect(getImageTool('png-to-jpg')).toMatchObject({ accepts: ['png'], outputs: ['jpg'], defaults: { format: 'jpg', quality: 85 } });
    expect(getImageTool('jpg-to-png')).toMatchObject({ accepts: ['jpg'], outputs: ['png'] });
    expect(getImageTool('resize-image')).toMatchObject({ accepts: ['jpg', 'png', 'webp'], outputs: 'same', defaults: { quality: 90 } });
  });

  it('the new pages are honest about what they cannot do', () => {
    const faq = (s: Parameters<typeof getTool>[0]) => getTool(s).faq.map((f) => f.a).join(' ');
    expect(faq('jpg-to-png')).toMatch(/larger/);
    expect(faq('jpg-to-png')).toMatch(/cannot come back/);
    expect(faq('png-to-jpg')).toMatch(/transparent areas become white/);
    expect(faq('resize-image')).toMatch(/only makes images smaller/);
    expect(faq('rotate-pdf')).toMatch(/every page turns the same way/);
  });

  it('the six target-size tools', () => {
    const want = {
      'compress-image-to-kb': { maxKB: 100, editable: true },
      'compress-image-to-20kb': { maxKB: 20 },
      'compress-image-to-50kb': { maxKB: 50 },
      'compress-image-to-100kb': { maxKB: 100 },
      'compress-image-to-200kb': { maxKB: 200 },
      'signature-resize-10-20kb': { maxKB: 20, minKB: 10 },
    } as const;
    for (const [slug, target] of Object.entries(want)) {
      const t = getImageTool(slug as keyof typeof want);
      expect(t.target, slug).toEqual(target);
      expect(t.outputs, slug).toEqual(['jpg']);
      expect(t.accepts, slug).toEqual(['jpg', 'png', 'webp', 'heic']);
    }
  });

  it('landing pages point at a real tool that is on the wall, and are not on it themselves', () => {
    const landings = TOOLS.filter((t) => t.landingOf);
    expect(landings.map((t) => t.slug).sort()).toEqual(
      ['compress-image-to-100kb', 'compress-image-to-200kb', 'compress-image-to-20kb', 'compress-image-to-50kb', 'image-to-pdf', 'png-to-pdf'],
    );
    for (const t of landings) {
      expect(HOME_TOOLS.some((h) => h.slug === t.landingOf), t.slug).toBe(true);
      expect(HOME_TOOLS.some((h) => h.slug === t.slug), t.slug).toBe(false);
    }
  });

  it('no two size pages share a title, a description or an FAQ answer', () => {
    const pages = ['compress-image-to-20kb', 'compress-image-to-50kb', 'compress-image-to-100kb', 'compress-image-to-200kb', 'compress-image-to-kb'] as const;
    const all = (f: (t: ReturnType<typeof getTool>) => string[]) => pages.flatMap((s) => f(getTool(s)));
    for (const values of [all((t) => [t.title]), all((t) => [t.description]), all((t) => t.faq.map((q) => q.a))]) {
      expect(new Set(values).size).toBe(values.length);
    }
  });

  it('every tool, landing pages included, has a place', () => {
    for (const t of TOOLS) expect(placeOf(t.slug), t.slug).toBeDefined();
    expect(placeOf('compress-image-to-20kb').zone).toBe('image');
    expect(placeOf('png-to-pdf').zone).toBe('pdf');
  });

  it('target-size pages never claim an exam spec, and say nothing is uploaded', () => {
    for (const t of TOOLS) {
      if (t.kind !== 'image' || !t.target) continue;
      const text = [t.title, t.description, t.subhead, ...t.howTo, ...t.faq.flatMap((f) => [f.q, f.a])].join(' ');
      expect(text, t.slug).not.toMatch(/\b(SSC|IBPS|UPSC|NSDL|PAN card|Aadhaar|GDS|NEET|JEE)\b/);
      expect(t.faq.map((f) => f.a).join(' '), t.slug).toMatch(/never leaves? (your|this) device|never (sent|uploaded)|not uploaded/i);
      expect(t.faq.map((f) => f.a).join(' '), t.slug).toMatch(/location/i);
    }
  });

  it('maps input types to tools', () => {
    expect(toolForType('png')).toBe('compress-image');
    expect(toolForType('jpg')).toBe('compress-image');
    expect(toolForType('heic')).toBe('heic-to-jpg');
    expect(toolForType('webp')).toBe('webp-to-jpg');
  });
});
