import { AiError } from '../ai/errors';
import { recognise } from '../ai/ocr/engine';
import { sniff } from '../engine/sniff';
import { copyText } from './clipboard';
import type { AiToolDef } from './ai';

// Image to text: the tool definition the shared AI island (ai.ts) runs. The text found in an image only ever goes
// into the page as a textarea's value.

/** Below this mean confidence (0 to 100) the page asks the reader to check the text. */
const LOW_CONFIDENCE = 70;
const COPIED_MS = 1500;

interface OcrOut {
  text: string;
  confidence: number;
  /** The image's file name without its extension: the .txt takes it. */
  base: string;
}

const baseName = (name: string): string => name.replace(/\.[^./\\]*$/, '').trim() || 'text';

/** A PDF is the one wrong type worth recognising by name: sniff() only knows images. */
async function isPdf(file: Blob): Promise<boolean> {
  return new TextDecoder().decode(await file.slice(0, 5).arrayBuffer()) === '%PDF-';
}

function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, string> = {}, ...kids: (Node | string)[]) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) el.setAttribute(k, v);
  el.append(...kids);
  return el;
}

export function ocrDef(): AiToolDef<OcrOut> {
  return {
    verb: 'Reading text',
    modelKey: 'tessdata',
    cancelWork: true, // a large page can take a while on a slow device
    inputName: 'JPG, PNG or WebP image',
    elsewhere: {
      heic: { href: '/heic-to-jpg/', h1: 'HEIC to JPG' },
      pdf: { href: '/pdf-to-jpg/', h1: 'PDF to JPG' },
    },
    messages: { corrupt: "We couldn't read this image. It may be damaged or incomplete." },

    async check(file) {
      if (await isPdf(file)) throw new AiError('wrong-type', { detectedType: 'pdf' });
      const { type } = await sniff(file);
      if (type !== 'jpg' && type !== 'png' && type !== 'webp') throw new AiError('wrong-type', type === 'unknown' ? {} : { detectedType: type });
    },

    async run(file, _caps, onProgress, { signal }) {
      const { text, confidence } = await recognise(file, onProgress, signal);
      return { text, confidence, base: baseName(file.name) };
    },

    renderResult({ text, confidence, base }, root) {
      if (!text.trim()) {
        root.append(h('p', {}, "We couldn't find any text in this image."));
        return;
      }
      const box = h('textarea', { id: 'ocr-text', class: 'text-input', rows: '10', spellcheck: 'false' });
      box.value = text.trimEnd();
      const copied = h('span', { class: 'copied', 'aria-live': 'polite' });
      const copy = h('button', { type: 'button', class: 'btn' }, 'Copy');
      let timer: number | undefined;
      copy.addEventListener('click', async () => {
        if (!(await copyText(box.value))) return void box.select();
        copied.textContent = 'Copied';
        clearTimeout(timer);
        timer = window.setTimeout(() => (copied.textContent = ''), COPIED_MS);
      });
      const download = h('button', { type: 'button', class: 'btn btn-quiet' }, 'Download .txt');
      // Built when clicked, from what the box says by then: the reader may have fixed the text.
      download.addEventListener('click', () => {
        const url = URL.createObjectURL(new Blob([box.value], { type: 'text/plain;charset=utf-8' }));
        const a = h('a', { href: url, download: `${base}.txt` });
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000); // time for the browser to start the download
      });

      const field = h('div', { class: 'field' }, h('label', { for: 'ocr-text' }, 'Text'), box);
      root.append(
        field,
        ...(confidence < LOW_CONFIDENCE ? [h('p', { class: 'note', 'data-low-confidence': '' }, 'Some text may be wrong. Check it before using.')] : []),
        h('div', { class: 'actions' }, copy, download, copied),
        h('p', { class: 'note' }, 'Language: English'),
      );
    },
  };
}
