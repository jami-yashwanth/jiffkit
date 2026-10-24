import { describe, expect, it } from 'vitest';
import { parseRanges, rangesLabel } from '../../src/pdf/ranges';

describe('parseRanges (24 pages)', () => {
  const p = (s: string) => parseRanges(s, 24);

  it.each([
    ['1-3, 5', [[1, 3], [5, 5]]],
    ['7-', [[7, 24]]],
    ['-4', [[1, 4]]],
    [' 5 , 5 ', [[5, 5]]],
    ['1-5, 3-7', [[1, 7]]],
    ['5, 1-2', [[5, 5], [1, 2]]],
  ])('%j', (input, expected) => {
    expect(p(input)).toEqual(expected);
  });

  it.each(['3-1', '0', '25', 'a', '', '  ', '1,,2', '1-30'])('rejects %j', (input) => {
    expect(p(input)).toBeInstanceOf(RangeError);
  });

  it.each(['-', '1-2-3'])('rejects malformed %j', (input) => {
    expect(p(input)).toBeInstanceOf(RangeError);
  });
});

describe('parseRanges hardening', () => {
  it.each([
    ['a huge number', '1-99999999999'],
    ['a double dash', '1--3'],
    ['fullwidth digits', '\uff11'],
    ['a long garbage input', 'x'.repeat(10_000)],
  ])('rejects %s quickly', (_, input) => {
    const t = performance.now();
    expect(parseRanges(input, 24)).toBeInstanceOf(RangeError);
    expect(performance.now() - t).toBeLessThan(200);
  });

  it('handles a 10,000-character valid list quickly', () => {
    const t = performance.now();
    expect(parseRanges('1,'.repeat(4999) + '1', 24)).toEqual([[1, 1]]);
    expect(performance.now() - t).toBeLessThan(200);
  });
});

describe('rangesLabel', () => {
  it('joins range ends with dashes', () => {
    expect(rangesLabel([[1, 3], [5, 5]])).toBe('1-3-5');
  });
  it('uses a single number for a single page', () => {
    expect(rangesLabel([[7, 7]])).toBe('7');
  });
});
