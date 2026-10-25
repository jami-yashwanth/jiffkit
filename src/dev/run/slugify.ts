import type { Runner } from '../form';

// Letters that Unicode decomposition does not reduce to a plain Latin letter plus an accent.
const SPECIAL: Record<string, string> = { ß: 'ss', æ: 'ae', Æ: 'AE', œ: 'oe', Œ: 'OE', ø: 'o', Ø: 'O', đ: 'd', Đ: 'D', ł: 'l', Ł: 'L', þ: 'th', Þ: 'TH' };

export function slugify(text: string, separator: string, lower: boolean): string {
  const plain = text
    .replace(/[ßæÆœŒøØđĐłŁþÞ]/g, (c) => SPECIAL[c])
    .normalize('NFKD')
    .replace(/\p{M}/gu, '');
  const slug = plain.split(/[^\p{L}\p{N}]+/u).filter(Boolean).join(separator);
  return lower ? slug.toLocaleLowerCase() : slug;
}

export const run: Runner = ({ text, separator, lower }) => {
  const s = String(text);
  if (!s.trim()) return {};
  const slug = slugify(s, String(separator), !!lower);
  return slug ? { out: { slug } } : { status: 'There are no letters or digits to make a slug from.' };
};
