import { describe, expect, it } from 'vitest';
import { formatJson, minifyJson } from '../../src/text/json';

describe('formatJson', () => {
  it('indents with two spaces', () => {
    expect(formatJson('{"a":1}', 2)).toEqual({ ok: true, output: '{\n  "a": 1\n}' });
  });
  it('indents with four spaces and tabs', () => {
    expect(formatJson('[1]', 4)).toEqual({ ok: true, output: '[\n    1\n]' });
    expect(formatJson('{"a":1}', '\t')).toEqual({ ok: true, output: '{\n\t"a": 1\n}' });
  });
  it('accepts a BOM prefix and trailing whitespace', () => {
    expect(formatJson('\uFEFF{"a":1}\n  ', 2)).toEqual({ ok: true, output: '{\n  "a": 1\n}' });
  });
  it('formats scalars', () => {
    expect(formatJson(' "x" ', 2)).toEqual({ ok: true, output: '"x"' });
  });
});

describe('minifyJson', () => {
  it('removes insignificant whitespace', () => {
    expect(minifyJson('{ "a" : [1, 2] }')).toEqual({ ok: true, output: '{"a":[1,2]}' });
  });
  it('keeps whitespace inside strings', () => {
    expect(minifyJson('{ "a" : "x  y" }')).toEqual({ ok: true, output: '{"a":"x  y"}' });
  });
});

describe('JSON errors', () => {
  const fail = (input: string) => {
    const r = formatJson(input, 2);
    if (r.ok) throw new Error(`expected failure for ${JSON.stringify(input)}`);
    return r;
  };
  it('reports a trailing comma at the closing brace', () => {
    const r = fail('{\n  "a": 1,\n}');
    expect([r.line, r.column]).toEqual([3, 1]);
    expect(r.message).toMatch(/trailing comma/i);
  });
  it('reports a missing colon at the offending token', () => {
    const r = fail('{"a" 1}');
    expect([r.line, r.column]).toEqual([1, 6]);
    expect(r.message).toBe("Expected ':'");
  });
  it('reports end of input at the position after the last character', () => {
    const r = fail('{"a": [1, 2');
    expect([r.line, r.column]).toEqual([1, 12]);
    expect(r.message).toBe('Unexpected end of input');
  });
  it('reports empty input', () => {
    const r = fail('   ');
    expect(r.message).toBe('Unexpected end of input');
  });
  it('reports an unterminated string', () => {
    expect(fail('{"a": "abc').message).toBe('Unterminated string');
  });
  it('reports an unescaped newline inside a string at the newline', () => {
    const r = fail('["a\nb"]');
    expect([r.line, r.column]).toEqual([1, 4]);
    expect(r.message).toMatch(/control character/i);
  });
  it('reports bad escapes', () => {
    expect(fail('"\\x"').message).toMatch(/escape/i);
    expect(fail('"\\u12G4"').message).toMatch(/escape/i);
  });
  it('reports an unexpected comma and single-quoted strings', () => {
    expect(fail('[,1]').message).toBe('Unexpected comma');
    expect(fail("{'a':1}").message).toBe("Unexpected character \"'\"");
  });
  it('reports invalid numbers and literals', () => {
    expect(fail('[01]').column).toBe(3);
    expect(fail('[1.]').message).toBe('Invalid number');
    expect(fail('[tru]').message).toBe('Unexpected character "]"');
  });
  it('reports extra content after the value', () => {
    const r = fail('{} x');
    expect([r.line, r.column]).toEqual([1, 4]);
  });
  it('counts columns after the BOM and in UTF-16 units', () => {
    expect(fail('\uFEFF{"a" 1}').column).toBe(6);
    expect(fail('["👋" 1]').column).toBe(7);
  });
  it('minify reports the same errors', () => {
    const r = minifyJson('{"a" 1}');
    expect(r).toMatchObject({ ok: false, line: 1, column: 6 });
  });
  it('never returns an empty message', () => {
    for (const s of ['', '{', '}', '[1,]', '{"a":}', 'nul', '-', '"']) {
      const r = formatJson(s, 2);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message.length).toBeGreaterThan(0);
    }
  });
});
