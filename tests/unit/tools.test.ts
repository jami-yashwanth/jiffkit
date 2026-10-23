import { describe, it, expect } from 'vitest';
import { TOOLS, getTool, toolForType } from '../../src/tools';

describe('tool registry', () => {
  it('has exactly the 3 unique slugs', () => {
    const slugs = TOOLS.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect([...slugs].sort()).toEqual(['compress-image', 'heic-to-jpg', 'webp-to-jpg']);
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
    expect(getTool('heic-to-jpg').defaults.quality).toBe(85);
    expect(getTool('compress-image').defaults.quality).toBe(75);
    expect(getTool('webp-to-jpg').defaults.format).toBe('jpg');
    expect(getTool('heic-to-jpg').acceptAttr).toBe('.heic,.heif,image/heic,image/heif');
  });

  it('maps input types to tools', () => {
    expect(toolForType('png')).toBe('compress-image');
    expect(toolForType('jpg')).toBe('compress-image');
    expect(toolForType('heic')).toBe('heic-to-jpg');
    expect(toolForType('webp')).toBe('webp-to-jpg');
  });
});
