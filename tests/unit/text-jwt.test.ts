import { describe, expect, it } from 'vitest';
import { decodeJwt } from '../../src/text/jwt';

const NOW = new Date('2026-10-24T12:00:00Z');
const b64url = (s: string) => Buffer.from(s, 'utf8').toString('base64url');
const make = (payload: unknown, header: unknown = { alg: 'HS256', typ: 'JWT' }) =>
  `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}.c2lnbmF0dXJl`;
const sec = (d: Date) => Math.floor(d.getTime() / 1000);

describe('decodeJwt', () => {
  it('decodes header and payload', () => {
    const r = decodeJwt(make({ sub: '123', name: 'Ada' }), NOW);
    expect(r).toEqual({
      ok: true,
      header: { alg: 'HS256', typ: 'JWT' },
      payload: { sub: '123', name: 'Ada' },
      claims: {},
    });
  });
  it('reports an exp two hours ahead as not expired', () => {
    const exp = sec(NOW) + 2 * 3600;
    const r = decodeJwt(make({ exp }), NOW);
    if (!r.ok) throw new Error('expected ok');
    expect(r.claims.exp).toEqual({ date: new Date(exp * 1000), relative: 'in 2 hours', expired: false });
  });
  it('reports an exp three days back as expired', () => {
    const exp = sec(NOW) - 3 * 86400;
    const r = decodeJwt(make({ exp }), NOW);
    if (!r.ok) throw new Error('expected ok');
    expect(r.claims.exp).toMatchObject({ relative: '3 days ago', expired: true });
  });
  it('reports iat and nbf', () => {
    const r = decodeJwt(make({ iat: sec(NOW) - 600, nbf: sec(NOW) + 3600 }), NOW);
    if (!r.ok) throw new Error('expected ok');
    expect(r.claims.iat?.relative).toBe('10 minutes ago');
    expect(r.claims.nbf?.relative).toBe('in 1 hour');
  });
  it('ignores non-numeric time claims', () => {
    const r = decodeJwt(make({ exp: 'soon', iat: null }), NOW);
    if (!r.ok) throw new Error('expected ok');
    expect(r.claims).toEqual({});
  });
  it('strips Bearer, quotes and whitespace', () => {
    const t = make({ a: 1 });
    expect(decodeJwt(`Bearer ${t}`, NOW).ok).toBe(true);
    expect(decodeJwt(`  "${t}"  `, NOW).ok).toBe(true);
    expect(decodeJwt(`\n${t}\n`, NOW).ok).toBe(true);
  });
  it('accepts an unsigned token with an empty signature', () => {
    const t = make({ a: 1 }).split('.').slice(0, 2).join('.') + '.';
    expect(decodeJwt(t, NOW).ok).toBe(true);
  });
  it('rejects malformed tokens', () => {
    expect(decodeJwt('abc', NOW)).toEqual({ ok: false });
    expect(decodeJwt('a.b', NOW)).toEqual({ ok: false });
    expect(decodeJwt('a.b.c', NOW)).toEqual({ ok: false });
    expect(decodeJwt('', NOW)).toEqual({ ok: false });
    expect(decodeJwt(`${b64url('[1]')}.${b64url('{}')}.x`, NOW)).toEqual({ ok: false });
  });
  it('decodes a Unicode payload', () => {
    const r = decodeJwt(make({ name: 'héllo 👋' }), NOW);
    expect(r).toMatchObject({ ok: true, payload: { name: 'héllo 👋' } });
  });
});
