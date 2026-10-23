import { describe, it, expect } from 'vitest';
import { TOOLS, CATEGORY_LABEL, getTool, getImageTool, toolForType } from '../../src/tools';

describe('tool registry', () => {
  it('JSON formatter FAQ is honest about what formatting rewrites', () => {
    const a = getTool('json-formatter').faq.find((f) => f.q === 'Does it change my data?')!.a;
    expect(a).not.toMatch(/only changes whitespace/);
    for (const s of ['1.0 becomes 1', 'duplicate keys', 'numeric keys', 'escapes']) expect(a).toContain(s);
  });

  it('uses the spec H1s', () => {
    const h1 = (s: Parameters<typeof getTool>[0]) => getTool(s).h1;
    expect(h1('merge-pdf')).toBe('Merge PDF');
    expect(h1('split-pdf')).toBe('Split PDF');
    expect(h1('json-formatter')).toBe('JSON formatter');
    expect(h1('base64-encode-decode')).toBe('Base64 encode and decode');
    expect(h1('jwt-decoder')).toBe('JWT decoder');
    expect(h1('qr-code-generator')).toBe('QR code generator');
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
      const expected = { image: 'image', pdf: 'pdf', text: 'developer', qr: 'qr' }[t.kind];
      expect(t.category).toBe(expected);
    }
    expect(CATEGORY_LABEL).toEqual({ image: 'Image', pdf: 'PDF', developer: 'Developer', qr: 'QR code' });
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
  });

  it('maps input types to tools', () => {
    expect(toolForType('png')).toBe('compress-image');
    expect(toolForType('jpg')).toBe('compress-image');
    expect(toolForType('heic')).toBe('heic-to-jpg');
    expect(toolForType('webp')).toBe('webp-to-jpg');
  });
});
