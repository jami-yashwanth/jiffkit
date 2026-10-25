import { describe, expect, it } from 'vitest';
import { run as y2j, yamlToJson } from '../../src/dev/run/yaml-to-json';
import { run as j2y } from '../../src/dev/run/json-to-yaml';
import { jsonToRows, run as j2c } from '../../src/dev/run/json-to-csv';
import { csvToJson, headerNames, run as c2j } from '../../src/dev/run/csv-to-json';
import { guessDelimiter, parseCsv, toCsv } from '../../src/dev/lib/csv';
import { formats, parseColor, run as colorRun } from '../../src/dev/run/color-converter';
import { cases, words } from '../../src/dev/run/case-converter';

const res = async (p: ReturnType<typeof y2j>) => await p;

describe('YAML ↔ JSON', () => {
  it('converts YAML 1.2 with anchors, and several documents into an array', () => {
    expect(yamlToJson('a: &x 1\nb: *x\nflag: yes\nlist: [1, two]', 2)).toEqual({ json: '{\n  "a": 1,\n  "b": 1,\n  "flag": "yes",\n  "list": [\n    1,\n    "two"\n  ]\n}' });
    expect(yamlToJson('a: 1\n---\nb: 2', 2)).toEqual({ json: '[\n  {\n    "a": 1\n  },\n  {\n    "b": 2\n  }\n]' });
  });
  it('names the line of a YAML error', async () => {
    expect((await res(y2j({ text: 'a: [1, 2\nb: 3', indent: '2' }))).error).toMatch(/^Invalid YAML at line \d+, column \d+: /);
  });
  it('writes JSON as YAML, quoting only strings that need it', async () => {
    expect((await res(j2y({ text: '{"name":"Ada","n":"123","on":true,"tags":["x"]}' }))).out!.result).toBe('name: Ada\nn: "123"\non: true\ntags:\n  - x\n'); // "on" is a plain word in YAML 1.2
    expect((await res(j2y({ text: '{"a":}' }))).error).toBe('Invalid JSON at line 1, column 6: Unexpected character "}".');
  });
});

describe('CSV', () => {
  it('parses quotes, doubled quotes, delimiters and line breaks inside fields (RFC 4180)', () => {
    expect(parseCsv('a,"b,c","say ""hi""","line\nbreak"\r\n1,2,3,4', ',')).toEqual({ rows: [['a', 'b,c', 'say "hi"', 'line\nbreak'], ['1', '2', '3', '4']] });
    expect(parseCsv('a,"open\nb,c', ',')).toEqual({ unclosedAt: 1 });
  });
  it('writes fields that need it in quotes, and round-trips', () => {
    const rows = [['name', 'note'], ['Ada', 'says "hi", twice'], ['Bo', 'two\nlines']];
    const csv = toCsv(rows, ',');
    expect(csv).toBe('name,note\nAda,"says ""hi"", twice"\nBo,"two\nlines"');
    expect(parseCsv(csv, ',')).toEqual({ rows });
  });
  it('guesses comma, semicolon or tab from the first line, ignoring quoted text', () => {
    expect(guessDelimiter('a;b;c\n1;2;3')).toBe(';');
    expect(guessDelimiter('a\tb\n1\t2')).toBe('\t');
    expect(guessDelimiter('"x;y;z",b\n')).toBe(',');
  });
  it('JSON → CSV: every key as a column in first-seen order, nested values as JSON', async () => {
    expect(jsonToRows([{ a: 1, b: { c: 2 } }, { b: null, d: 'x' }])).toEqual([['a', 'b', 'd'], ['1', '{"c":2}', ''], ['', '', 'x']]);
    expect(jsonToRows([[1, 2], [3]])).toEqual([['1', '2'], ['3']]);
    expect(jsonToRows([])).toMatch(/empty/);
    expect((await res(j2c({ text: '[{"a":1},{"a":2}]', delimiter: 'tab' }))).out!.result).toBe('a\n1\n2');
    expect((await res(j2c({ text: '[{"a":1},{"a":2}]', delimiter: ',' }))).status).toBe('2 rows.');
  });
  it('CSV → JSON: headers named, blanks and repeats fixed, short rows padded, values kept as strings', () => {
    expect(headerNames(['id', '', 'id'], 4)).toEqual(['id', 'column 2', 'id_2', 'column 4']);
    expect(csvToJson('id,name\n007,Ada\n8', 'auto', true)).toEqual({ value: [{ id: '007', name: 'Ada' }, { id: '8', name: '' }] });
    expect(csvToJson('1;2\n3;4\n', 'auto', false)).toEqual({ value: [['1', '2'], ['3', '4']] });
  });
  it('CSV → JSON names the line of an unclosed quote', async () => {
    expect((await res(c2j({ text: 'a\n"b\nc', delimiter: 'auto', header: true }))).error).toBe('A quoted field starting on line 2 is never closed.');
  });
});

