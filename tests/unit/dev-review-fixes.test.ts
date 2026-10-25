import { describe, expect, it } from 'vitest';
import { diff, run as diffRun } from '../../src/dev/run/text-diff';
import { cases } from '../../src/dev/run/case-converter';
import { slugify } from '../../src/dev/run/slugify';
import { run as j2y } from '../../src/dev/run/json-to-yaml';
import { run as j2c } from '../../src/dev/run/json-to-csv';
import { csvToJson } from '../../src/dev/run/csv-to-json';
import { parseColor } from '../../src/dev/run/color-converter';
import { nextRuns, parseCron, type Cron } from '../../src/dev/lib/cron';
import { formatXml } from '../../src/dev/lib/xml';
import { run as baseRun } from '../../src/dev/run/number-base-converter';
import { run as bcryptRun } from '../../src/dev/run/bcrypt-generator';
import { decodeEntities } from '../../src/dev/run/html-entities';

// Findings from the whole-branch review of the developer tools, each pinned before its fix.

describe('text diff on large, mostly different texts', () => {
  it('stops after its time limit and says so, instead of freezing the page', async () => {
    const a = Array.from({ length: 20000 }, (_, i) => `a line ${i} ${(i * 7919) % 104729}`).join('\n');
    const b = Array.from({ length: 20000 }, (_, i) => `b line ${i} ${(i * 104729) % 7919}`).join('\n');
    const t0 = Date.now();
    const r = await diffRun({ a, b, ws: false });
    expect(Date.now() - t0).toBeLessThan(4000);
    expect(r.error).toBe('Too many differences to compare in one go. Try smaller pieces of the two texts.');
    expect(diff('x', 'y', false)).toHaveLength(2);
  });
});

describe('non-Latin scripts keep their marks', () => {
  it('case converter keeps combining marks inside words', () => {
    expect(Object.fromEntries(cases('हिन्दी भाषा')).snake_case).toBe('हिन्दी_भाषा');
    expect(Object.fromEntries(cases('café menu')).snake_case).toBe('café_menu');
  });
  it('slugify strips accents from Latin letters only', () => {
    expect(slugify('ガイド ブック', '-', true)).toBe('ガイド-ブック');
    expect(slugify('हिन्दी भाषा', '-', true)).toBe('हिन्दी-भाषा');
    expect(slugify('한국어 문서', '-', true)).toBe('한국어-문서');
    expect(slugify('Crème brûlée', '-', true)).toBe('creme-brulee');
  });
});

describe('JSON input that JavaScript cannot represent exactly', () => {
  it('warns when a whole number is too big to keep exactly', async () => {
    const r = await j2y({ text: '{"id": 12345678901234567890, "ok": 9007199254740991}' });
    expect(r.status).toBe('Some numbers are too large to keep exactly (over 2^53) and were rounded. Put them in quotes to keep every digit.');
    expect((await j2c({ text: '[{"id": 12345678901234567890}]', delimiter: ',' })).status).toMatch(/too large to keep exactly/);
    expect((await j2y({ text: '{"n": 1.5e300, "s": "12345678901234567890"}' })).status).toBeUndefined();
  });
});

describe('CSV to JSON with very many rows', () => {
  it('handles 300,000 rows without overflowing the stack', () => {
    const csv = `a,b\n${'1,2\n'.repeat(300000)}`;
    const r = csvToJson(csv, ',', true);
    expect('value' in r && r.value.length).toBe(300000);
  });
});

describe('colour: negative and wrapped hues', () => {
  it('reads hsl(-120 …) as blue and hsl(480 …) as green', () => {
    expect(parseColor('hsl(-120 100% 50%)')).toEqual({ r: 0, g: 0, b: 255, a: 1 });
    expect(parseColor('hsl(480 100% 50%)')).toEqual({ r: 0, g: 255, b: 0, a: 1 });
  });
});

describe('cron: a day field starting with * is unrestricted, as in Vixie cron', () => {
  it('*/2 day of month with a weekday means both must match (AND)', () => {
    const runs = nextRuns(parseCron('0 0 */2 * 1') as Cron, new Date(2025, 0, 1, 0, 0), 3).map((d) => `${d.getMonth() + 1}-${d.getDate()}`);
    expect(runs).toEqual(['1-13', '1-27', '2-3']); // Mondays on odd days: */2 runs on 1, 3, 5, …
  });
});

describe('XML formatter keeps content', () => {
  it('does not break a > inside an attribute value', () => {
    expect(formatXml('<a t="1>2"><b/></a>', '  ')).toBe('<a t="1>2">\n  <b/>\n</a>');
  });
  it('keeps the text of a text-only element exactly', () => {
    expect(formatXml('<a><b>  x  </b></a>', '  ')).toBe('<a>\n  <b>  x  </b>\n</a>');
  });
});

describe('number base: 0x, 0o and 0b choose their base', () => {
  it('reads 0xff as hex even when the base is set to decimal', async () => {
    const r = (await baseRun({ base: '10', value: '0xff' })) as { out: { bases: { rows: [string, string][] } }; status?: string };
    expect(Object.fromEntries(r.out.bases.rows).Decimal).toBe('255');
    expect(r.status).toBe('Read as hex because of the 0x prefix.');
  });
});

describe('bcrypt: a pasted hash with an extreme cost', () => {
  it('refuses costs above 16 instead of running for hours', async () => {
    const hash = `$2b$20$${'a'.repeat(53)}`;
    expect((await bcryptRun({ password: 'x', cost: '4', hash })).error).toBe(
      'That hash uses cost 20, which would take a very long time to check here. Costs up to 16 can be checked.',
    );
  });
});

describe('html entities: numeric references decode as browsers do', () => {
  it('maps &#128;–&#159; to windows-1252 characters', () => {
    expect(decodeEntities('&#128; &#150; &#x99;', () => undefined)).toBe('€ – ™');
  });
});
