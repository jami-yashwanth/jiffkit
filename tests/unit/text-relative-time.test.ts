import { describe, expect, it } from 'vitest';
import { relativeTime } from '../../src/text/relative-time';

const NOW = new Date('2026-10-24T12:00:00Z');
describe('relativeTime', () => {
  const at = (s: number) => new Date(NOW.getTime() + s * 1000);
  it('says just now under a minute', () => {
    expect(relativeTime(at(30), NOW)).toBe('just now');
    expect(relativeTime(at(-30), NOW)).toBe('just now');
  });
  it('rounds half up to the largest unit', () => {
    expect(relativeTime(at(90 * 60), NOW)).toBe('in 2 hours');
    expect(relativeTime(at(-90 * 60), NOW)).toBe('2 hours ago');
  });
  it('uses singular and plural forms', () => {
    expect(relativeTime(at(-86400), NOW)).toBe('1 day ago');
    expect(relativeTime(at(86400), NOW)).toBe('in 1 day');
    expect(relativeTime(at(-60), NOW)).toBe('1 minute ago');
    expect(relativeTime(at(5 * 60), NOW)).toBe('in 5 minutes');
    expect(relativeTime(at(-2 * 86400), NOW)).toBe('2 days ago');
  });
  it('promotes to the next unit instead of saying 60 minutes', () => {
    expect(relativeTime(at(59.7 * 60), NOW)).toBe('in 1 hour');
  });
  it('handles unit boundaries in both directions', () => {
    expect(relativeTime(at(59.5), NOW)).toBe('just now');
    expect(relativeTime(at(-59.5), NOW)).toBe('just now');
    expect(relativeTime(at(89 * 60), NOW)).toBe('in 1 hour');
    expect(relativeTime(at(-89 * 60), NOW)).toBe('1 hour ago');
    expect(relativeTime(at(23.5 * 3600), NOW)).toBe('in 1 day');
    expect(relativeTime(at(-23.5 * 3600), NOW)).toBe('1 day ago');
    expect(relativeTime(at(364 * 86400), NOW)).toBe('in 1 year');
    expect(relativeTime(at(-364 * 86400), NOW)).toBe('1 year ago');
  });
  it('handles months and years', () => {
    expect(relativeTime(at(-45 * 86400), NOW)).toBe('2 months ago');
    expect(relativeTime(at(400 * 86400), NOW)).toBe('in 1 year');
  });
});
