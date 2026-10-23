import type { EngineClient } from '../engine/client';
import { sniff } from '../engine/sniff';
import { DOWNSCALE_MEGAPIXELS, type Done, type Failed, type Job, type Progress } from '../engine/types';
import type { InType, OutFormat, ToolSlug } from '../tools';
import { formatBytes, middleTruncate, uniqueNames } from './format';

// The engine (and with it the worker and codecs) is imported only on hover, focus or drop, which keeps the
// page's up-front JavaScript inside the 15 KB budget.

type State =
  | { kind: 'queued' }
  | { kind: 'done'; done: Done; url: string }
  | { kind: 'failed'; failed: Failed };

interface Row {
  id: string;
  file: File;
  type?: InType;
  options: Job['options'];
  state: State;
  li: HTMLLIElement;
}

const TYPE_NAMES: Record<string, string> = { heic: 'HEIC', jpg: 'JPG', png: 'PNG', webp: 'WebP' };
const NAME_MAX = 28;
const LOADING_DELAY_MS = 150; // codecs already cached report loading-codec too; don't flash the banner for them

/** Tiny DOM builder. Text always goes in as text nodes, so file names can never inject markup. */
function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<Record<string, string>> = {},
  ...kids: (Node | string | null | false)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) if (v !== undefined) el.setAttribute(k, v);
  for (const kid of kids) if (kid) el.append(kid);
  return el;
}

