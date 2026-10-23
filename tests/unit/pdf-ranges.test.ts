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

describe('rangesLabel', () => {
  it('joins range ends with dashes', () => {
    expect(rangesLabel([[1, 3], [5, 5]])).toBe('1-3-5');
  });
  it('uses a single number for a single page', () => {
    expect(rangesLabel([[7, 7]])).toBe('7');
  });
});