describe('color converter', () => {
  it('reads every supported syntax', () => {
    const accent = { r: 14, g: 107, b: 82, a: 1 };
    for (const s of ['#0e6b52', '0E6B52', 'rgb(14, 107, 82)', 'rgb(14 107 82)', 'rgba(14,107,82,1)', 'hsl(164 77% 24%)']) {
      const c = parseColor(s)!;
      expect([c.r, c.g, c.b].map((v, i) => Math.abs(v - [accent.r, accent.g, accent.b][i]) <= 1), s).toEqual([true, true, true]);
    }
    expect(parseColor('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColor('#0e6b5280')!.a).toBeCloseTo(0.502, 3);
    expect(parseColor('rgb(0 0 0 / 50%)')!.a).toBe(0.5);
    expect(parseColor('hsl(0.5turn 100% 50%)')).toEqual({ r: 0, g: 255, b: 255, a: 1 });
    expect(parseColor('banana')).toBeUndefined();
  });
  it('writes HEX, RGB and HSL, with alpha when there is one', () => {
    expect(Object.fromEntries(formats({ r: 14, g: 107, b: 82, a: 1 }))).toEqual({
      HEX: '#0e6b52', RGB: 'rgb(14 107 82)', HSL: 'hsl(164 77% 24%)', 'RGB (legacy)': 'rgb(14, 107, 82)',
    });
    expect(Object.fromEntries(formats({ r: 255, g: 0, b: 0, a: 0.5 })).HEX).toBe('#ff000080');
  });
  it('keeps the picker and the text box in sync', async () => {
    expect((await colorRun({ color: 'rgb(255 0 0 / 50%)', picker: '#000000' }, 'color')).set).toEqual({ picker: '#ff0000' });
    expect((await colorRun({ color: 'x', picker: '#336699' }, 'picker')).set).toEqual({ color: '#336699' });
    expect((await colorRun({ color: 'nope', picker: '#000000' }, 'color')).error).toMatch(/^Can’t read that color/);
  });
});

describe('case converter', () => {
  it('finds words at separators, camel humps and acronym ends', () => {
    expect(words('getHTTPResponse')).toEqual(['get', 'HTTP', 'Response']);
    expect(words('user_id-and some.Thing2Go')).toEqual(['user', 'id', 'and', 'some', 'Thing2', 'Go']);
    expect(words('Crème brûlée')).toEqual(['Crème', 'brûlée']);
  });
  it('writes every case', () => {
    expect(Object.fromEntries(cases('getHTTPResponse code'))).toEqual({
      camelCase: 'getHttpResponseCode',
      PascalCase: 'GetHttpResponseCode',
      snake_case: 'get_http_response_code',
      CONSTANT_CASE: 'GET_HTTP_RESPONSE_CODE',
      'kebab-case': 'get-http-response-code',
      'Title Case': 'Get HTTP Response Code',
      'Sentence case': 'Get HTTP response code',
      'lower case': 'gethttpresponse code',
      'UPPER CASE': 'GETHTTPRESPONSE CODE',
    });
  });
});
