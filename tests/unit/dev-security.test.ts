import { describe, expect, it } from 'vitest';
import { md5 } from '../../src/dev/lib/md5';
import { randomInt } from '../../src/dev/lib/random';
import { hashes, run as hashRun } from '../../src/dev/run/hash-generator';
import { LOOK_ALIKE, SETS, run as passwordRun } from '../../src/dev/run/password-generator';
import { uuidV7, run as uuidRun } from '../../src/dev/run/uuid-generator';
import { run as bcryptRun } from '../../src/dev/run/bcrypt-generator';
import { run as hmacRun } from '../../src/dev/run/hmac-generator';

const bytes = (s: string) => new TextEncoder().encode(s);
const out = async (p: ReturnType<typeof hashRun>) => (await p).out!;

describe('md5 (RFC 1321 test suite)', () => {
  it.each([
    ['', 'd41d8cd98f00b204e9800998ecf8427e'],
    ['a', '0cc175b9c0f1b6a831c399e269772661'],
    ['abc', '900150983cd24fb0d6963f7d28e17f72'],
    ['message digest', 'f96b697d7cb7938d525a2f31aaf161d0'],
    ['abcdefghijklmnopqrstuvwxyz', 'c3fcd3d76192e4007dfb496cca67e13b'],
    ['ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', 'd174ab98d277d9f5a5611c2c9f419d9f'],
    ['1234567890'.repeat(8), '57edf4a22be3c955ac49da2e2107b67a'],
  ])('md5(%j)', (s, hex) => expect(md5(bytes(s))).toBe(hex));

  it('hashes lengths across the 56-byte padding boundary', () => {
    expect(md5(bytes('a'.repeat(55)))).toBe('ef1772b6dff9a122358552954ad0df65');
    expect(md5(bytes('a'.repeat(56)))).toBe('3b0c8ac703f828b04c6c197006d17218');
    expect(md5(bytes('a'.repeat(64)))).toBe('014842d480b571495a4a0363793f7367');
  });
});

describe('hash generator', () => {
  it('gives MD5 and the four SHAs of the UTF-8 text', async () => {
    const rows = Object.fromEntries(await hashes('abc'));
    expect(rows.MD5).toBe('900150983cd24fb0d6963f7d28e17f72');
    expect(rows['SHA-1']).toBe('a9993e364706816aba3e25717850c26c9cd0d89d');
    expect(rows['SHA-256']).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(Object.keys(rows)).toEqual(['MD5', 'SHA-1', 'SHA-256', 'SHA-384', 'SHA-512']);
  });
  it('shows nothing for empty text', async () => expect(await hashRun({ text: '' })).toEqual({}));
  it('returns table rows', async () => expect((await out(hashRun({ text: 'abc' }))).hashes).toHaveProperty('rows'));
});

