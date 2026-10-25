import { describe, expect, it } from 'vitest';
import { counts, duration } from '../../src/dev/run/word-counter';
import { diff, run as diffRun } from '../../src/dev/run/text-diff';
import { lorem, run as loremRun } from '../../src/dev/run/lorem-ipsum-generator';
import { slugify } from '../../src/dev/run/slugify';
import { toHtml, run as mdRun } from '../../src/dev/run/markdown-to-html';

describe('word counter', () => {
  it('counts words, characters, sentences, paragraphs and lines', () => {
    const rows = Object.fromEntries(counts("It's a well-known fact. Isn't it?\n\nYes 😀 café."));
    expect(rows.Words).toBe('9'); // It's / a / well / known / fact / Isn't / it / Yes / café
    expect(rows.Characters).toBe('46');
    expect(rows['Characters without spaces']).toBe('37'); // 46 less 7 spaces and 2 line breaks
    expect(rows.Sentences).toBe('3');
    expect(rows.Paragraphs).toBe('2');
    expect(rows.Lines).toBe('3');
  });
  it('turns words into reading and speaking time', () => {
    expect(duration(119, 238)).toBe('30 sec');
    expect(duration(2380, 238)).toBe('10 min');
    expect(duration(150 * 65, 150)).toBe('1 h 5 min');
  });
});

describe('text diff', () => {
  it('marks added and removed lines', () => {
    expect(diff('a\nb\nc\n', 'a\nB\nc\nd\n', false)).toEqual([
      { op: ' ', text: 'a' }, { op: '-', text: 'b' }, { op: '+', text: 'B' }, { op: ' ', text: 'c' }, { op: '+', text: 'd' },
    ]);
  });
  it('does not count the last line as changed just because one text ends without a line break', async () => {
    expect(diff('one\ntwo\nthree', 'one\n2\nthree\nfour', false)).toEqual([
      { op: ' ', text: 'one' }, { op: '-', text: 'two' }, { op: '+', text: '2' }, { op: ' ', text: 'three' }, { op: '+', text: 'four' },
    ]);
    expect((await diffRun({ a: 'one\ntwo\nthree', b: 'one\n2\nthree\nfour', ws: false })).status).toBe('2 lines added, 1 line removed.');
  });

  it('can ignore whitespace, and says when there is no difference', async () => {
    expect((await diffRun({ a: 'x\n  y', b: 'x\ny', ws: true })).status).toBe('No differences.');
    expect((await diffRun({ a: 'x\ny', b: 'x\nz\nw', ws: false })).status).toBe('2 lines added, 1 line removed.');
    expect(await diffRun({ a: '', b: '', ws: false })).toEqual({});
  });
});

describe('lorem ipsum', () => {
  it('makes paragraphs, sentences or words, with the classic opening on request', () => {
    const p = lorem(3, 'paragraphs', true).split('\n\n');
    expect(p).toHaveLength(3);
    expect(p[0].startsWith('Lorem ipsum dolor sit amet, consectetur adipiscing elit. ')).toBe(true);
    expect(lorem(4, 'sentences', false).match(/\./g)).toHaveLength(4);
    expect(lorem(7, 'words', true).split(' ')).toEqual(expect.arrayContaining(['Lorem', 'ipsum', 'dolor', 'sit', 'amet']));
    expect(lorem(7, 'words', false).split(' ')).toHaveLength(7);
  });
  it('limits the count to 1-50', async () => {
    expect((await loremRun({ count: '51', unit: 'words', classic: true })).error).toBe('Choose between 1 and 50.');
  });
});

describe('slugify', () => {
  it('strips accents and symbols, joins with one separator, keeps other alphabets', () => {
    expect(slugify('Crème brûlée: 10 tips & tricks!', '-', true)).toBe('creme-brulee-10-tips-tricks');
    expect(slugify('  Straße -- Øresund  ', '_', true)).toBe('strasse_oresund');
    expect(slugify('Hello World', '-', false)).toBe('Hello-World');
    expect(slugify('東京 Ελλάδα', '-', true)).toBe('東京-ελλαδα');
  });
});

describe('markdown to html', () => {
  it('renders GFM: tables, task lists, strikethrough and fenced code', () => {
    const html = toHtml('| a | b |\n|---|---|\n| 1 | 2 |\n\n- [x] done\n\n~~gone~~\n\n```js\nx()\n```');
    expect(html).toContain('<table>');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('<del>gone</del>');
    expect(html).toContain('<code class="language-js">');
  });
  it('returns the same HTML as text and for the preview', async () => {
    const r = await mdRun({ text: '# Hi' });
    expect(r.out).toEqual({ html: '<h1>Hi</h1>\n', preview: { html: '<h1>Hi</h1>\n' } });
  });
});
