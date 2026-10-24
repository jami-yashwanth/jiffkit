const CHUNK = 0x8000;

export function encodeBase64(text: string, opts: { urlSafe: boolean }): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  const b64 = btoa(binary);
  return opts.urlSafe ? b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : b64;
}

export function decodeBase64(b64: string, opts: { urlSafe: boolean }): { ok: true; text: string } | { ok: false; reason: 'invalid' | 'not-text' } {
  let s = b64.replace(/\s+/g, '');
  if (opts.urlSafe) s = s.replace(/-/g, '+').replace(/_/g, '/');
  s = s.replace(/={0,2}$/, '');
  if (!/^[A-Za-z0-9+/]*$/.test(s) || s.length % 4 === 1) return { ok: false, reason: 'invalid' };
  s += '='.repeat((4 - (s.length % 4)) % 4);
  const bytes = Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  try {
    return { ok: true, text: new TextDecoder('utf-8', { fatal: true }).decode(bytes) };
  } catch {
    return { ok: false, reason: 'not-text' };
  }
}
