import { describe, expect, it } from 'vitest';
import { decodeBase64, encodeBase64 } from '../../src/text/base64';

describe('base64', () => {
  it('round-trips Unicode text', () => {
    const text = 'héllo 👋';
    const enc = encodeBase64(text, { urlSafe: false });
    expect(decodeBase64(enc, { urlSafe: false })).toEqual({ ok: true, text });
  });
  it('encodes known values', () => {
    expect(encodeBase64('hello', { urlSafe: false })).toBe('aGVsbG8=');
    expect(encodeBase64('', { urlSafe: false })).toBe('');
  });
  it('url-safe output has no +, / or =', () => {
    const enc = encodeBase64('??>', { urlSafe: true });
    expect(enc).toBe('Pz8-');
    expect(enc).not.toMatch(/[+/=]/);
    expect(encodeBase64('a', { urlSafe: true })).toBe('YQ');
  });
  it('round-trips url-safe without padding', () => {
    expect(decodeBase64('YQ', { urlSafe: true })).toEqual({ ok: true, text: 'a' });
    expect(decodeBase64('Pz8-', { urlSafe: true })).toEqual({ ok: true, text: '??>' });
  });
  it('ignores whitespace and line breaks', () => {
    expect(decodeBase64('aGVs\nbG8=\n', { urlSafe: false })).toEqual({ ok: true, text: 'hello' });
  });
  it('accepts missing padding in standard mode', () => {
    expect(decodeBase64('aGVsbG8', { urlSafe: false })).toEqual({ ok: true, text: 'hello' });
  });
  it('rejects characters outside the alphabet', () => {
    expect(decodeBase64('###', { urlSafe: false })).toEqual({ ok: false });
    expect(decodeBase64('Pz8-', { urlSafe: false })).toEqual({ ok: false });
  });
  it('rejects impossible lengths and misplaced padding', () => {
    expect(decodeBase64('a', { urlSafe: false })).toEqual({ ok: false });
    expect(decodeBase64('aG=Vs', { urlSafe: false })).toEqual({ ok: false });
  });
  it('rejects invalid UTF-8', () => {
    // 0xFF 0xFE is never valid UTF-8
    expect(decodeBase64('//4=', { urlSafe: false })).toEqual({ ok: false });
  });
  it('handles large input', () => {
    const text = 'x'.repeat(500_000);
    const enc = encodeBase64(text, { urlSafe: false });
    expect(decodeBase64(enc, { urlSafe: false })).toEqual({ ok: true, text });
  });
});
