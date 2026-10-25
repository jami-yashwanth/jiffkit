import { describe, expect, it } from 'vitest';
import { STARTERS, findTools, highlight } from '../../src/search';
import { SEARCH_INDEX } from '../../src/search-index';
import { TOOLS } from '../../src/tools';

const top = (q: string) => findTools(q, SEARCH_INDEX)[0]?.slug;
const slugs = (q: string) => findTools(q, SEARCH_INDEX).map((e) => e.slug);

describe('tool search', () => {
  it('indexes every tool once, with its name, zone and everyday words', () => {
    expect(SEARCH_INDEX.map((e) => e.slug).sort()).toEqual(TOOLS.map((t) => t.slug).sort());
    for (const e of SEARCH_INDEX) {
      expect(e.name, e.slug).toBe(TOOLS.find((t) => t.slug === e.slug)!.h1);
      expect(e.words.split(' ').length, `${e.slug} needs search words`).toBeGreaterThanOrEqual(3);
      expect(e.label, e.slug).not.toBe('');
    }
  });

  it('finds a tool by its name, any case, with extra spaces', () => {
    expect(top('merge pdf')).toBe('merge-pdf');
    expect(top('  MERGE   pdf ')).toBe('merge-pdf');
    expect(top('json')).toBe('json-formatter');
  });

  it('finds a tool by the words people actually type', () => {
    expect(top('png to jpg')).toBe('webp-to-jpg');
    expect(top('remove bg')).toBe('remove-background');
    expect(top('combine pdf')).toBe('merge-pdf');
    expect(top('sha256')).toBe('hash-generator');
    expect(top('sha-256')).toBe('hash-generator');
    expect(top('iphone photo')).toBe('heic-to-jpg');
    expect(top('ocr')).toBe('image-to-text');
    expect(top('subtitles')).toBe('transcribe-audio');
    expect(top('mp4 to gif')).toBe('video-to-gif');
    expect(top('guid')).toBe('uuid-generator');
    expect(top('epoch')).toBe('unix-timestamp-converter');
  });

  it('matches the start of a word as you type', () => {
    expect(top('hei')).toBe('heic-to-jpg');
    expect(slugs('upsc')).toEqual(['upscale-image']);
  });

  it('a whole word beats the start of a longer one: sha finds hashes before sharpen', () => {
    expect(slugs('sha').slice(0, 2)).toEqual(['hash-generator', 'hmac-generator']);
  });

  it('puts name matches before word matches, and keeps registry order on a tie', () => {
    expect(slugs('pdf').slice(0, 4).sort()).toEqual(['jpg-to-pdf', 'merge-pdf', 'pdf-to-jpg', 'split-pdf']);
    expect(slugs('compress')).toEqual(['compress-image', 'compress-video']);
  });

  it('a zone name finds that zone', () => {
    expect(slugs('video')).toEqual(expect.arrayContaining(['compress-video', 'video-to-gif']));
  });

  it('every word must match: no tool for compress pdf', () => {
    expect(slugs('compress pdf')).toEqual([]);
    expect(slugs('zzzz')).toEqual([]);
  });

  it('an empty or punctuation-only query finds nothing', () => {
    expect(slugs('')).toEqual([]);
    expect(slugs('  -- ')).toEqual([]);
  });

  it('shows at most six results', () => {
    expect(findTools('to', SEARCH_INDEX).length).toBe(6);
  });
});

describe('search display', () => {
  it('every tool has an icon and a one-sentence line on what it does', () => {
    for (const e of SEARCH_INDEX) {
      expect(e.icon, e.slug).toMatch(/^<(path|rect|circle|line|polyline|polygon|ellipse)/);
      expect(e.blurb, e.slug).toMatch(/^[^.]+\.$/);
      expect(e.blurb.length, e.slug).toBeLessThanOrEqual(80);
    }
    expect(SEARCH_INDEX.find((e) => e.slug === 'merge-pdf')!.blurb).toBe('Combine PDF files into one document.');
  });

  it('marks the start of each name word a query word begins', () => {
    expect(highlight('WebP to JPG or PNG', 'png to jpg')).toEqual([
      { text: 'WebP ', hit: false }, { text: 'to', hit: true }, { text: ' ', hit: false }, { text: 'JPG', hit: true },
      { text: ' or ', hit: false }, { text: 'PNG', hit: true },
    ]);
    expect(highlight('HEIC to JPG', 'hei')).toEqual([{ text: 'HEI', hit: true }, { text: 'C to JPG', hit: false }]);
    expect(highlight('Merge PDF', 'combine')).toEqual([{ text: 'Merge PDF', hit: false }]);
  });

  it('starts from real tools', () => {
    for (const s of STARTERS) expect(TOOLS.some((t) => t.slug === s), s).toBe(true);
  });
});
