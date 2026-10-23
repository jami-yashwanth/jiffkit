import { boxes } from './sniff';

/** EXIF Orientation (1-8) from a TIFF block, or 1 when absent or invalid. */
function tiffOrientation(b: Uint8Array, start: number, end: number): number {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (start + 8 > end) return 1;
  const order = v.getUint16(start);
  if (order !== 0x4949 && order !== 0x4d4d) return 1;
  const le = order === 0x4949;
  if (v.getUint16(start + 2, le) !== 42) return 1;
  const ifd = start + v.getUint32(start + 4, le);
  if (ifd + 2 > end) return 1;
  const count = v.getUint16(ifd, le);
  for (let n = 0; n < count; n++) {
    const entry = ifd + 2 + n * 12;
    if (entry + 12 > end) return 1;
    if (v.getUint16(entry, le) === 0x0112) {
      const value = v.getUint16(entry + 8, le);
      return value >= 1 && value <= 8 ? value : 1;
    }
  }
  return 1;
}

/** EXIF Orientation from the APP1 segment of a JPEG. Never throws. */
export function jpegOrientation(b: Uint8Array): number {
  try {
    const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
    let i = 2;
    while (i + 4 <= b.length && b[i] === 0xff) {
      const marker = b[i + 1];
      if (marker === 0xda || marker === 0xd9) break; // image data starts
      const len = v.getUint16(i + 2);
      const end = Math.min(i + 2 + len, b.length);
      // "Exif\0\0"
      if (marker === 0xe1 && b[i + 4] === 0x45 && b[i + 5] === 0x78 && b[i + 6] === 0x69 && b[i + 7] === 0x66) {
        return tiffOrientation(b, i + 10, end);
      }
      i = end;
    }
  } catch {
    // fall through
  }
  return 1;
}

const uint = (v: DataView, at: number, size: number): number =>
  size === 0 ? 0 : size === 8 ? v.getUint32(at) * 2 ** 32 + v.getUint32(at + 4) : size === 4 ? v.getUint32(at) : size === 2 ? v.getUint16(at) : v.getUint8(at);

export interface HeifOrientation {
  /** The primary image carries a non-trivial irot/imir, which libheif applies while decoding. */
  hasTransform: boolean;
  /** EXIF Orientation from the file's Exif item, 1 when absent. */
  exif: number;
}

/**
 * What HEIC says about orientation. Per HEIF, container transforms (irot/imir) are authoritative and EXIF
 * orientation must then be ignored; EXIF is only the answer when there is no transform. Never throws.
 */
export function heicOrientation(b: Uint8Array): HeifOrientation {
  const none = { hasTransform: false, exif: 1 };
  try {
    const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const meta = boxes(v, b, 0, b.length).find((x) => x.type === 'meta');
    if (!meta) return none;
    const kids = boxes(v, b, meta.start + 4, meta.end);
    const pitm = kids.find((x) => x.type === 'pitm');
    if (!pitm) return none;
    const primary = v.getUint8(pitm.start) === 0 ? v.getUint16(pitm.start + 4) : v.getUint32(pitm.start + 4);
    return {
      hasTransform: hasTransform(v, b, kids, primary),
      exif: exifOrientation(v, b, kids),
    };
  } catch {
    return none;
  }
}

function hasTransform(v: DataView, b: Uint8Array, kids: ReturnType<typeof boxes>, primary: number): boolean {
  const iprp = kids.find((x) => x.type === 'iprp');
  if (!iprp) return false;
  const props = boxes(v, b, iprp.start, iprp.end);
  const ipco = props.find((x) => x.type === 'ipco');
  const ipma = props.find((x) => x.type === 'ipma');
  if (!ipco || !ipma) return false;
  const all = boxes(v, b, ipco.start, ipco.end);
  const version = v.getUint8(ipma.start);
  const wide = (v.getUint8(ipma.start + 3) & 1) === 1;
  let p = ipma.start + 8;
  const count = v.getUint32(ipma.start + 4);
  for (let n = 0; n < count && p < ipma.end; n++) {
    const id = version < 1 ? v.getUint16(p) : v.getUint32(p);
    p += version < 1 ? 2 : 4;
    const assocs = v.getUint8(p++);
    for (let a = 0; a < assocs; a++) {
      const index = wide ? v.getUint16(p) & 0x7fff : v.getUint8(p) & 0x7f;
      p += wide ? 2 : 1;
      if (id !== primary) continue;
      const prop = all[index - 1];
      if (prop?.type === 'imir') return true;
      if (prop?.type === 'irot' && (v.getUint8(prop.start) & 3) !== 0) return true;
    }
  }
  return false;
}

function exifOrientation(v: DataView, b: Uint8Array, kids: ReturnType<typeof boxes>): number {
  const iinf = kids.find((x) => x.type === 'iinf');
  const iloc = kids.find((x) => x.type === 'iloc');
  if (!iinf || !iloc) return 1;

  // Find the item whose type is 'Exif'.
  const infeStart = iinf.start + (v.getUint8(iinf.start) === 0 ? 6 : 8);
  let exifId = -1;
  for (const infe of boxes(v, b, infeStart, iinf.end)) {
    const ver = v.getUint8(infe.start);
    if (infe.type !== 'infe' || ver < 2) continue;
    const idSize = ver === 2 ? 2 : 4;
    const type = String.fromCharCode(...b.subarray(infe.start + 4 + idSize + 2, infe.start + 8 + idSize + 2));
    if (type === 'Exif') {
      exifId = uint(v, infe.start + 4, idSize);
      break;
    }
  }
  if (exifId < 0) return 1;

  // Locate its bytes via iloc (construction method 0, first extent).
  const version = v.getUint8(iloc.start);
  const sizes = v.getUint8(iloc.start + 4);
  const sizes2 = v.getUint8(iloc.start + 5);
  const offsetSize = sizes >> 4;
  const lengthSize = sizes & 15;
  const baseSize = sizes2 >> 4;
  const indexSize = version === 1 || version === 2 ? sizes2 & 15 : 0;
  let p = iloc.start + 6;
  const count = version < 2 ? v.getUint16(p) : v.getUint32(p);
  p += version < 2 ? 2 : 4;
  for (let n = 0; n < count; n++) {
    const id = uint(v, p, version < 2 ? 2 : 4);
    p += version < 2 ? 2 : 4;
    let method = 0;
    if (version === 1 || version === 2) {
      method = v.getUint16(p) & 15;
      p += 2;
    }
    p += 2; // data_reference_index
    const base = uint(v, p, baseSize);
    p += baseSize;
    const extents = v.getUint16(p);
    p += 2;
    for (let e = 0; e < extents; e++) {
      p += indexSize;
      const offset = uint(v, p, offsetSize);
      p += offsetSize;
      const length = uint(v, p, lengthSize);
      p += lengthSize;
      if (id !== exifId || e !== 0 || method !== 0) continue;
      const at = base + offset;
      if (length < 12 || at + length > b.length) return 1;
      // Exif item: 4-byte offset to the TIFF header, which may be preceded by "Exif\0\0".
      const tiff = at + 4 + v.getUint32(at);
      return tiffOrientation(b, tiff, at + length);
    }
  }
  return 1;
}
