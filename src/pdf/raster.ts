// Pure sizing for PDF to JPG. No DOM and no pdf.js here, so the page and the tests can import it freely.

/** The most pixels one page may take: 25 MP is 100 MB of RGBA, the most a phone browser can be trusted with. */
export const MAX_PAGE_PIXELS = 25_000_000;

export interface Scale {
  /** pdf.js viewport scale: 1 is 72 dpi. */
  scale: number;
  /** The resolution actually used when it is one of the two on offer; a page too big even for 150 dpi still reports 150. */
  dpi: 150 | 300;
  /** True when the dpi asked for would have passed MAX_PAGE_PIXELS. */
  capped: boolean;
}

/**
 * Pick the render scale for a page of `pageWidthPt` x `pageHeightPt` points. Wanted dpi if it fits in 25 MP, else 150,
 * else the largest scale that does fit. Callers floor the pixel size, so the result never passes the cap.
 */
export function renderScale(pageWidthPt: number, pageHeightPt: number, dpi: 150 | 300): Scale {
  const area = pageWidthPt * pageHeightPt;
  const fits = (scale: number) => area * scale * scale <= MAX_PAGE_PIXELS;
  const wanted = dpi / 72;
  if (fits(wanted)) return { scale: wanted, dpi, capped: false };
  if (dpi === 300 && fits(150 / 72)) return { scale: 150 / 72, dpi: 150, capped: true };
  return { scale: Math.sqrt(MAX_PAGE_PIXELS / area), dpi: 150, capped: true };
}
