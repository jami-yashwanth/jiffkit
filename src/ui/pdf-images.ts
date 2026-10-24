import type { EngineClient } from '../engine/client';
import type { Done, FailReason } from '../engine/types';
import type { PdfEngine } from '../pdf/client';
import type { ImageFormat, ImageIn, PageSize, PdfOut } from '../pdf/types';
import { formatBytes, middleTruncate } from './format';
import { moveRow, removeRow, rowTools } from './pdf-rows';
import { COPY, createShell, failed, h, NAME_MAX, pages, reasonOf, succeeded, Unusable, type PdfErrorReason } from './pdf-shell';

// Enhances PdfTool.astro for PDF to JPG (`to-images`) and JPG to PDF (`from-images`). Like Merge and Split, each loads
// its engine (a worker plus pdf.js or pdf-lib) on hover, focus or the first file, so the page stays inside the budget.

const loadPdfEngine = () => import('../pdf/client').then(({ createPdfEngine }) => createPdfEngine());
const loadRasterEngine = () =>
  import('../pdf/client').then(({ createPdfEngine, rasterWorkerFactory }) => createPdfEngine(rasterWorkerFactory));

export function mount(el: HTMLElement): void {
  if (el.dataset.op === 'to-images') mountToImages(el);
  else mountFromImages(el);
}

const MIME: Record<ImageFormat, string> = { jpg: 'image/jpeg', png: 'image/png' };
const baseOf = (file: File) => file.name.replace(/\.pdf$/i, '') || 'document';

// ======================= PDF to JPG =======================
function mountToImages(el: HTMLElement): void {
  const shell = createShell<PdfEngine>(el, loadRasterEngine);
  const { q, drop, list, runBtn, job, report, hideAlert, showDone, runJob } = shell;
  const nameEl = q('[data-name]');
  const metaEl = q('[data-meta]');
  const fileError = q('[data-file-error]');
  const options = [...el.querySelectorAll<HTMLElement>('[data-options]')];
  const checked = (name: string) => el.querySelector<HTMLInputElement>(`input[name=${name}]:checked`)!.value;
  let current: { file: File; pages?: number } | undefined;
  let nextId = 0;

  function count(): void {
    const target = current!;
    const gen = shell.generation;
    metaEl.textContent = 'Reading…';
    runBtn.disabled = true;
    job((e) => e.count(`r${nextId++}`, target.file)).then(
      (n) => {
        if (gen !== shell.generation) return;
        if (n > 0) {
          target.pages = n;
          metaEl.textContent = pages(n);
          runBtn.disabled = false;
        } else fail('corrupt');
      },
      (err) => gen === shell.generation && fail(reasonOf(err)),
    );
  }
  function fail(reason: keyof typeof COPY): void {
    metaEl.textContent = '';
    if (reason === 'codec-load') {
      report('codec-load', count);
      return;
    }
    failed(reason);
    fileError.textContent = COPY[reason];
    fileError.hidden = false;
    options.forEach((o) => (o.hidden = true));
  }

  /** A new PDF replaces the current one. */
  function add(files: File[]): void {
    shell.bump();
    hideAlert();
    current = { file: files[0]! };
    nameEl.textContent = middleTruncate(current.file.name, NAME_MAX);
    nameEl.title = current.file.name;
    fileError.hidden = true;
    options.forEach((o) => (o.hidden = false));
    list.hidden = false;
    drop.classList.add('drop-compact');
    count();
  }
  function clear(): void {
    current = undefined;
    fileError.hidden = true;
  }
  shell.wire(add, clear);

  async function run(): Promise<void> {
    const target = current;
    if (!target?.pages || runBtn.disabled) return;
    const format = checked('format') as ImageFormat;
    const dpi = Number(checked('dpi')) as 150 | 300;
    await runJob(
      'Converting…',
      async (gen) => {
        const out = await job((e) => e.rasterize(target.file, format, dpi));
        if (gen !== shell.generation) return;
        if (!out.files.length) throw new Unusable();
        const note = out.capped ? "Very large pages were drawn at a lower resolution to fit your device's memory." : '';
        const blob = (f: { bytes: Uint8Array }) => new Blob([f.bytes as BlobPart], { type: MIME[format] });
        if (out.files.length > 1) {
          const { zipFiles } = await import('./zip');
          const zip = await zipFiles(out.files.map((f) => ({ name: f.name, blob: blob(f) })));
          if (gen !== shell.generation) return;
          const zipName = `${baseOf(target.file)}-pages.zip`;
          showDone(zip, zipName, 'Download all (ZIP)', '', `${out.files.length} files`, `${zipName} ready, ${out.files.length} files`, note);
        } else {
          const f = out.files[0]!;
          showDone(blob(f), f.name, 'Download', f.name, '', `${f.name} ready`, note);
        }
        succeeded(out.files.length);
      },
      () => void run(),
    );
  }
  runBtn.addEventListener('click', () => void run());
}

