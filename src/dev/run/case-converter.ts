import type { Runner } from '../form';

/**
 * The words of a name or phrase: split at anything that is not a letter or digit, then inside each run at a lower-to-
 * upper change (userId → user, Id) and at the end of an acronym (HTTPResponse → HTTP, Response).
 */
export function words(s: string): string[] {
  // Marks (\p{M}) belong to their letter: Devanagari vowel signs, decomposed accents.
  return (s.match(/[\p{L}\p{M}\p{N}]+/gu) ?? []).flatMap((run) =>
    run.split(/(?<=[\p{Ll}\p{N}]\p{M}*)(?=\p{Lu})|(?<=\p{Lu}\p{M}*)(?=\p{Lu}\p{Ll})/u),
  );
}

const cap = (w: string) => w.charAt(0).toLocaleUpperCase() + w.slice(1).toLocaleLowerCase();
const isAcronym = (w: string) => w.length > 1 && w === w.toLocaleUpperCase() && w !== w.toLocaleLowerCase();

export function cases(text: string): [string, string][] {
  const w = words(text);
  const lower = w.map((x) => x.toLocaleLowerCase());
  return [
    ['camelCase', lower.map((x, i) => (i ? cap(x) : x)).join('')],
    ['PascalCase', lower.map(cap).join('')],
    ['snake_case', lower.join('_')],
    ['CONSTANT_CASE', w.map((x) => x.toLocaleUpperCase()).join('_')],
    ['kebab-case', lower.join('-')],
    ['Title Case', w.map((x) => (isAcronym(x) ? x : cap(x))).join(' ')],
    ['Sentence case', w.map((x, i) => (isAcronym(x) ? x : i ? x.toLocaleLowerCase() : cap(x))).join(' ')],
    ['lower case', text.toLocaleLowerCase()],
    ['UPPER CASE', text.toLocaleUpperCase()],
  ];
}

export const run: Runner = ({ text }) => {
  const s = String(text);
  if (!s.trim()) return {};
  return { out: { cases: { rows: cases(s) } } };
};
