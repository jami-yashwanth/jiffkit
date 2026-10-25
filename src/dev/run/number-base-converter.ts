import type { Runner } from '../form';

const NAMES: Record<string, string> = { '2': 'binary', '8': 'octal', '10': 'decimal', '16': 'hex' };
const PREFIX: Record<string, string> = { '2': '0b', '8': '0o', '16': '0x' };
const DIGITS: Record<string, RegExp> = { '2': /^[01]+$/, '8': /^[0-7]+$/, '10': /^\d+$/, '16': /^[0-9a-fA-F]+$/ };

/** A BigInt from `value` in `base`, or the first character that is not a digit of that base. */
export function parseBase(value: string, base: string): { n: bigint } | { bad: string } {
  let s = value.trim().replace(/[\s_]/g, '');
  const negative = s.startsWith('-');
  if (negative) s = s.slice(1);
  if (PREFIX[base] && s.toLowerCase().startsWith(PREFIX[base])) s = s.slice(2);
  if (!DIGITS[base].test(s)) return { bad: [...s].find((c) => !DIGITS[base].test(c)) ?? '' };
  const n = BigInt(base === '10' ? s : `${PREFIX[base]}${s}`);
  return { n: negative ? -n : n };
}

export const run: Runner = ({ base, value }) => {
  const b = String(base);
  if (!String(value).trim()) return {};
  const parsed = parseBase(String(value), b);
  if ('bad' in parsed) return { error: parsed.bad ? `“${parsed.bad}” is not a ${NAMES[b]} digit.` : `Type a ${NAMES[b]} number.` };
  const { n } = parsed;
  return {
    out: {
      bases: {
        rows: [
          ['Decimal', n.toString(10)],
          ['Hex', n.toString(16)],
          ['Binary', n.toString(2)],
          ['Octal', n.toString(8)],
        ],
      },
    },
  };
};