// ======================= JPG to PDF =======================
type Fail = 'codec-load' | 'corrupt' | 'wrong-type' | 'too-large' | 'oom';
interface Prepared {
  bytes: ArrayBuffer;
  kind: ImageFormat;
  width: number;
  height: number;
}
type State = { kind: 'reading' } | { kind: 'ready'; image: Prepared } | { kind: 'failed'; reason: Fail };
interface Row {
  id: string;
  file: File;
  state: State;
  li: HTMLLIElement;
}

const ROW_COPY: Record<Exclude<Fail, 'codec-load'>, string> = {
  corrupt: "We couldn't read this file. It may be damaged or incomplete.",
  'wrong-type': "This isn't a JPG, PNG, WebP or HEIC image.",
  'too-large': 'This image is too large for your device to convert.',
  oom: 'Your device ran out of memory on this image.',
};
const ANALYTICS: Record<Exclude<Fail, 'codec-load'>, PdfErrorReason> = {
  corrupt: 'corrupt',
  'wrong-type': 'wrong-type',
  'too-large': 'too-large',
  oom: 'device',
};
const MAX_REENCODE_PIXELS = 50e6; // as the image engine: one canvas this big is the most a phone can be trusted with

class ImageFail extends Error {
  constructor(readonly reason: Fail) {
    super(reason);
  }
}

/** The v1 image engine, behind one promise per file. Loaded only when a WebP or HEIC image needs it. */
function createImageConverter() {
  let engine: Promise<EngineClient> | undefined;
  const waiting = new Map<string, { ok: (d: Done) => void; no: (r: FailReason) => void }>();
  function get(): Promise<EngineClient> {
    engine ??= import('../engine/client').then(({ createEngine }) => {
      const e = createEngine();
      e.on('done', (d) => waiting.get(d.id)?.ok(d));
      e.on('failed', (f) => waiting.get(f.id)?.no(f.reason));
      return e;
    });
    engine.catch(() => (engine = undefined)); // offline: let the next attempt re-import
    return engine;
  }
  return {
    /** HEIC becomes a JPG (a photo: a PNG would be many times larger); WebP becomes a PNG (lossless, keeps transparency). */
    async convert(id: string, file: File, type: 'heic' | 'webp'): Promise<Done> {
      const e = await get().catch(() => Promise.reject(new ImageFail('codec-load')));
      return new Promise<Done>((ok, no) => {
        waiting.set(id, { ok, no: (reason) => no(new ImageFail(reason)) });
        e.enqueue({ id, file, tool: type === 'heic' ? 'heic-to-jpg' : 'webp-to-jpg', options: type === 'heic' ? {} : { format: 'png' } });
      }).finally(() => waiting.delete(id));
    },
    /** Start over with a fresh worker (a failed import can stay cached in the old one). */
    restart: () => void engine?.then((e) => e.restart(), () => {}),
  };
}

/** A JPEG whose EXIF says "rotated": the browser draws it upright, so a PDF viewer (which ignores EXIF) shows it right. */
async function reencodeUpright(file: File): Promise<Prepared> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new ImageFail('corrupt');
  }
  try {
    if (bitmap.width * bitmap.height > MAX_REENCODE_PIXELS) throw new ImageFail('too-large');
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
    const blob = await canvas.convertToBlob({ type: MIME.jpg, quality: 0.92 });
    return { bytes: await blob.arrayBuffer(), kind: 'jpg', width: bitmap.width, height: bitmap.height };
  } finally {
    bitmap.close();
  }
}

