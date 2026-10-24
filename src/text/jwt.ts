import { decodeBase64 } from './base64';
import { relativeTime } from './relative-time';

export interface Claim {
  date: Date;
  relative: string;
}
export type JwtResult =
  | {
      ok: true;
      header: unknown;
      payload: unknown;
      claims: { exp?: Claim & { expired: boolean }; iat?: Claim; nbf?: Claim };
    }
  | { ok: false };

function decodePart(part: string): Record<string, unknown> | null {
  const r = decodeBase64(part, { urlSafe: true });
  if (!r.ok) return null;
  try {
    const v: unknown = JSON.parse(r.text);
    return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function claim(value: unknown, now: Date): Claim | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const date = new Date(value * 1000);
  if (Number.isNaN(date.getTime())) return undefined;
  return { date, relative: relativeTime(date, now) };
}

// Decodes only. The signature is never verified, and nothing leaves the page.
export function decodeJwt(token: string, now: Date): JwtResult {
  const cleaned = token
    .trim()
    .replace(/^(["'])(.*)\1$/s, '$2')
    .trim()
    .replace(/^bearer\s+/i, '');
  const parts = cleaned.split('.');
  if (parts.length !== 3) return { ok: false };
  const header = decodePart(parts[0]);
  const payload = decodePart(parts[1]);
  if (!header || !payload) return { ok: false };

  const claims: { exp?: Claim & { expired: boolean }; iat?: Claim; nbf?: Claim } = {};
  const exp = claim(payload.exp, now);
  if (exp) claims.exp = { ...exp, expired: exp.date.getTime() <= now.getTime() };
  const iat = claim(payload.iat, now);
  if (iat) claims.iat = iat;
  const nbf = claim(payload.nbf, now);
  if (nbf) claims.nbf = nbf;
  return { ok: true, header, payload, claims };
}
