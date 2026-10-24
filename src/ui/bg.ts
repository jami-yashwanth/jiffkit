import type { Caps } from '../ai/capability';
import { AiError } from '../ai/errors';
import { bgEngine, type BgResult } from '../ai/bg/engine';
import type { Background } from '../ai/bg/compose';
import { sniff } from '../engine/sniff';
import type { AiToolDef } from './ai';
import { createCompare } from './compare';

// Remove background: the tool definition the shared AI island (ai.ts) runs. The result is the cut-out over a
// checkerboard, compared with the photo by a before/after slider. Changing the background shows at once (the
// transparent PNG over that colour looks exactly like the blend) while the worker blends the PNG to download from
// the mask it kept, without running the model again.

interface BgOut extends BgResult {
  photo: File;
  /** The photo's file name without its extension: the PNG takes it. */
  base: string;
}

/** Below this much memory (GB), or on a phone, the small model (u2netp) is used. */
const LOW_MEMORY_GB = 4;
/** While a colour is being picked, wait this long after the last change before blending a PNG. */
const COLOUR_SETTLE_MS = 250;

const baseName = (name: string): string => name.replace(/\.[^./\\]*$/, '').trim() || 'photo';

export const pickModel = (caps: Caps): 'bg' | 'bgSmall' =>
  caps.mobile || (caps.deviceMemoryGB ?? Infinity) < LOW_MEMORY_GB ? 'bgSmall' : 'bg';

function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, string> = {}, ...kids: (Node | string)[]) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) el.setAttribute(k, v);
  el.append(...kids);
  return el;
}

const hexToRgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
};

export function bgDef(): AiToolDef<BgOut> {
  return {
    verb: 'Removing background',
    modelKey: pickModel,
    inputName: 'JPG, PNG or WebP image',
    elsewhere: { heic: { href: '/heic-to-jpg/', h1: 'HEIC to JPG' } },

    async check(file) {
      const { type } = await sniff(file);
      if (type !== 'jpg' && type !== 'png' && type !== 'webp') throw new AiError('wrong-type', type === 'unknown' ? {} : { detectedType: type });
    },

    async run(file, caps, onProgress, { signal, modelKey }) {
      const image = await file.arrayBuffer();
      const res = await bgEngine.run(
        { op: 'remove', image, modelKey: modelKey === 'bgSmall' ? 'bgSmall' : 'bg', webgpu: caps.webgpu },
        [image],
        onProgress,
        signal,
      );
      return { ...res, photo: file, base: baseName(file.name) };
    },

    renderResult(res, root) {
      const urls = new Set<string>();
      const track = (blob: Blob) => {
        const url = URL.createObjectURL(blob);
        urls.add(url);
        return url;
      };
      const transparent = track(new Blob([res.png], { type: 'image/png' }));
      const compare = createCompare(
        { src: track(res.photo), alt: 'Your photo' },
        { src: transparent, alt: 'Your photo with the background removed' },
        res.width,
        res.height,
      );

      // --- background: Transparent (default) / White / Colour ---
      const radio = (value: string, label: string, checked = false) =>
        h('label', {}, h('input', { type: 'radio', name: 'bg', value, ...(checked ? { checked: '' } : {}) }), label);
      const colour = h('input', { type: 'color', value: '#000000', 'aria-label': 'Background colour', class: 'bg-colour' });
      colour.hidden = true;
      const options = h(
        'fieldset',
        { class: 'settings pdf-mode pdf-inline bg-options' },
        h('legend', {}, 'Background'),
        radio('transparent', 'Transparent', true),
        radio('white', 'White'),
        radio('colour', 'Colour'),
        colour,
      );

      // --- download: the PNG for the chosen background, blended by the worker when first chosen ---
      const download = h('button', { type: 'button', class: 'btn' }, 'Download PNG');
      const failed = h('p', { class: 'error', role: 'alert' }, "Couldn't make the PNG for this background. Start over and try again.");
      failed.hidden = true;
      const pngs = new Map<string, string>([['transparent', transparent]]);
      let chosen = 'transparent';
      let timer: number | undefined;
      let alive = true;

      const keyOf = (): { key: string; bg: Background } => {
        const value = options.querySelector<HTMLInputElement>('input[name=bg]:checked')!.value;
        if (value === 'white') return { key: 'white', bg: { r: 255, g: 255, b: 255 } };
        if (value === 'colour') return { key: colour.value, bg: hexToRgb(colour.value) };
        return { key: 'transparent', bg: 'transparent' };
      };
      const showPreview = (key: string) => {
        const solid = key === 'transparent' ? '' : key === 'white' ? '#ffffff' : key;
        compare.stage.style.background = solid;
        compare.stage.toggleAttribute('data-checkerboard', !solid);
      };
      const blend = async (key: string, bg: Background) => {
        if (pngs.has(key)) return;
        try {
          const out = await bgEngine.run({ op: 'compose', bg });
          if (!alive) return;
          pngs.set(key, track(new Blob([out.png], { type: 'image/png' })));
        } catch (err) {
          if (!alive) return;
          console.error('bg: could not blend the background', err);
          failed.hidden = false;
        }
        if (key === chosen) download.disabled = !pngs.has(key);
      };
      const choose = (settle: number) => {
        const { key, bg } = keyOf();
        chosen = key;
        colour.hidden = options.querySelector<HTMLInputElement>('input[value=colour]')!.checked === false;
        showPreview(key);
        download.disabled = !pngs.has(key);
        clearTimeout(timer);
        if (!pngs.has(key)) timer = window.setTimeout(() => void blend(key, bg), settle);
      };
      options.addEventListener('change', (e) => choose((e.target as HTMLElement) === colour ? COLOUR_SETTLE_MS : 0));
      colour.addEventListener('input', () => choose(COLOUR_SETTLE_MS));

      download.addEventListener('click', () => {
        const url = pngs.get(chosen);
        if (!url) return;
        const a = h('a', { href: url, download: `${res.base}-no-bg.png` });
        document.body.append(a);
        a.click();
        a.remove();
      });

      const note = h('p', { class: 'note' }, 'Large photo: processed at 25 MP.');
      note.hidden = !res.downscaled;
      showPreview('transparent');
      root.append(compare.el, options, note, failed, h('div', { class: 'actions' }, download));

      return () => {
        alive = false;
        clearTimeout(timer);
        for (const url of urls) URL.revokeObjectURL(url);
        urls.clear();
      };
    },
  };
}