function mountFromImages(el: HTMLElement): void {
  const shell = createShell<PdfEngine>(el, loadPdfEngine);
  const { q, drop, input, list, runBtn, job, say, report, hideAlert, showDone, runJob } = shell;
  const ul = q('[data-rows]');
  const converter = createImageConverter();
  let rows: Row[] = [];
  let nextId = 0;

  /** JPEG and PNG go in as they are; WebP and HEIC are decoded by the image engine first. */
  async function prepare(row: Row): Promise<Prepared> {
    const { file } = row;
    let sniffed;
    try {
      sniffed = await (await import('../engine/sniff')).sniff(file);
    } catch {
      throw new ImageFail('corrupt');
    }
    const { type, width, height } = sniffed;
    if (type === 'unknown') throw new ImageFail('wrong-type');
    if (type === 'webp' || type === 'heic') {
      const d = await converter.convert(row.id, file, type);
      return { bytes: await d.blob.arrayBuffer(), kind: type === 'heic' ? 'jpg' : 'png', width: d.width, height: d.height };
    }
    if (type === 'png' && width && height) return { bytes: await file.arrayBuffer(), kind: 'png', width, height };
    if (type === 'jpg' && width && height) {
      const bytes = await file.arrayBuffer();
      const { jpegOrientation } = await import('../engine/orientation');
      if (jpegOrientation(new Uint8Array(bytes)) === 1) return { bytes, kind: 'jpg', width, height };
    }
    if (type === 'jpg') return reencodeUpright(file);
    throw new ImageFail('corrupt'); // a PNG with no readable header
  }

  function load(row: Row): void {
    row.state = { kind: 'reading' };
    const gen = shell.generation;
    prepare(row).then(
      (image) => settle(row, gen, { kind: 'ready', image }),
      (err) => settle(row, gen, { kind: 'failed', reason: err instanceof ImageFail ? err.reason : 'corrupt' }),
    );
  }
  function settle(row: Row, gen: number, state: State): void {
    if (gen !== shell.generation || !rows.includes(row)) return; // removed, or Start over, meanwhile
    row.state = state;
    if (state.kind === 'failed') {
      if (state.reason === 'codec-load') report('codec-load', retryLoads);
      else {
        failed(ANALYTICS[state.reason]); // a fact about this one file: reported per file
        say(`${row.file.name}: ${ROW_COPY[state.reason]}`, false);
      }
    }
    render();
  }
  function retryLoads(): void {
    converter.restart();
    for (const row of rows) if (row.state.kind === 'failed' && row.state.reason === 'codec-load') load(row);
    render();
  }

  function add(files: File[]): void {
    for (const file of files) {
      const row: Row = { id: `i${nextId++}`, file, state: { kind: 'reading' }, li: h('li', { class: 'row' }) };
      rows.push(row);
      load(row);
    }
    render();
  }
  function clear(): void {
    rows = [];
    ul.replaceChildren();
  }
  shell.wire(add, clear);

  function renderRow(row: Row, i: number): void {
    const s = row.state;
    const meta =
      s.kind === 'reading'
        ? h('span', { class: 'size' }, 'Reading…')
        : s.kind === 'ready'
          ? h('span', { class: 'size' }, `${s.image.width} × ${s.image.height} px`)
          : s.reason === 'codec-load'
            ? h('span', { class: 'size' })
            : h('span', { class: 'error' }, ROW_COPY[s.reason]);
    row.li.className = `row row-${s.kind}`;
    row.li.replaceChildren(
      h('div', { class: 'info' }, h('span', { class: 'name', title: row.file.name }, middleTruncate(row.file.name, NAME_MAX)), meta),
      rowTools(i, rows.length, {
        up: () => moveRow(rows, row, -1, render),
        down: () => moveRow(rows, row, 1, render),
        remove: () => {
          if (!rows.some((r) => r !== row && r.state.kind === 'failed' && r.state.reason === 'codec-load')) hideAlert();
          removeRow(rows, row, render, input);
        },
      }),
    );
  }
  function render(): void {
    rows.forEach(renderRow);
    ul.replaceChildren(...rows.map((r) => r.li));
    list.hidden = rows.length === 0;
    drop.classList.toggle('drop-compact', rows.length > 0);
    runBtn.disabled = rows.length < 1 || !rows.every((r) => r.state.kind === 'ready');
  }

  function run(): Promise<void> {
    const ready = rows.flatMap((r) => (r.state.kind === 'ready' ? [r.state.image] : []));
    const size = el.querySelector<HTMLInputElement>('input[name=size]:checked')!.value as PageSize;
    return runJob(
      ready.length === 1 ? 'Creating PDF…' : `Creating PDF from ${ready.length} images…`,
      async (gen) => {
        // The worker takes the buffers: send copies, so a retry still has the originals.
        const images: ImageIn[] = ready.map((i) => ({ ...i, bytes: i.bytes.slice(0) }));
        const out: PdfOut = await job((e) => e.images(images, size));
        if (gen !== shell.generation) return;
        if (!out.pages) throw new Unusable();
        const meta = `${pages(out.pages)} · ${formatBytes(out.bytes.byteLength)}`;
        showDone(new Blob([out.bytes as BlobPart], { type: 'application/pdf' }), out.name, 'Download', out.name, meta, `${out.name} ready, ${meta}`);
        succeeded(1);
      },
      () => void run(),
    );
  }
  runBtn.addEventListener('click', () => void run());
}
