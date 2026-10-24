import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ICONS, ICON_NAME } from '../../src/icons';
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
});
