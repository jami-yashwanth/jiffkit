// Alias (astro.config.mjs) for onnxruntime-web's build that loads its .wasm from bytes or a URL we give it. It has
// the package's own API and types.
declare module 'ort-wasm-runtime' {
  export * from 'onnxruntime-web';
}
