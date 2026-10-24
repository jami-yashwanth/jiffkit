import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The setup notes a person follows by hand: the parts that are easy to get wrong.

describe('README: model hosting', () => {
  const readme = readFileSync('README.md', 'utf8');

  it('PUBLIC_MODEL_BASE_URL must be an absolute https URL', () => {
    expect(readme).toMatch(/`PUBLIC_MODEL_BASE_URL`[^.]*absolute `https:\/\/` URL/);
  });

  it('the R2 CORS rule exposes Content-Encoding (the loader reads it)', () => {
    expect(readme).toMatch(/ExposeHeaders[^\n]*Content-Encoding/);
  });

  it('says test:models runs Whisper on WebAssembly, so WebGPU needs a manual headed check', () => {
    expect(readme).toMatch(/test:models[^\n]*WebAssembly[^\n]*WebGPU[^\n]*headed/);
  });
});
