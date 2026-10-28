import type { InType } from '../tools';

export interface Sniffed {
  type: InType | 'unknown';
  width?: number;
  height?: number;
  animated?: boolean;
}

const HEAD_BYTES = 64 * 1024;
/** ftyp brands that say HEVC coded images (HEIC). */
const HEVC_BRANDS = new Set(['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx']);
/** Brands any HEIF file may lead with, AVIF too: HEIC only when a compatible brand says HEVC. */
const HEIF_BRANDS = new Set(['mif1', 'msf1']);

const ascii = (b: Uint8Array, at: number, len: number): string =>
  String.fromCharCode(...b.subarray(at, at + len));

/** Detect type from magic bytes (never the file name) and read dimensions from the first 64 KB. */
export async function sniff(file: Blob): Promise<Sniffed> {
  const b = new Uint8Array(await file.slice(0, HEAD_BYTES).arrayBuffer());
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);

  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    return { type: 'jpg', ...safe(() => jpegSize(b, v)) };
  }
  if (b.length >= 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return b.length >= 24 ? { type: 'png', width: v.getUint32(16), height: v.getUint32(20) } : { type: 'png' };
  }
  if (b.length >= 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') {
    return { type: 'webp', ...safe(() => webpInfo(b, v)) };
  }
  if (b.length >= 12 && ascii(b, 4, 4) === 'ftyp' && isHeic(b, v)) {
    return { type: 'heic', ...safe(() => heicSize(b, v)) };
  }
  return { type: 'unknown' };
}

/** The ftyp box's major brand says HEVC, or it is a plain HEIF brand and a compatible brand says HEVC. */
function isHeic(b: Uint8Array, v: DataView): boolean {
  const major = ascii(b, 8, 4);
  if (HEVC_BRANDS.has(major)) return true;
  if (!HEIF_BRANDS.has(major)) return false;
  const end = Math.min(v.getUint32(0), b.length); // compatible brands run from byte 16 to the box's end
  for (let i = 16; i + 4 <= end; i += 4) if (HEVC_BRANDS.has(ascii(b, i, 4))) return true;
  return false;
}

/** Dimension parsing is best effort: malformed input must never make sniff() reject. */
function safe<T extends object>(parse: () => T): T | Record<string, never> {
  try {
    return parse();
  } catch {
    return {};
  }
}

function jpegSize(b: Uint8Array, v: DataView): { width?: number; height?: number } {
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return {};
    const marker = b[i + 1];
    if (marker === 0xff) {
      i += 1; // fill byte
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2; // standalone markers
      continue;
    }
    const len = v.getUint16(i + 2);
    // SOF0..SOF15 except DHT (C4), JPG (C8), DAC (CC)
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (i + 9 > b.length) return {};
      return { height: v.getUint16(i + 5), width: v.getUint16(i + 7) };
    }
    i += 2 + len;
  }
  return {};
}

function webpInfo(b: Uint8Array, v: DataView): { width?: number; height?: number; animated?: boolean } {
  const fourcc = b.length >= 16 ? ascii(b, 12, 4) : '';
  if (fourcc === 'VP8X' && b.length >= 30) {
    return {
      animated: (b[20] & 0x02) !== 0,
      width: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)),
      height: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)),
    };
  }
  if (fourcc === 'VP8L' && b.length >= 25 && b[20] === 0x2f) {
    const bits = v.getUint32(21, true);
    return { animated: false, width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (fourcc === 'VP8 ' && b.length >= 30 && b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a) {
    return { animated: false, width: v.getUint16(26, true) & 0x3fff, height: v.getUint16(28, true) & 0x3fff };
  }
  return fourcc === 'VP8X' ? {} : { animated: false };
}

export interface Box {
  type: string;
  start: number; // payload start
  end: number; // payload end, clamped to the buffer
}

export function boxes(v: DataView, b: Uint8Array, from: number, to: number): Box[] {
  const out: Box[] = [];
  let i = from;
  while (i + 8 <= to) {
    let size = v.getUint32(i);
    const type = ascii(b, i + 4, 4);
    let header = 8;
    if (size === 1) {
      if (i + 16 > to) break;
      size = v.getUint32(i + 8) * 2 ** 32 + v.getUint32(i + 12);
      header = 16;
    } else if (size === 0) {
      size = to - i;
    }
    if (size < header) break;
    out.push({ type, start: i + header, end: Math.min(i + size, to) });
    i += size;
  }
  return out;
}

/** Width/height from the `ispe` property associated with the primary item (`pitm`). Best effort. */
function heicSize(b: Uint8Array, v: DataView): { width?: number; height?: number } {
  const meta = boxes(v, b, 0, b.length).find((x) => x.type === 'meta');
  if (!meta) return {};
  const kids = boxes(v, b, meta.start + 4, meta.end); // meta is a full box: skip version/flags
  const pitm = kids.find((x) => x.type === 'pitm');
  const iprp = kids.find((x) => x.type === 'iprp');
  if (!pitm || !iprp || pitm.start + 6 > pitm.end) return {};
  const pitmVersion = v.getUint8(pitm.start);
  if (pitmVersion !== 0 && pitm.start + 8 > pitm.end) return {};
  const primary = pitmVersion === 0 ? v.getUint16(pitm.start + 4) : v.getUint32(pitm.start + 4);

  const props = boxes(v, b, iprp.start, iprp.end);
  const ipco = props.find((x) => x.type === 'ipco');
  const ipma = props.find((x) => x.type === 'ipma');
  if (!ipco || !ipma) return {};
  const all = boxes(v, b, ipco.start, ipco.end); // association indices are 1-based over every property box

  if (ipma.start + 8 > ipma.end) return {};
  // ipma: version, flags, entry_count, then (item_id, assoc_count, assocs)
  const version = v.getUint8(ipma.start);
  const flags = v.getUint8(ipma.start + 3);
  let p = ipma.start + 4;
  if (p + 4 > ipma.end) return {};
  const count = v.getUint32(p);
  p += 4;
  for (let n = 0; n < count; n++) {
    const idSize = version < 1 ? 2 : 4;
    if (p + idSize + 1 > ipma.end) return {};
    const id = idSize === 2 ? v.getUint16(p) : v.getUint32(p);
    const assocs = v.getUint8(p + idSize);
    p += idSize + 1;
    const aSize = flags & 1 ? 2 : 1;
    for (let a = 0; a < assocs; a++) {
      if (p + aSize > ipma.end) return {};
      const index = aSize === 2 ? v.getUint16(p) & 0x7fff : v.getUint8(p) & 0x7f;
      p += aSize;
      if (id !== primary || index === 0) continue;
      const prop = all[index - 1];
      if (prop?.type === 'ispe' && prop.start + 12 <= prop.end) {
        return { width: v.getUint32(prop.start + 4), height: v.getUint32(prop.start + 8) };
      }
    }
  }
  return {};
}
