import type { PdfEngine } from '../pdf/client';
import { parseRanges } from '../pdf/ranges';
import type { PdfFail, PdfOut } from '../pdf/types';
import { formatBytes, middleTruncate } from './format';
import { track } from './track';

// Enhances the static markup from PdfTool.astro. The engine (worker + pdf-lib) is imported on drop-zone hover,
// focus or the first file, which keeps the page inside the 15 KB budget. File names only ever go in as text.

export type PdfErrorReason = PdfFail | 'range';

const successListeners: ((count: number) => void)[] = [];
const errorListeners: ((reason: PdfErrorReason) => void)[] = [];
/** `cb(count)` runs after each successful merge or split; `count` is the number of output files. */
export function onSuccess(cb: (count: number) => void): void {
  successListeners.push(cb);
}
/** `cb(reason)` runs for each failure the user sees. */
export function onError(cb: (reason: PdfErrorReason) => void): void {
  errorListeners.push(cb);
}
const succeeded = (count: number) => successListeners.forEach((cb) => cb(count));
const failed = (reason: PdfErrorReason) => errorListeners.forEach((cb) => cb(reason));

const COPY: Record<PdfFail, string> = {
  encrypted: 'This PDF is password-protected. Remove the password and try again.',
  corrupt: "We couldn't read this file. It may be damaged or not a PDF.",
  'codec-load': "Couldn't load the PDF tools. Check your connection.",
};
const NAME_MAX = 40;
const LOADING_DELAY_MS = 300; // a cached engine answers well inside this: don't flash the banner
const pages = (n: number) => `${n} ${n === 1 ? 'page' : 'pages'}`;
const reasonOf = (err: unknown): PdfFail => (err as { reason?: PdfFail } | null)?.reason ?? 'codec-load';

/** A job that "succeeded" with nothing usable in it (no pages). Shown as a file we couldn't read. */
class Unusable extends Error {
  readonly reason = 'corrupt' as const;
}

function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, string> = {}, ...kids: (Node | string)[]) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) el.setAttribute(k, v);
  el.append(...kids);
  return el;
}

