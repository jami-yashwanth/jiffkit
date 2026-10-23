import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

const script = resolve('scripts/check-budget.mjs');

/** Incompressible-ish filler so gzip sizes are predictable enough to tell files apart. */
const filler = (n: number, seed: number) => {
  let x = seed;
  let s = '';
  for (let i = 0; i < n; i++) {
    x = (Math.imul(x, 1103515245) + 12345) & 0x7fffffff;
    s += String.fromCharCode(97 + ((x >>> 16) % 26));
  }
  return `/*${s}*/`;
};

function run(files: Record<string, string>): { out: string; code: number } {
  const root = mkdtempSync(join(tmpdir(), 'budget-'));
  for (const [path, body] of Object.entries(files)) {
    const full = join(root, 'dist', path);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, body);
  }
  try {
    return { out: execFileSync('node', [script], { cwd: root, encoding: 'utf8' }), code: 0 };
  } catch (e) {
    const err = e as { stdout: string; status: number };
    return { out: err.stdout, code: err.status };
  }
}

const kb = (s: string) => Number(s.match(/([\d.]+) KB gzip/)![1]);
const gz = (s: string) => gzipSync(s).length / 1024;

describe('check-budget', () => {
  it('counts entry scripts, modulepreloads and static imports, but not dynamic imports', () => {
    const entry = `import{a}from"./shared.js";import"./side.js";const w=()=>import("./codec.js");${filler(200, 1)}`;
    const shared = `export const a=1;${filler(300, 2)}`;
    const side = `${filler(400, 3)}`;
    const pre = `${filler(500, 4)}`;
    const codec = `${filler(20000, 5)}`;
    const { out, code } = run({
      'tool/index.html': `<html><head><link rel="modulepreload" href="/_astro/pre.js"><script type="module" src="/_astro/entry.js"></script></head></html>`,
      '_astro/entry.js': entry,
      '_astro/shared.js': shared,
      '_astro/side.js': side,
      '_astro/pre.js': pre,
      '_astro/codec.js': codec,
    });
    expect(code).toBe(0);
    const expected = gz(entry) + gz(shared) + gz(side) + gz(pre);
    expect(kb(out)).toBeCloseTo(expected, 1);
  });

  it('counts a chunk only once and fails over 15 KB', () => {
    const big = filler(40000, 9);
    const { out, code } = run({
      'tool/index.html': `<link rel="modulepreload" href="/_astro/big.js"><script type="module" src="/_astro/entry.js"></script>`,
      '_astro/entry.js': `import"./big.js";import"./big.js";`,
      '_astro/big.js': big,
    });
    expect(code).toBe(1);
    expect(out).toContain('FAIL');
    expect(kb(out)).toBeCloseTo(gz(big) + gz(`import"./big.js";import"./big.js";`), 1);
  });
});
