// libheif-js ships no types for its ESM bundle. The factory returns the (synchronous) emscripten module;
// codecs.ts narrows it to the few members we use.
declare module 'libheif-js/libheif-wasm/libheif-bundle.mjs' {
  const create: (options?: object) => unknown;
  export default create;
}
