import { describe, expect, it } from 'vitest';
import { badEscapeAt, run as urlRun } from '../../src/dev/run/url-encode-decode';
import { decodeEntities, encodeEntities } from '../../src/dev/run/html-entities';
import { formats, parseMoment, run as tsRun } from '../../src/dev/run/unix-timestamp-converter';
import { parseBase, run as baseRun } from '../../src/dev/run/number-base-converter';

const result = async (p: ReturnType<typeof urlRun>) => (await p).out?.result;

describe('url encode and decode', () => {
  it('encodes a component (everything with a URL meaning) or a full URL', async () => {
    expect(await result(urlRun({ mode: 'encode', scope: 'component', text: 'a b&c=d/é' }))).toBe('a%20b%26c%3Dd%2F%C3%A9');
    expect(await result(urlRun({ mode: 'encode', scope: 'uri', text: 'https://x.com/a b?q=é&r=1' }))).toBe('https://x.com/a%20b?q=%C3%A9&r=1');
  });
  it('decodes, and names the position of a bad escape', async () => {
    expect(await result(urlRun({ mode: 'decode', scope: 'component', text: 'a%20b%26%C3%A9' }))).toBe('a b&é');
    expect((await urlRun({ mode: 'decode', scope: 'component', text: 'ok%2 then' })).error).toBe('Can’t decode: the % at character 3 doesn’t start a valid escape.');
    expect(badEscapeAt('abc%C3%28')).toBe(4); // well-formed %XX but not UTF-8
    expect(badEscapeAt('fine%20')).toBe(-1);
  });
  it('reports a lone surrogate when encoding, and shows nothing for empty text', async () => {
    expect((await urlRun({ mode: 'encode', scope: 'component', text: '\uD800' })).error).toMatch(/lone surrogate/);
    expect(await urlRun({ mode: 'encode', scope: 'component', text: '' })).toEqual({});
  });
});

describe('html entities', () => {
  it('escapes the five HTML characters, and non-ASCII on request', () => {
    expect(encodeEntities(`<a href="x">Tom & Jerry's</a>`, false)).toBe('&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;');
    expect(encodeEntities('café 😀', true)).toBe('caf&#xE9; &#x1F600;');
    expect(encodeEntities('café', false)).toBe('café');
  });
  it('decodes numeric entities itself and named ones through the lookup, leaving the rest alone', () => {
    const lookup = (e: string) => ({ '&copy;': '©', '&nbsp;': ' ', '&amp;': '&', '&lt;': '<' })[e];
    expect(decodeEntities('&#169; &#xA9; &copy; &amp;lt; &unknown; <b>', lookup)).toBe('© © © &lt; &unknown; <b>');
    expect(decodeEntities('&#0; &#xD800; &#x110000;', lookup)).toBe('� � �');
  });
});

describe('unix timestamp converter', () => {
  it('reads up to 11 digits as seconds and more as milliseconds', () => {
    expect(parseMoment('1735689600')!.toISOString()).toBe('2025-01-01T00:00:00.000Z');
    expect(parseMoment('1735689600000')!.toISOString()).toBe('2025-01-01T00:00:00.000Z');
    expect(parseMoment('-86400')!.toISOString()).toBe('1969-12-31T00:00:00.000Z');
    expect(parseMoment('2025-01-31T09:30:00Z')!.getTime()).toBe(Date.UTC(2025, 0, 31, 9, 30));
    expect(parseMoment('not a date')).toBeUndefined();
  });
  it('lists every format, relative to now', () => {
    const rows = Object.fromEntries(formats(new Date(Date.UTC(2025, 0, 1)), new Date(Date.UTC(2025, 0, 4))));
    expect(rows['Unix seconds']).toBe('1735689600');
    expect(rows['Unix milliseconds']).toBe('1735689600000');
    expect(rows['ISO 8601 (UTC)']).toBe('2025-01-01T00:00:00.000Z');
    expect(rows.UTC).toBe('Wed, 01 Jan 2025 00:00:00 GMT');
    expect(rows.Relative).toBe('3 days ago');
  });
  it('shows now when empty, writes now into the box on the button, and explains a bad date', async () => {
    expect((await tsRun({ input: '' })).status).toBe('Showing the current time.');
    const now = await tsRun({ input: '' }, '$button');
    expect(Math.abs(Number(now.set!.input) - Date.now() / 1000)).toBeLessThan(5);
    expect((await tsRun({ input: 'nope' })).error).toMatch(/^Can’t read that/);
  });
});

describe('number base converter', () => {
  it('converts big numbers exactly, with prefixes, separators and sign', () => {
    const rows = (base: string, value: string) => Object.fromEntries(((baseRun({ base, value }) as { out: { bases: { rows: [string, string][] } } }).out.bases.rows));
    expect(rows('10', '255')).toEqual({ Decimal: '255', Hex: 'ff', Binary: '11111111', Octal: '377' });
    expect(rows('16', '0xFFFF_FFFF_FFFF_FFFF_FFFF').Decimal).toBe('1208925819614629174706175');
    expect(rows('2', '0b1010 1010').Decimal).toBe('170');
    expect(rows('10', '-42').Hex).toBe('-2a');
  });
  it('names the first character that is not a digit of the base', () => {
    expect(parseBase('12a', '10')).toEqual({ bad: 'a' });
    expect((baseRun({ base: '2', value: '1021' }) as { error: string }).error).toBe('“2” is not a binary digit.');
    expect(baseRun({ base: '10', value: '  ' })).toEqual({});
  });
});
