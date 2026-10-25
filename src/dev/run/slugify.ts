import type { Runner } from '../form';

// Letters that Unicode decomposition does not reduce to a plain Latin letter plus an accent.
const SPECIAL: Record<string, string> = { ß: 'ss', æ: 'ae', Æ: 'AE', œ: 'oe', Œ: 'OE', ø: 'o', Ø: 'O', đ: 'd', Đ: 'D', ł: 'l', Ł: 'L', þ: 'th', Þ: 'TH' };

/**
 * Accents come off Latin letters only (é → e). Marks in other scripts are part of the letter and stay, so Japanese
 * ガ is not turned into カ and Hindi vowel signs are kept.
 */
export function slugify(text: string, separator: string, lower: boolean): string {
  const plain = text
    .replace(/[ßæÆœŒøØđĐłŁþÞ]/g, (c) => SPECIAL[c])
    .normalize('NFD')
    .replace(/(\p{Script=Latin})\p{M}+/gu, '$1')
    .normalize('NFC');
  const slug = plain.split(/[^\p{L}\p{M}\p{N}]+/u).filter(Boolean).join(separator);
  return lower ? slug.toLocaleLowerCase() : slug;
}

export const run: Runner = ({ text, separator, lower }) => {
  const s = String(text);
  if (!s.trim()) return {};
  const slug = slugify(s, String(separator), !!lower);
  return slug ? { out: { slug } } : { status: 'There are no letters or digits to make a slug from.' };
};
