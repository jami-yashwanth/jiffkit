import type { Runner } from '../form';

const READ_WPM = 238;
const SPEAK_WPM = 150;

function segments(s: string, granularity: 'word' | 'sentence' | 'grapheme') {
  return [...new Intl.Segmenter(undefined, { granularity }).segment(s)];
}

/** "45 sec", "3 min", "1 h 5 min" for a number of words at a pace. */
export function duration(words: number, wpm: number): string {
  const sec = Math.round((words / wpm) * 60);
  if (sec < 60) return `${sec} sec`;
  const min = Math.round(sec / 60);
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`;
}

export function counts(s: string): [string, string][] {
  const words = segments(s, 'word').filter((x) => x.isWordLike).length;
  const graphemes = segments(s, 'grapheme').map((x) => x.segment);
  const sentences = segments(s, 'sentence').filter((x) => /[\p{L}\p{N}]/u.test(x.segment)).length;
  const paragraphs = s.split(/\n\s*\n/).filter((p) => p.trim()).length;
  const n = (v: number) => v.toLocaleString('en');
  return [
    ['Words', n(words)],
    ['Characters', n(graphemes.length)],
    ['Characters without spaces', n(graphemes.filter((g) => !/^\s+$/.test(g)).length)],
    ['Sentences', n(sentences)],
    ['Paragraphs', n(paragraphs)],
    ['Lines', n(s.split(/\r\n|\r|\n/).length)],
    ['Reading time', duration(words, READ_WPM)],
    ['Speaking time', duration(words, SPEAK_WPM)],
  ];
}

export const run: Runner = ({ text }) => {
  const s = String(text);
  if (!s.trim()) return {};
  return { out: { counts: { rows: counts(s) } } };
};
