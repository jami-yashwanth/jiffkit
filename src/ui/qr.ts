import { track } from './track';
import { makeQr, maxBytes, toSvg, tooMuchText, QUIET, type Level, type QrResult } from '../qr/qr';

// Enhances the static markup from QrTool.astro. The preview holds only SVG we generate from the matrix; user text never reaches innerHTML.

const DEBOUNCE_MS = 100;
const usedListeners: (() => void)[] = [];
let used = false;

/** `cb` runs once per page view, on the first successful Download. */
export function onUsed(cb: () => void): void {
  usedListeners.push(cb);
}

const $ = <T extends HTMLElement = HTMLElement>(root: HTMLElement, sel: string) => root.querySelector<T>(sel)!;

type Ok = Extract<QrResult, { ok: true }>;

/** Draw on a canvas of exactly `px`: black on white, 4-module quiet zone, the largest whole-pixel module that fits, centred. */
function toPngBlob(qr: Ok, px: number): Promise<Blob | null> {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = px;
  const ctx = canvas.getContext('2d')!;
  const total = qr.size + QUIET * 2;
  const mod = Math.max(1, Math.floor(px / total));
  const offset = Math.floor((px - mod * total) / 2) + QUIET * mod;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, px, px);
  ctx.fillStyle = '#000';
  for (let r = 0; r < qr.size; r++)
    for (let c = 0; c < qr.size; c++) if (qr.isDark(r, c)) ctx.fillRect(offset + c * mod, offset + r * mod, mod, mod);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  // Give the browser time to start the download before the URL goes away.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function mount(root: HTMLElement): void {
  const tool = root.dataset.tool!;
  onUsed(() => track('tool_used', { tool })); // registered before any Download, so the one-time event can't be missed
  const input = $<HTMLInputElement>(root, '[data-input]');
  const status = $(root, '[data-status]');
  const preview = $(root, '[data-results]');
  const placeholder = preview.firstElementChild as HTMLElement;
  const [png, svg] = ['png', 'svg'].map((k) => $<HTMLButtonElement>(root, `[data-download="${k}"]`));
  const level = () => (root.querySelector<HTMLInputElement>('[data-level]:checked')?.value ?? 'M') as Level;
  const size = () => Number(root.querySelector<HTMLInputElement>('[data-size]:checked')?.value ?? 512);

  let current: Ok | null = null;
  let timer: number | undefined;

  const render = () => {
    const text = input.value;
    current = null;
    status.textContent = '';
    input.removeAttribute('aria-invalid');
    if (text === '') {
      preview.replaceChildren(placeholder);
    } else {
      const r = makeQr(text, level());
      if (r.ok) {
        current = r;
        // Our own markup from toSvg: numbers and a path, no user text.
        preview.innerHTML = toSvg(r, size());
        preview.firstElementChild!.setAttribute('role', 'img');
        preview.firstElementChild!.setAttribute('aria-label', 'QR code preview');
      } else {
        preview.replaceChildren(placeholder);
        status.textContent = tooMuchText(r.max, level());
        input.setAttribute('aria-invalid', 'true');
      }
    }
    preview.classList.toggle('has-code', !!current);
    png.disabled = svg.disabled = !current;
  };

  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = window.setTimeout(render, DEBOUNCE_MS);
  });
  // Level and size changes apply right away; they cancel a pending keystroke render so nothing stale lands.
  for (const radio of root.querySelectorAll<HTMLInputElement>('[data-level], [data-size]')) {
    radio.addEventListener('change', () => {
      clearTimeout(timer);
      render();
    });
  }

  const markUsed = () => {
    if (used) return;
    used = true;
    for (const cb of usedListeners) cb();
  };

  // A click inside the debounce window must save the text on screen, not the previous code.
  const flush = () => {
    clearTimeout(timer);
    render();
  };

  png.addEventListener('click', async () => {
    flush();
    if (!current) return;
    const blob = await toPngBlob(current, size());
    if (!blob) return;
    save(blob, 'qr-code.png');
    markUsed();
  });
  svg.addEventListener('click', () => {
    flush();
    if (!current) return;
    save(new Blob([toSvg(current, size())], { type: 'image/svg+xml' }), 'qr-code.svg');
    markUsed();
  });

  // Browsers can restore a typed value on reload; honour it.
  if (input.value) render();
}
