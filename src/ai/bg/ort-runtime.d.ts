// Aliases (astro.config.mjs) for onnxruntime-web's builds that load their .wasm from a URL we give them. Both have
// the package's own API and types.
declare module 'ort-wasm-runtime' {
  export * from 'onnxruntime-web';
}
declare module 'ort-webgpu-runtime' {
  export * from 'onnxruntime-web';
}
