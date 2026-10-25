import type { Runner } from '../form';

// The traditional lorem ipsum vocabulary (from Cicero's De finibus, as typesetters have scrambled it since the 1500s).
const WORDS = (
  'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna ' +
  'aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute ' +
  'irure in reprehenderit voluptate velit esse cillum fugiat nulla pariatur excepteur sint occaecat cupidatat non ' +
  'proident sunt culpa qui officia deserunt mollit anim id est laborum praesent luctus massa vitae porta mauris'
).split(' ');
const OPENING = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.';

const pick = (rand: () => number) => WORDS[Math.floor(rand() * WORDS.length)];
const between = (lo: number, hi: number, rand: () => number) => lo + Math.floor(rand() * (hi - lo + 1));

function sentence(rand: () => number): string {
  const w = Array.from({ length: between(6, 14, rand) }, () => pick(rand));
  if (w.length > 8) w[between(3, w.length - 4, rand)] += ',';
  return `${w.join(' ').replace(/^./, (c) => c.toUpperCase())}.`;
}

const paragraph = (rand: () => number) => Array.from({ length: between(4, 7, rand) }, () => sentence(rand)).join(' ');

export function lorem(count: number, unit: string, classic: boolean, rand: () => number = Math.random): string {
  if (unit === 'words') {
    const w = Array.from({ length: count }, () => pick(rand));
    if (classic) w.splice(0, Math.min(count, 5), ...OPENING.toLowerCase().replace(/[.,]/g, '').split(' ').slice(0, Math.min(count, 5)));
    return w.join(' ').replace(/^./, (c) => c.toUpperCase());
  }
  const make = unit === 'sentences' ? sentence : paragraph;
  const parts = Array.from({ length: count }, () => make(rand));
  if (classic) parts[0] = unit === 'sentences' ? OPENING : `${OPENING} ${parts[0]}`;
  return parts.join(unit === 'sentences' ? ' ' : '\n\n');
}

export const run: Runner = ({ count, unit, classic }) => {
  const n = Number(count);
  if (!Number.isInteger(n) || n < 1 || n > 50) return { error: 'Choose between 1 and 50.' };
  return { out: { text: lorem(n, String(unit), !!classic) } };
};
