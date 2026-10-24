/**
 * Parse "1-3, 5", "7-" (to the last page) and "-4" (from the first). Pages are 1-based; spaces are ignored.
 * Overlapping ranges are merged; otherwise the order given is kept.
 */
export function parseRanges(input: string, pageCount: number): [number, number][] | RangeError {
  const text = input.replace(/\s+/g, '');
  if (!text) return new RangeError('empty');
  const ranges: [number, number][] = [];
  for (const part of text.split(',')) {
    const m = /^(\d*)(-?)(\d*)$/.exec(part);
    if (!m || !part || part === '-') return new RangeError(`bad range: ${part}`);
    const [, a, dash, b] = m;
    const start = a ? Number(a) : 1;
    const end = dash ? (b ? Number(b) : pageCount) : start;
    if (start < 1 || end > pageCount || start > end) return new RangeError(`out of range: ${part}`);
    ranges.push([start, end]);
  }
  return mergeOverlaps(ranges);
}

function mergeOverlaps(ranges: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  for (const [s, e] of ranges) {
    const hit = out.find(([os, oe]) => s <= oe && e >= os);
    if (hit) {
      hit[0] = Math.min(hit[0], s);
      hit[1] = Math.max(hit[1], e);
    } else out.push([s, e]);
  }
  // Growing one range can make two earlier ones overlap; fold until stable.
  return out.length === ranges.length ? out : mergeOverlaps(out);
}

/** [[1,3],[5,5]] -> "1-3-5"; a lone page [[7,7]] -> "7". Used in the extract file name. */
export function rangesLabel(ranges: [number, number][]): string {
  return ranges.map(([s, e]) => (s === e ? `${s}` : `${s}-${e}`)).join('-');
}