export function mount(el: HTMLElement): void {
  const q = <T extends HTMLElement = HTMLElement>(sel: string) => el.querySelector<T>(sel)!;
  const isMerge = el.dataset.op === 'merge';
  const tool = el.dataset.tool!;
  // Registered before any interaction. Props are only {tool, count} or {tool, reason}.
  onSuccess((count) => track('convert_success', { tool, count }));
  onError((reason) => track('convert_error', { tool, reason }));
  const drop = q('.drop');
  const input = q<HTMLInputElement>('input[type=file]');
  const loading = q('[data-loading]');
  const alert = q('[data-alert]');
  const alertText = q('[data-alert-text]');
  const retryBtn = q<HTMLButtonElement>('[data-retry]');
  const status = q('[data-status]');
  const list = q('[data-list]');
  const runBtn = q<HTMLButtonElement>('[data-run]');
  const done = q('[data-done]');
  const doneName = q('[data-done-name]');
  const doneMeta = q('[data-done-meta]');
  const download = q<HTMLAnchorElement>('[data-download]');
  const resetBtn = q<HTMLButtonElement>('[data-reset]');

  // --- engine, loaded lazily; the banner shows only if work waits on it for more than LOADING_DELAY_MS ---
  let engine: Promise<PdfEngine> | undefined;
  let warmed: Promise<void> | undefined;
  let ready = false;
  let busy = 0;
  let loadingTimer: ReturnType<typeof setTimeout> | undefined;

  function getEngine(): Promise<PdfEngine> {
    engine ??= import('../pdf/client').then(({ createPdfEngine }) => createPdfEngine());
    engine.catch(() => (engine = undefined)); // offline: let the next attempt re-import
    return engine;
  }
  function warm(): Promise<void> {
    if (!warmed) {
      const w = getEngine().then((e) => e.warm());
      warmed = w;
      w.then(
        () => {
          ready = true;
          hideLoading();
        },
        () => {
          if (warmed === w) warmed = undefined; // the client has retired the worker: the next warm starts afresh
          hideLoading();
        },
      );
    }
    return warmed;
  }
  function hideLoading(): void {
    clearTimeout(loadingTimer);
    loading.hidden = true;
  }
  /** Run one engine job, with the loading banner while the engine is still on its way. */
  async function job<T>(fn: (e: PdfEngine) => Promise<T>): Promise<T> {
    busy++;
    if (!ready) {
      clearTimeout(loadingTimer);
      loadingTimer = setTimeout(() => (loading.hidden = ready || busy === 0), LOADING_DELAY_MS);
    }
    try {
      void warm().catch(() => {});
      return await fn(await getEngine());
    } finally {
      if (--busy === 0) hideLoading();
    }
  }

  const preload = () => void warm().catch(() => {});
  drop.addEventListener('pointerenter', preload);
  drop.addEventListener('focusin', preload);

  /** Put text in the status region. `visible: false` is for screen readers only, when the screen already shows it. */
  function say(text: string, visible: boolean): void {
    status.textContent = text;
    status.classList.toggle('visually-hidden', !visible);
  }

  // --- shared alert (codec-load with Try again, or a whole-job failure) ---
  let retry: (() => void) | null = null;
  let alertReason: PdfFail | null = null;
  /**
   * Show a failure in the alert and report it once. One outage fails every pending job as codec-load: while its
   * alert is up, later codec-load failures only refresh what Try again does.
   */
  function report(reason: PdfFail, onRetry: () => void): void {
    const repeat = reason === 'codec-load' && alertReason === 'codec-load';
    if (!repeat) failed(reason);
    alertText.textContent = COPY[reason];
    alertReason = reason;
    retry = reason === 'codec-load' ? onRetry : null;
    retryBtn.hidden = !retry;
    alert.hidden = false;
  }
  function hideAlert(): void {
    alert.hidden = true;
    alertReason = null;
    retry = null;
  }
  retryBtn.addEventListener('click', () => {
    const r = retry;
    hideAlert();
    r?.();
  });

  // --- done state ---
  let generation = 0; // bumped by Start over and by replacing the file: late results from before are dropped
  let doneUrl: string | undefined;
  function showDone(blob: Blob, fileName: string, label: string, name: string, meta: string, announce: string): void {
    if (doneUrl) URL.revokeObjectURL(doneUrl);
    doneUrl = URL.createObjectURL(blob);
    download.href = doneUrl;
    download.download = fileName;
    download.textContent = label;
    doneName.textContent = name;
    doneName.hidden = !name;
    doneMeta.textContent = meta;
    doneMeta.hidden = !meta;
    say(announce, false);
    list.hidden = true;
    drop.hidden = true;
    done.hidden = false;
  }
  /** Back to an empty tool. Revokes every object URL this page made. */
  function startOver(): void {
    generation++;
    if (doneUrl) URL.revokeObjectURL(doneUrl);
    doneUrl = undefined;
    download.removeAttribute('href');
    done.hidden = true;
    say('', true);
    hideAlert();
    clear();
    drop.hidden = false;
    drop.classList.remove('drop-compact');
    list.hidden = true;
    input.focus();
  }
  resetBtn.addEventListener('click', startOver);

  /** The job produced nothing usable (no pages): treat it as a file we couldn't read. */
  const empty = (outs: PdfOut[]) => !outs.length || outs.some((o) => o.pages === 0);
  const pdfBlob = (o: PdfOut) => new Blob([o.bytes as BlobPart], { type: 'application/pdf' });

  /** Run a merge or split: show `running`, hide the inputs, and on failure bring them back with the alert. */
  async function runJob(running: string, work: (gen: number) => Promise<void>, again: () => void): Promise<void> {
    const gen = generation;
    hideAlert();
    busyRunning = true;
    list.hidden = true;
    drop.hidden = true;
    say(running, true);
    try {
      await work(gen);
    } catch (err) {
      if (gen !== generation) return;
      say('', true);
      list.hidden = false;
      drop.hidden = false;
      report(reasonOf(err), again);
    } finally {
      busyRunning = false;
    }
  }

  // --- adding files: the picker, or a drop anywhere on the page ---
  let busyRunning = false; // a merge or split is running: drops are ignored until it is done
  const { add, clear } = isMerge ? mountMerge() : mountSplit();

  input.addEventListener('change', () => {
    const files = [...(input.files ?? [])];
    input.value = ''; // choosing the same file again must fire `change` again
    if (files.length) add(files);
  });
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
    const files = [...(e.dataTransfer?.files ?? [])];
    if (files.length && done.hidden && !busyRunning) add(files);
  });

  // ======================= Merge =======================
  function mountMerge() {
    type State = { kind: 'reading' } | { kind: 'counted'; pages: number } | { kind: 'failed'; reason: PdfFail };
    interface Row {
      id: string;
      file: File;
      state: State;
      li: HTMLLIElement;
    }
    const ul = q('[data-rows]');
    const hint = q('[data-hint]');
    let rows: Row[] = [];
    let nextId = 0;

    function count(row: Row): void {
      row.state = { kind: 'reading' };
      const gen = generation;
      job((e) => e.count(row.id, row.file)).then(
        (n) => settle(row, gen, n > 0 ? { kind: 'counted', pages: n } : { kind: 'failed', reason: 'corrupt' }),
        (err) => settle(row, gen, { kind: 'failed', reason: reasonOf(err) }),
      );
    }
    function settle(row: Row, gen: number, state: State): void {
      if (gen !== generation || !rows.includes(row)) return; // removed, or Start over, meanwhile
      row.state = state;
      if (state.kind === 'failed') {
        if (state.reason === 'codec-load') report('codec-load', retryCounts);
        else {
          failed(state.reason); // a fact about this one file: reported per file
          say(`${row.file.name}: ${COPY[state.reason]}`, false);
        }
      }
      render();
    }
    function retryCounts(): void {
      for (const row of rows) if (row.state.kind === 'failed' && row.state.reason === 'codec-load') count(row);
      render();
    }

    function add(files: File[]): void {
      for (const file of files) {
        const row: Row = { id: `m${nextId++}`, file, state: { kind: 'reading' }, li: h('li', { class: 'row' }) };
        rows.push(row);
        count(row);
      }
      render();
    }
    function clear(): void {
      rows = [];
      ul.replaceChildren();
    }

    function move(row: Row, by: -1 | 1): void {
      const i = rows.indexOf(row);
      rows.splice(i, 1);
      rows.splice(i + by, 0, row);
      render();
      // Keep focus on the moved row's same button, unless it just became disabled.
      const btn = row.li.querySelector<HTMLButtonElement>(by < 0 ? '[data-up]' : '[data-down]')!;
      (btn.disabled ? row.li.querySelector<HTMLButtonElement>(by < 0 ? '[data-down]' : '[data-up]')! : btn).focus();
    }
    function remove(row: Row): void {
      const i = rows.indexOf(row);
      rows.splice(i, 1);
      if (!rows.some((r) => r.state.kind === 'failed' && r.state.reason === 'codec-load')) hideAlert();
      render();
      const next = rows[Math.min(i, rows.length - 1)];
      (next ? next.li.querySelector<HTMLButtonElement>('[data-remove]')! : input).focus();
    }

    function tool(label: string, text: string, attr: string, disabled: boolean, onClick: () => void) {
      const b = h('button', { type: 'button', class: 'icon-btn', 'aria-label': label, [attr]: '' }, text);
      b.disabled = disabled;
      b.addEventListener('click', onClick);
      return b;
    }
    function renderRow(row: Row, i: number): void {
      const s = row.state;
      const meta =
        s.kind === 'reading'
          ? h('span', { class: 'size' }, 'Reading…')
          : s.kind === 'counted'
            ? h('span', { class: 'size' }, pages(s.pages))
            : s.reason === 'codec-load'
              ? h('span', { class: 'size' })
              : h('span', { class: 'error' }, COPY[s.reason]);
      row.li.className = `row row-${s.kind}`;
      row.li.replaceChildren(
        h('div', { class: 'info' }, h('span', { class: 'name', title: row.file.name }, middleTruncate(row.file.name, NAME_MAX)), meta),
        h(
          'div',
          { class: 'row-tools' },
          tool('Move up', '↑', 'data-up', i === 0, () => move(row, -1)),
          tool('Move down', '↓', 'data-down', i === rows.length - 1, () => move(row, 1)),
          tool('Remove', '✕', 'data-remove', false, () => remove(row)),
        ),
      );
    }
    function render(): void {
      rows.forEach(renderRow);
      ul.replaceChildren(...rows.map((r) => r.li));
      list.hidden = rows.length === 0;
      drop.classList.toggle('drop-compact', rows.length > 0);
      hint.hidden = rows.length !== 1;
      runBtn.disabled = rows.length < 2 || !rows.every((r) => r.state.kind === 'counted');
    }

    function run(): Promise<void> {
      const files = rows.map((r) => r.file);
      return runJob(
        `Merging ${files.length} files…`,
        async (gen) => {
          const out = await job((e) => e.merge(files));
          if (gen !== generation) return;
          if (empty([out])) throw new Unusable();
          const meta = `${pages(out.pages)} · ${formatBytes(out.bytes.byteLength)}`;
          showDone(pdfBlob(out), out.name, 'Download', out.name, meta, `${out.name} ready, ${meta}`);
          succeeded(1);
        },
        () => void run(),
      );
    }
    runBtn.addEventListener('click', () => void run());

    return { add, clear };
  }

  // ======================= Split =======================
  function mountSplit() {
    const nameEl = q('[data-name]');
    const metaEl = q('[data-meta]');
    const fileError = q('[data-file-error]');
    const options = [...el.querySelectorAll<HTMLElement>('[data-options]')];
    const modes = [...el.querySelectorAll<HTMLInputElement>('[data-mode]')];
    const rangesInput = q<HTMLInputElement>('[data-ranges]');
    const rangeError = q('[data-range-error]');
    let current: { file: File; pages?: number } | undefined;
    let nextId = 0;

    const extracting = () => modes.find((m) => m.checked)?.value === 'ranges';
    for (const m of modes)
      m.addEventListener('change', () => {
        rangesInput.disabled = !extracting();
        rangeError.hidden = true;
        if (extracting()) rangesInput.focus();
      });
    rangesInput.addEventListener('input', () => (rangeError.hidden = true));
    rangesInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') void run();
    });

    function count(): void {
      const target = current!;
      const gen = generation;
      metaEl.textContent = 'Reading…';
      runBtn.disabled = true;
      job((e) => e.count(`s${nextId++}`, target.file)).then(
        (n) => {
          if (gen !== generation) return;
          if (n > 0) loaded(target, n);
          else fail('corrupt');
        },
        (err) => gen === generation && fail(reasonOf(err)),
      );
    }
    function loaded(target: { file: File; pages?: number }, n: number): void {
      target.pages = n;
      metaEl.textContent = pages(n);
      runBtn.disabled = false;
    }
    function fail(reason: PdfFail): void {
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
      generation++;
      hideAlert();
      current = { file: files[0]! };
      nameEl.textContent = middleTruncate(current.file.name, NAME_MAX);
      nameEl.title = current.file.name;
      fileError.hidden = true;
      rangeError.hidden = true;
      options.forEach((o) => (o.hidden = false));
      list.hidden = false;
      drop.classList.add('drop-compact');
      count();
    }
    function clear(): void {
      current = undefined;
      modes[0]!.checked = true;
      rangesInput.value = '';
      rangesInput.disabled = true;
      rangeError.hidden = true;
      fileError.hidden = true;
    }

    async function run(): Promise<void> {
      const target = current;
      if (!target?.pages || runBtn.disabled) return;
      let mode: Parameters<PdfEngine['split']>[1] = { kind: 'every' };
      if (extracting()) {
        const ranges = parseRanges(rangesInput.value, target.pages);
        if (ranges instanceof RangeError) {
          rangeError.textContent = `Pages must be between 1 and ${target.pages}, like 1-3, 5.`;
          rangeError.hidden = false;
          failed('range');
          rangesInput.focus();
          return;
        }
        mode = { kind: 'ranges', ranges };
      }
      await runJob(
        'Splitting…',
        async (gen) => {
          const outs = await job((e) => e.split(target.file, mode));
          if (gen !== generation) return;
          if (empty(outs)) throw new Unusable();
          if (outs.length > 1) {
            const { zipFiles } = await import('./zip');
            const zip = await zipFiles(outs.map((o) => ({ name: o.name, blob: pdfBlob(o) })));
            if (gen !== generation) return;
            const base = target.file.name.replace(/\.pdf$/i, '') || 'document';
            const zipName = `${base}-pages.zip`;
            showDone(zip, zipName, 'Download all (ZIP)', '', `${outs.length} files`, `${zipName} ready, ${outs.length} files`);
          } else {
            const o = outs[0]!;
            showDone(pdfBlob(o), o.name, 'Download', o.name, '', `${o.name} ready, ${pages(o.pages)}`);
          }
          succeeded(outs.length);
        },
        () => void run(),
      );
    }
    runBtn.addEventListener('click', () => void run());

    return { add, clear };
  }
}