describe('password generator', () => {
  const all = { length: '20', upper: true, lower: true, digits: true, symbols: true, similar: false };
  it('has the length and at least one of each chosen set', async () => {
    for (let i = 0; i < 50; i++) {
      const pw = (await passwordRun(all)).out!.password as string;
      expect(pw).toHaveLength(20);
      for (const set of Object.values(SETS)) expect([...pw].some((c) => set.includes(c))).toBe(true);
    }
  });
  it('leaves out look-alike characters when asked', async () => {
    for (let i = 0; i < 50; i++) expect((await passwordRun({ ...all, similar: true })).out!.password).not.toMatch(LOOK_ALIKE);
  });
  it('only uses the chosen sets and clamps the length to 8-64', async () => {
    const pw = (await passwordRun({ ...all, upper: false, symbols: false, length: '200' })).out!.password as string;
    expect(pw).toMatch(/^[a-z0-9]{64}$/);
    expect(((await passwordRun({ ...all, length: '2' })).out!.password as string).length).toBe(8);
  });
  it('reports entropy, and an error with no set chosen', async () => {
    expect((await passwordRun(all)).status).toMatch(/^About 1\d\d bits of entropy\.$/);
    expect(await passwordRun({ ...all, upper: false, lower: false, digits: false, symbols: false })).toEqual({ error: 'Choose at least one kind of character.' });
  });
  it('randomInt stays in range and covers it', () => {
    const seen = new Set(Array.from({ length: 2000 }, () => randomInt(7)));
    expect([...seen].sort()).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});

describe('uuid generator', () => {
  const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  const V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  it('makes v4 and v7 in the RFC 9562 layout', async () => {
    const v4 = ((await uuidRun({ version: '4', count: '20' })).out!.uuids as string).split('\n');
    expect(v4).toHaveLength(20);
    for (const u of v4) expect(u).toMatch(V4);
    const v7 = ((await uuidRun({ version: '7', count: '20' })).out!.uuids as string).split('\n');
    for (const u of v7) expect(u).toMatch(V7);
    expect([...v7].sort()).toEqual(v7);
  });
  it('puts the Unix milliseconds in the first 48 bits of a v7', () => {
    const ms = Date.UTC(2025, 0, 31, 9, 30);
    expect(parseInt(uuidV7(ms).replace(/-/g, '').slice(0, 12), 16)).toBe(ms);
  });
  it('rejects counts outside 1-100', async () => {
    expect((await uuidRun({ version: '4', count: '0' })).error).toBe('Choose between 1 and 100.');
    expect((await uuidRun({ version: '4', count: '101' })).error).toBe('Choose between 1 and 100.');
  });
});

describe('bcrypt', () => {
  it('hashes at the chosen cost and checks a pasted hash', async () => {
    const first = await bcryptRun({ password: 'correct horse', cost: '4', hash: '' });
    const hash = first.out!.result as string;
    expect(hash).toMatch(/^\$2b\$04\$[./A-Za-z0-9]{53}$/);
    expect((await bcryptRun({ password: 'correct horse', cost: '4', hash })).status).toBe('Matches: this password fits the hash you pasted.');
    expect((await bcryptRun({ password: 'wrong', cost: '4', hash })).status).toBe('Does not match the hash you pasted.');
  });
  it('needs a password and a well-formed hash, and notes the 72-byte limit', async () => {
    expect((await bcryptRun({ password: '', cost: '4', hash: '' })).error).toBe('Type a password first.');
    expect((await bcryptRun({ password: 'x', cost: '4', hash: 'nope' })).error).toMatch(/^That is not a bcrypt hash/);
    expect((await bcryptRun({ password: 'é'.repeat(40), cost: '4', hash: '' })).status).toBe('Only the first 72 bytes of the password count.');
  });
});

describe('hmac (RFC 4231 test case 2)', () => {
  const tc = { message: 'what do ya want for nothing?', key: 'Jefe' };
  it('signs with SHA-256 and SHA-512 in hex', async () => {
    expect((await hmacRun({ ...tc, algo: 'SHA-256', encoding: 'hex' })).out!.hmac).toBe('5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843');
    expect((await hmacRun({ ...tc, algo: 'SHA-512', encoding: 'hex' })).out!.hmac).toBe(
      '164b7a7bfcf819e2e395fbe73b56e0a387bd64222e831fd610270cd7ea2505549758bf75c05a994a6d034f65f8f0e6fdcaeab1a34d4a6b4b636e070a38bce737',
    );
  });
  it('gives Base64 of the same bytes', async () => {
    expect((await hmacRun({ ...tc, algo: 'SHA-256', encoding: 'base64' })).out!.hmac).toBe('W9zBRr9gdU5qBCQmCJV1x1oAPwidJzmDnexYuWTsOEM=');
  });
  it('asks for a key, and shows nothing when both are empty', async () => {
    expect(await hmacRun({ message: '', key: '', algo: 'SHA-256', encoding: 'hex' })).toEqual({});
    expect((await hmacRun({ message: 'x', key: '', algo: 'SHA-256', encoding: 'hex' })).status).toBe('Add the secret key to sign the message.');
  });
});
