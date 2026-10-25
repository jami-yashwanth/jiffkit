import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ARROW_RIGHT, CHECK, ICONS, SEARCH, ZONE_ICONS, ZONE_ICON_NAME, ICON_NAME } from '../../src/icons';
import { TOOLS } from '../../src/tools';

// The children of a lucide-static icon's <svg>, as one line: the licence comment dropped, whitespace between tags
// collapsed and self-closing tags written without the space before "/>".
function lucideInner(name: string): string {
  const svg = readFileSync(`node_modules/lucide-static/icons/${name}.svg`, 'utf8');
  const inner = svg.replace(/<!--[\s\S]*?-->/g, '').match(/<svg[^>]*>([\s\S]*)<\/svg>/)![1];
  return inner.replace(/>\s+</g, '><').replace(/\s*\/>/g, '/>').trim();
}

describe('tool icons', () => {
  it('has an icon for every tool', () => {
    const slugs = TOOLS.map((t) => t.slug).sort();
    expect(Object.keys(ICONS).sort()).toEqual(slugs);
    expect(Object.keys(ICON_NAME).sort()).toEqual(slugs);
  });

  it('matches the pinned lucide-static source', () => {
    for (const [slug, name] of Object.entries(ICON_NAME)) {
      expect(ICONS[slug as keyof typeof ICONS], `${slug} (${name})`).toBe(lucideInner(name));
    }
  });

  it('the IN → OUT, check and search icons match the pinned lucide-static source', () => {
    expect(ARROW_RIGHT).toBe(lucideInner('arrow-right'));
    expect(SEARCH).toBe(lucideInner('search'));
    expect(CHECK).toBe(lucideInner('check'));
  });

  it('every zone has a mark, matching the pinned lucide-static source', () => {
    for (const [zone, name] of Object.entries(ZONE_ICON_NAME)) {
      expect(ZONE_ICONS[zone as keyof typeof ZONE_ICONS], `${zone} (${name})`).toBe(lucideInner(name));
    }
  });
});
