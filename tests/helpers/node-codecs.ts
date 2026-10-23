import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { setWasmSource, type WasmName } from '../../src/engine/codecs';

const require = createRequire(import.meta.url);

const WASM_FILES: Record<WasmName, string> = {
  jpeg: '@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm',
  png: '@jsquash/png/codec/pkg/squoosh_png_bg.wasm',
  webp: '@jsquash/webp/codec/dec/webp_dec.wasm',
  oxipng: '@jsquash/oxipng/codec/pkg/squoosh_oxipng_bg.wasm',
};

/** Node has no fetch for file URLs, so hand the codecs their .wasm straight from node_modules. */
export function useNodeWasm(): void {
  setWasmSource(async (name) => WebAssembly.compile(readFileSync(require.resolve(WASM_FILES[name]))));
}
