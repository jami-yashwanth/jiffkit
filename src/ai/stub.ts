// Test-only stand-ins used when the site is built with PUBLIC_AI_STUB=1 (the Playwright build). Every import of
// this module sits behind `import.meta.env.PUBLIC_AI_STUB === '1'`, so a production build drops it; the build test
// checks that this marker never reaches dist: __AI_STUB__
import { sniff } from '../engine/sniff';
import type { AiToolDef } from '../ui/ai';
import { MODELS, modelUrl } from './config';
import { AiError } from './errors';
import { loadModel } from './loader';

export const STUB_MARKER = '__AI_STUB__';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * A stand-in Remove background, so the shared AI states can be tested before the real tool exists: it checks the
 * type like the real one, downloads the model through the real loader (from the routed test URL), fakes the work,
 * and shows a one-line result. Task 5 replaces it with the real definition.
 */
export function stubBgDef(): AiToolDef<{ modelBytes: number }> {
  return {
    verb: 'Removing background',
    modelKey: 'bg',
    inputName: 'JPG, PNG or WebP image',
    elsewhere: { heic: { href: '/heic-to-jpg/', h1: 'HEIC to JPG' } },
    async check(file) {
      const { type } = await sniff(file);
      if (type !== 'jpg' && type !== 'png' && type !== 'webp') throw new AiError('wrong-type', type === 'unknown' ? undefined : type);
    },
    async run(_file, _caps, onProgress, { signal }) {
      const model = await loadModel(modelUrl('bg'), {
        bytes: MODELS.bg.bytes,
        signal,
        onProgress: (done, total) => onProgress({ stage: 'download', done, total }),
      });
      for (let i = 0; i <= 4; i++) {
        if (signal.aborted) throw new AiError('cancelled');
        onProgress({ stage: 'work', done: i, total: 4 });
        await wait(100);
      }
      return { modelBytes: model.byteLength };
    },
    renderResult(res, root) {
      root.append(Object.assign(document.createElement('p'), { textContent: `${STUB_MARKER} result: model ${res.modelBytes} bytes` }));
    },
  };
}
