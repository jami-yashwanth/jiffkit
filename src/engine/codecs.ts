import type { InType } from '../tools';

/** Thrown when a codec's code or .wasm cannot be fetched or instantiated. */
export class CodecLoadError extends Error {
  override name = 'CodecLoadError';
}

export interface RawImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface HeifImageHandle {
  is_primary(): boolean;
  get_width(): number;
  get_height(): number;
  display(target: RawImage, done: (image: RawImage | null) => void): void;
  free(): void;
}

export interface HeifCodec {
  HeifDecoder: new () => { decode(data: Uint8Array): HeifImageHandle[]; decoder: number | null };
  heif_context_free(ctx: number): void;
}
export interface JpegCodec {
  decode(data: BufferSource, preserveOrientation: boolean): RawImage | null;
}
export interface PngCodec {
  decode(data: Uint8Array): RawImage;
}
export interface OxipngCodec {
  optimise(data: Uint8Array, level: number, interlace: boolean, optimizeAlpha: boolean): Uint8Array;
  optimise_raw(
    data: Uint8ClampedArray,
    width: number,
    height: number,
    level: number,
    interlace: boolean,
    optimizeAlpha: boolean,
  ): Uint8Array;
}
export interface WebpCodec {
  decode(data: BufferSource): RawImage | null;
}

export type WasmName = 'jpeg' | 'png' | 'webp' | 'oxipng';
type WasmSource = (name: WasmName) => Promise<WebAssembly.Module>;

/**
 * By default every codec fetches its own .wasm (resolved by the bundler). Tests, or any host without
 * `fetch` for local files, can hand over a compiled module instead. This keeps `fs` out of this file.
 */
let wasmSource: WasmSource | undefined;
export function setWasmSource(source: WasmSource | undefined): void {
  wasmSource = source;
}
const wasmFor = (name: WasmName): Promise<WebAssembly.Module | undefined> =>
  wasmSource ? wasmSource(name) : Promise.resolve(undefined);

const resetters: (() => void)[] = [];

/** Memoise a loader; a failure is wrapped, forgotten, and retried on the next call (the "Try again" button). */
function lazy<T>(label: string, fn: () => Promise<T>): () => Promise<T> {
  let memo: Promise<T> | undefined;
  resetters.push(() => (memo = undefined));
  return () =>
    (memo ??= fn().catch((cause: unknown) => {
      memo = undefined;
      throw new CodecLoadError(`Could not load the ${label} codec`, { cause });
    }));
}

/** Forget every loaded codec. Used by tests; nothing in production needs it. */
export function resetCodecs(): void {
  for (const r of resetters) r();
}

export const load = {
  heif: lazy<HeifCodec>('HEIC', async () => {
    // The bundle embeds its .wasm, so there is nothing separate to fetch.
    const { default: create } = await import('libheif-js/libheif-wasm/libheif-bundle.mjs');
    return (await create()) as HeifCodec;
  }),

  jpeg: lazy<JpegCodec>('JPEG', async () => {
    const [{ default: factory }, { initEmscriptenModule }] = await Promise.all([
      import('@jsquash/jpeg/codec/dec/mozjpeg_dec.js'),
      import('@jsquash/jpeg/utils.js'),
    ]);
    return initEmscriptenModule(factory, await wasmFor('jpeg')) as Promise<JpegCodec>;
  }),

  png: lazy<PngCodec>('PNG', async () => {
    const pkg = await import('@jsquash/png/codec/pkg/squoosh_png.js');
    await pkg.default(await wasmFor('png'));
    return { decode: (data) => pkg.decode(data) };
  }),

  oxipng: lazy<OxipngCodec>('PNG optimiser', async () => {
    // Single-threaded build: the threaded one needs cross-origin isolation headers.
    const pkg = await import('@jsquash/oxipng/codec/pkg/squoosh_oxipng.js');
    await pkg.default(await wasmFor('oxipng'));
    return { optimise: pkg.optimise, optimise_raw: pkg.optimise_raw };
  }),

  webp: lazy<WebpCodec>('WebP', async () => {
    const [{ default: factory }, { initEmscriptenModule }] = await Promise.all([
      import('@jsquash/webp/codec/dec/webp_dec.js'),
      import('@jsquash/webp/utils.js'),
    ]);
    return initEmscriptenModule(factory, await wasmFor('webp')) as Promise<WebpCodec>;
  }),
};

const PRELOAD: Record<InType, (keyof typeof load)[]> = {
  heic: ['heif'],
  jpg: ['jpeg'],
  png: ['png', 'oxipng'],
  webp: ['webp'],
};

/** Start fetching codecs for these input types (drop-zone hover/focus). Failures are retried on real use. */
export function preload(types: InType[]): void {
  for (const type of new Set(types)) {
    for (const codec of PRELOAD[type]) load[codec]().catch(() => {});
  }
}
