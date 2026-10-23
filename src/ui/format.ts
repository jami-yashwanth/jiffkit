/** Decimal units, as file managers show them: "2.4 MB", "820 KB". */
export function formatBytes(n: number): string {
  const kb = Math.round(n / 1000);
  if (kb < 1000) return `${n > 0 ? Math.max(1, kb) : 0} KB`;
  return `${(n / 1e6).toFixed(1)} MB`;
}

const SEPARATOR = /[_\-. ]/;

function splitExt(name: string): [string, string] {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
}

/**
 * Shorten a file name to at most `max` characters by cutting out the middle, keeping the extension.
 * Cuts land on separators (`_ - . space`) when that keeps a fair share of the name, so
 * `IMG_20261023_123456_final.heic` becomes `IMG_20261023_…_final.heic`.
 */
export function middleTruncate(name: string, max: number): string {
  if (name.length <= max) return name;
  const [base, ext] = splitExt(name);
  const room = max - ext.length - 1; // characters left for head + tail around the ellipsis
  if (room < 2) return `${name.slice(0, Math.max(0, max - 1))}…`;

  const seps = [...base].flatMap((c, i) => (SEPARATOR.test(c) ? [i] : []));
  const heads = seps.map((i) => i + 1); // head = base[0, h): ends with a separator
  const tails = [...seps].reverse(); // tail = base[t, end): starts with a separator
  let h = 0;
  let t = base.length;
  let hi = 0;
  let ti = 0;
  for (;;) {
    const fits = (nh: number, nt: number) => nh <= nt && nh + (base.length - nt) <= room;
    const tryHead = () => hi < heads.length && fits(heads[hi]!, t) && ((h = heads[hi++]!), true);
    const tryTail = () => ti < tails.length && fits(h, tails[ti]!) && ((t = tails[ti++]!), true);
    const headFirst = h <= base.length - t;
    if (headFirst ? tryHead() || tryTail() : tryTail() || tryHead()) continue;
    break;
  }
  if (h + (base.length - t) < room / 2) {
    h = Math.ceil(room / 2);
    t = base.length - Math.floor(room / 2);
  }
  return `${base.slice(0, h)}…${base.slice(t)}${ext}`;
}

/** Make names unique for a ZIP (case-insensitively): a.jpg, a-1.jpg, a-2.jpg. */
export function uniqueNames(names: string[]): string[] {
  const taken = new Set<string>();
  return names.map((name) => {
    let candidate = name;
    const [base, ext] = splitExt(name);
    for (let n = 1; taken.has(candidate.toLowerCase()); n++) candidate = `${base}-${n}${ext}`;
    taken.add(candidate.toLowerCase());
    return candidate;
  });
}