export function mount(el: HTMLElement): void {
  const q = <T extends Element>(sel: string): T => el.querySelector<T>(sel)!;
  const tool = el.dataset.tool as ToolSlug;
  const types = (el.dataset.types ?? '').split(' ') as InType[];
  const inputName = el.dataset.inputName ?? '';
  const noun = el.dataset.noun ?? 'image';
  const elsewhere = JSON.parse(el.dataset.elsewhere ?? '{}') as Record<string, { href: string; h1: string }>;

  const drop = q<HTMLElement>('.drop');
  const input = q<HTMLInputElement>('input[type=file]');
  const results = q<HTMLElement>('[data-results]');
  const status = q<HTMLElement>('[data-status]');
  const loading = q<HTMLElement>('[data-loading]');
  const actions = q<HTMLElement>('[data-actions]');
  const zipBtn = q<HTMLButtonElement>('[data-zip]');
  const moreBtn = q<HTMLButtonElement>('[data-more]');
  const gps = q<HTMLElement>('[data-gps]');
  const list = q<HTMLUListElement>('[data-rows]');

  // --- settings (read when a file is enqueued, so a change applies to files added after it) ---
  const qualityInput = el.querySelector<HTMLInputElement>('[data-quality-input]');
  const qualityField = el.querySelector<HTMLElement>('[data-quality-field]');
  const pngNote = el.querySelector<HTMLElement>('[data-png-note]');
  qualityInput?.addEventListener('input', () => {
    qualityInput.parentElement!.querySelector('output')!.textContent = qualityInput.value;
  });
  const options = (): Job['options'] => {
    const o: Job['options'] = {};
    if (qualityInput) o.quality = Number(qualityInput.value);
    else if (el.dataset.quality) o.quality = Number(el.dataset.quality);
    const fmt = el.querySelector<HTMLInputElement>('[data-format-input]:checked')?.value ?? el.dataset.format;
    if (fmt && fmt !== 'same') o.format = fmt as OutFormat;
    return o;
  };

  // --- engine, loaded lazily ---
  let engine: Promise<EngineClient> | undefined;
  const rows = new Map<string, Row>();
  let nextId = 0;
  let zipUrl: string | undefined;

  function getEngine(): Promise<EngineClient> {
    engine ??= import('../engine/client').then(({ createEngine }) => {
      const e = createEngine();
      e.on('progress', onProgress);
      e.on('done', onDone);
      e.on('failed', onFailed);
      return e;
    });
    engine.catch(() => (engine = undefined)); // offline: let the next attempt re-import
    return engine;
  }

  function enqueue(row: Row): void {
    row.state = { kind: 'queued' };
    render(row);
    getEngine().then(
      (e) => e.enqueue({ id: row.id, file: row.file, tool, options: row.options }),
      () => onFailed({ id: row.id, reason: 'codec-load' }),
    );
  }

  let preloaded = false;
  const preload = () => {
    if (preloaded) return;
    preloaded = true;
    getEngine().then(
      (e) => e.preload(types),
      () => (preloaded = false),
    );
  };
  drop.addEventListener('pointerenter', preload);
  drop.addEventListener('focusin', preload);

  // --- loading banner ---
  let loadingTimer: ReturnType<typeof setTimeout> | undefined;
  function setLoading(on: boolean): void {
    clearTimeout(loadingTimer);
    if (on) loadingTimer = setTimeout(() => (loading.hidden = false), LOADING_DELAY_MS);
    else loading.hidden = true;
  }
  function onProgress(p: Progress): void {
    setLoading(p.stage === 'loading-codec');
  }

  function onDone(d: Done): void {
    const row = rows.get(d.id);
    setLoading(false);
    if (!row) return; // cleared by "Convert more" while it ran
    row.state = { kind: 'done', done: d, url: URL.createObjectURL(d.blob) };
    render(row);
  }
  function onFailed(f: Failed): void {
    const row = rows.get(f.id);
    setLoading(false);
    if (!row) return;
    row.state = { kind: 'failed', failed: f };
    render(row);
  }

  // --- adding files ---
  async function add(files: File[]): Promise<void> {
    if (!files.length) return;
    const fresh = files.map((file) => {
      const row: Row = { id: `f${nextId++}`, file, options: options(), state: { kind: 'queued' }, li: h('li', { class: 'row' }) };
      rows.set(row.id, row);
      list.append(row.li);
      render(row);
      return row;
    });
    // Sniff on the main thread so a wrong file never reaches the worker. Enqueue in drop order.
    for (const row of fresh) {
      let type: InType | 'unknown';
      try {
        type = row.file.size === 0 ? 'unknown' : (await sniff(row.file)).type;
      } catch {
        type = 'unknown';
      }
      if (!rows.has(row.id)) continue; // cleared meanwhile
      if (row.file.size === 0) {
        onFailed({ id: row.id, reason: 'corrupt' });
      } else if (type === 'unknown' || !types.includes(type)) {
        onFailed({ id: row.id, reason: 'wrong-type', ...(type === 'unknown' ? {} : { detectedType: type }) });
      } else {
        row.type = type;
        enqueue(row);
      }
    }
    update();
  }

  input.addEventListener('change', () => {
    const files = [...(input.files ?? [])];
    input.value = ''; // choosing the same file again must fire `change` again
    void add(files);
  });

  // Drops are accepted anywhere on the page, so more files can join a running batch after the drop zone hides.
  const hasFiles = (e: DragEvent) => [...(e.dataTransfer?.types ?? [])].includes('Files');
  let depth = 0;
  document.addEventListener('dragenter', (e) => {
    if (!hasFiles(e)) return;
    depth++;
    drop.classList.add('is-over');
    preload();
  });
  document.addEventListener('dragleave', () => {
    if (--depth <= 0) {
      depth = 0;
      drop.classList.remove('is-over');
    }
  });
  document.addEventListener('dragover', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  });
  document.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth = 0;
    drop.classList.remove('is-over');
    void add([...(e.dataTransfer?.files ?? [])]);
  });

  // --- header actions ---
  moreBtn.addEventListener('click', () => {
    for (const row of rows.values()) if (row.state.kind === 'done') URL.revokeObjectURL(row.state.url);
    if (zipUrl) URL.revokeObjectURL(zipUrl);
    zipUrl = undefined;
    rows.clear();
    list.replaceChildren();
    update();
    input.focus();
  });

  zipBtn.addEventListener('click', async () => {
    const done = [...rows.values()].flatMap((r) => (r.state.kind === 'done' ? [r.state.done] : []));
    zipBtn.disabled = true;
    try {
      const { zipFiles } = await import('./zip');
      const names = uniqueNames(done.map((d) => d.name));
      const zip = await zipFiles(done.map((d, i) => ({ name: names[i]!, blob: d.blob })));
      if (zipUrl) URL.revokeObjectURL(zipUrl);
      zipUrl = URL.createObjectURL(zip);
      h('a', { href: zipUrl, download: `${noun}s.zip` }).click();
    } finally {
      zipBtn.disabled = false;
    }
  });

  // --- rendering ---
  function update(): void {
    const all = [...rows.values()];
    const done = all.filter((r) => r.state.kind === 'done');
    const finished = all.filter((r) => r.state.kind !== 'queued').length;
    const running = finished < all.length;

    results.hidden = all.length === 0;
    drop.hidden = all.length > 0;
    status.textContent = running ? `Converting ${finished + 1} of ${all.length}` : '';
    status.hidden = !running;
    if (!running) setLoading(false);
    actions.hidden = running || all.length === 0;
    zipBtn.hidden = done.length < 2;
    gps.hidden = !done.length || !done.every((r) => r.state.kind === 'done' && r.state.done.notes.includes('gps-removed'));

    // Compress: PNG has no quality setting. Show the lossless note when the batch is all PNG.
    if (qualityField && pngNote) {
      const typed = all.filter((r) => r.type);
      const allPng = typed.length > 0 && typed.every((r) => r.type === 'png');
      qualityField.hidden = allPng;
      pngNote.hidden = !allPng;
    }
  }

  function render(row: Row): void {
    const s = row.state;
    const name = (n: string) => h('span', { class: 'name', title: n }, middleTruncate(n, NAME_MAX));
    let body: Node[];
    if (s.kind === 'queued') {
      body = [
        h('span', { class: 'thumb' }),
        h('div', { class: 'info' }, name(row.file.name)),
        h('span', { class: 'spinner', role: 'img', 'aria-label': 'Converting' }),
      ];
    } else if (s.kind === 'done') {
      const d = s.done;
      const note = d.notes.includes('already-optimized')
        ? "Already optimized. We couldn't make it smaller."
        : d.notes.includes('first-frame-only')
          ? 'Animated WebP: converted the first frame.'
          : '';
      body = [
        h('img', { class: 'thumb', src: s.url, alt: '', width: '48', height: '48', decoding: 'async', loading: 'lazy' }),
        h(
          'div',
          { class: 'info' },
          name(d.name),
          h('span', { class: 'size' }, `${formatBytes(d.inBytes)} → ${formatBytes(d.outBytes)}`),
          note && h('span', { class: 'note' }, note),
        ),
        h('a', { class: 'btn', href: s.url, download: d.name }, 'Download'),
      ];
    } else {
      const [message, action] = failure(row, s.failed);
      body = [
        h('span', { class: 'thumb thumb-failed' }),
        h('div', { class: 'info' }, name(row.file.name), h('span', { class: 'error' }, message)),
        ...(action ? [action] : []),
      ];
    }
    row.li.className = `row row-${s.kind}`;
    row.li.replaceChildren(...body);
    update();
  }

  function failure(row: Row, f: Failed): [string, HTMLElement | null] {
    switch (f.reason) {
      case 'wrong-type': {
        const shown = f.detectedType && TYPE_NAMES[f.detectedType];
        const target = f.detectedType ? elsewhere[f.detectedType] : undefined;
        return [
          shown ? `This is a ${shown}, not a ${inputName}.` : `This isn't a ${inputName}.`,
          target ? h('a', { class: 'link', href: target.href }, `Try ${target.h1} →`) : null,
        ];
      }
      case 'corrupt':
        return ["We couldn't read this file. It may be damaged or incomplete.", null];
      case 'too-large':
        return [
          `This ${noun} is too large for your device to convert (${f.megapixels ?? '?'} MP).`,
          button(`Resize to ${DOWNSCALE_MEGAPIXELS} MP and convert`, () => {
            row.options = { ...row.options, downscaleTo: DOWNSCALE_MEGAPIXELS };
            enqueue(row);
          }),
        ];
      case 'codec-load':
        return [
          "Couldn't load the converter. Check your connection.",
          button('Try again', () => {
            // A failed import can stay cached in the worker's module graph, so start a fresh worker.
            const retry = [...rows.values()].filter((r) => r.state.kind === 'failed' && r.state.failed.reason === 'codec-load');
            void engine?.then((e) => e.restart(), () => {});
            retry.forEach(enqueue);
          }),
        ];
      case 'oom':
        return ['Ran out of memory', button('Retry', () => enqueue(row))];
    }
  }

  function button(label: string, onClick: () => void): HTMLButtonElement {
    const b = h('button', { type: 'button', class: 'btn btn-quiet' }, label);
    b.addEventListener('click', onClick);
    return b;
  }
}
