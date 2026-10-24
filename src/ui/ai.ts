import { detect, type Caps } from '../ai/capability';
import type { AiProgress } from '../ai/client';
import { CONSENT_BYTES, MODELS, megabytes, modelUrl, type ModelKey } from '../ai/config';
import { AiError, reasonOf, type AiFail } from '../ai/errors';
import { evictModel, isCached } from '../ai/loader';

// The shared states of an on-device AI tool (spec §4), for one file at a time:
// empty → (consent, for a large model not yet cached) → downloading → working → result, or an error.
// Each tool supplies an AiToolDef: what it checks, how it runs, and how it shows its result. Text from files only
// ever goes into the page as text.

export interface AiRunContext {
  /** Aborted by Cancel (or by a new file). Pass it to loadModel / engine.run. */
  signal: AbortSignal;
  /** The model this run uses (from `modelKey`), if any. */
  modelKey?: ModelKey;
}

export interface AiToolDef<Res> {
  /** "Removing background": shown as "Removing background… 42%". */
  verb: string;
  /** The model the tool downloads, which decides the consent screen. A function picks by device (e.g. a small model on phones). */
  modelKey?: ModelKey | ((caps: Caps) => ModelKey);
  /** Wrong-type copy: "This is a HEIC, not a <inputName>." */
  inputName?: string;
  /** Where to send a file of a type this tool can't take: { heic: { href: '/heic-to-jpg/', h1: 'HEIC to JPG' } }. */
  elsewhere?: Record<string, { href: string; h1: string }>;
  /** Copy for this tool's own failures (too-long, too-large, unsupported…), over the shared defaults. */
  messages?: Partial<Record<AiFail, string>>;
  /** Cheap checks before any download (type, length, size). Throw an AiError to stop. */
  check?(file: File, caps: Caps): Promise<void>;
  /** Do the work. Report download and work progress; reject with an AiError. */
  run(file: File, caps: Caps, onProgress: (p: AiProgress) => void, ctx: AiRunContext): Promise<Res>;
  /** Show the result in `root`. May return a cleanup (revoke object URLs) run on Start over or a new file. */
  renderResult(res: Res, root: HTMLElement): void | (() => void);
}

export interface AiHooks {
  /** `cb(count)` after each success; count is the number of files done (always 1 here). */
  onSuccess(cb: (count: number) => void): void;
  /** `cb(reason)` for each failure the user sees, including Cancel. */
  onError(cb: (reason: AiFail) => void): void;
}

const COPY: Record<AiFail, string> = {
  network: "Couldn't download the AI model. Check your connection.",
  device: 'This tool needs more memory than this device has.',
  corrupt: "We couldn't read this file. It may be damaged or incomplete.",
  encrypted: 'This file is password-protected. Remove the password and try again.',
  // Fallbacks only: each tool words its own limits (AiToolDef.messages).
  unsupported: "This file isn't supported yet.",
  'too-large': 'This file is too large for this tool.',
  'too-long': 'This file is too long for this tool.',
  'wrong-type': "This file type isn't supported.",
  cancelled: '',
};
const TYPE_NAMES: Record<string, string> = { heic: 'HEIC', jpg: 'JPG', png: 'PNG', webp: 'WebP', pdf: 'PDF', gif: 'GIF' };
const CELLULAR = 'You seem to be on mobile data.';

/** A failure that isn't an AiError is a bug or an unexpected browser error: shown as a damaged file, but logged. */
function logUnexpected(err: unknown): void {
  if (!(err instanceof AiError)) console.error('ai: unexpected failure', err);
}

function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, string> = {}, ...kids: (Node | string)[]) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) el.setAttribute(k, v);
  el.append(...kids);
  return el;
}

export function mountAi<Res>(el: HTMLElement, def: AiToolDef<Res>): AiHooks {
  const successListeners: ((count: number) => void)[] = [];
  const errorListeners: ((reason: AiFail) => void)[] = [];
  const succeeded = () => successListeners.forEach((cb) => cb(1));
  const failed = (reason: AiFail) => errorListeners.forEach((cb) => cb(reason));

  const drop = el.querySelector<HTMLElement>('.drop')!;
  const input = el.querySelector<HTMLInputElement>('input[type=file]')!;
  const status = el.querySelector<HTMLElement>('[data-status]')!;
  const results = el.querySelector<HTMLElement>('[data-results]')!;

  // --- one panel for consent / downloading / working, one alert for failures, one result area ---
  const panelText = h('p');
  const cellularNote = h('p', { class: 'note' }, CELLULAR);
  const bar = h('progress');
  const panelBtn = h('button', { type: 'button', class: 'btn' });
  const panel = h('div', { class: 'ai-panel', 'data-ai-panel': '' }, panelText, cellularNote, bar, panelBtn);
  const alertText = h('p', { class: 'error' });
  const alertLink = h('a', { class: 'link' });
  const retryBtn = h('button', { type: 'button', class: 'btn' }, 'Try again');
  const alert = h('div', { class: 'ai-alert', role: 'alert', 'data-ai-alert': '' }, alertText, alertLink, retryBtn);
  const resultRoot = h('div', { 'data-ai-result': '' });
  const resetBtn = h('button', { type: 'button', class: 'btn btn-quiet' }, 'Start over');
  const done = h('div', { class: 'ai-done' }, resultRoot, h('div', { class: 'actions' }, resetBtn));
  panel.hidden = alert.hidden = done.hidden = true;
  drop.after(panel, alert);
  results.append(done);

  let gen = 0; // bumped by every new file, Cancel and Start over: late answers from before are dropped
  let controller: AbortController | null = null;
  let running = false;
  let cleanup: (() => void) | void;
  let onPanelBtn: () => void = () => {};
  let onRetry: (() => void) | null = null;
  let capsPromise: Promise<Caps> | undefined;
  const caps = () => (capsPromise ??= detect());

  /** Announce to screen readers only; what's on screen says the same. */
  function say(text: string): void {
    status.textContent = text;
    status.classList.add('visually-hidden');
  }

  /** Show one of: the drop zone (empty, or a file error under it), the panel, the result, or an alert on its own. */
  function view(which: 'drop' | 'panel' | 'done' | 'alert'): void {
    drop.hidden = which !== 'drop';
    panel.hidden = which !== 'panel';
    done.hidden = which !== 'done';
    alert.hidden = which !== 'alert';
  }
  function clearResult(): void {
    if (typeof cleanup === 'function') cleanup();
    cleanup = undefined;
    resultRoot.replaceChildren();
  }
  function abortRun(): void {
    controller?.abort();
    controller = null;
    running = false;
  }

  function showPanel(text: string, button: { label: string; action: () => void } | null, progress?: { value: number; max: number }) {
    panelText.textContent = text;
    cellularNote.hidden = true;
    bar.hidden = !progress;
    if (progress) {
      bar.max = progress.max;
      bar.value = progress.value;
      bar.setAttribute('aria-label', text.split('…')[0]!);
    }
    panelBtn.hidden = !button;
    if (button) {
      panelBtn.textContent = button.label;
      onPanelBtn = button.action;
    }
    view('panel');
  }
  panelBtn.addEventListener('click', () => onPanelBtn());

  function showConsent(file: File, key: ModelKey, c: Caps, focus = false): void {
    const text = `This tool downloads a ${megabytes(MODELS[key].bytes)} AI model the first time. It's cached for next time.`;
    showPanel(text, { label: 'Download and start', action: () => void start(file, c, key, true) });
    cellularNote.hidden = !c.cellular;
    say(c.cellular ? `${text} ${CELLULAR}` : text);
    if (focus) panelBtn.focus();
  }
  function showDownloading(done: number, total: number, cancel: () => void): void {
    const text = `Downloading the AI model… ${Math.floor(done / 1e6)} of ${megabytes(total)}, one time only`;
    showPanel(text, { label: 'Cancel', action: cancel }, { value: done, max: total });
  }
  function showWorking(pct: number): void {
    showPanel(`${def.verb}… ${pct}%`, null, { value: pct, max: 100 });
  }

  function fail(reason: AiFail, detectedType?: string, retry?: () => void): void {
    failed(reason);
    let text = def.messages?.[reason] ?? COPY[reason];
    alertLink.hidden = true;
    if (reason === 'wrong-type' && def.inputName) {
      const shown = detectedType && (TYPE_NAMES[detectedType] ?? detectedType.toUpperCase());
      text = shown ? `This is a ${shown}, not a ${def.inputName}.` : `This isn't a ${def.inputName}.`;
      const target = detectedType ? def.elsewhere?.[detectedType] : undefined;
      if (target) {
        alertLink.href = target.href;
        alertLink.textContent = `Try ${target.h1} →`;
        alertLink.hidden = false;
      }
    }
    alertText.textContent = text;
    onRetry = retry ?? null;
    retryBtn.hidden = !retry;
    // A download that failed keeps its file: Try again is the one thing to do. A bad file needs another file.
    if (retry) {
      view('alert');
      retryBtn.focus();
    } else {
      view('drop');
      alert.hidden = false;
    }
    say('');
  }
  retryBtn.addEventListener('click', () => {
    const r = onRetry;
    alert.hidden = true;
    r?.();
  });

  const keyFor = (c: Caps): ModelKey | undefined => (typeof def.modelKey === 'function' ? def.modelKey(c) : def.modelKey);
  const needsConsent = async (key: ModelKey | undefined) =>
    !!key && MODELS[key].bytes > CONSENT_BYTES && !(await isCached(modelUrl(key)));

  /** A file was chosen or dropped: check it, then ask for consent or start. */
  async function take(file: File): Promise<void> {
    abortRun();
    const g = ++gen;
    clearResult();
    alert.hidden = true;
    try {
      if (file.size === 0) throw new AiError('corrupt');
      const c = await caps();
      await def.check?.(file, c);
      const key = keyFor(c);
      const consent = await needsConsent(key);
      if (g !== gen) return;
      if (consent) showConsent(file, key!, c, true);
      else await start(file, c, key, false);
    } catch (err) {
      if (g !== gen) return;
      logUnexpected(err);
      fail(reasonOf(err), err instanceof AiError ? err.detectedType : undefined);
    }
  }

  /** Download (if needed) and run. `consented`: the user saw the consent screen, so Cancel goes back to it. */
  async function start(file: File, c: Caps, key: ModelKey | undefined, consented: boolean): Promise<void> {
    abortRun();
    const g = ++gen;
    const ctrl = new AbortController();
    controller = ctrl;
    running = true;
    const total = key ? MODELS[key].bytes : 0;
    const cancel = () => {
      if (g !== gen) return;
      abortRun();
      gen++;
      failed('cancelled');
      if (consented && key) showConsent(file, key, c, true);
      else {
        view('drop');
        say('');
        input.focus();
      }
    };
    const downloading = !!key && !(await isCached(modelUrl(key)));
    if (g !== gen) return;
    if (downloading) {
      showDownloading(0, total, cancel);
      say('Downloading the AI model');
    } else {
      showWorking(0);
      say(`${def.verb}…`);
    }
    if (consented) panelBtn.focus(); // the consent button became Cancel: keep focus on it

    const onProgress = (p: AiProgress) => {
      if (g !== gen) return;
      if (p.stage === 'download') {
        // A cached model reports one (n, n): only a real download in progress shows the download state.
        if (p.done < p.total) showDownloading(p.done, p.total, cancel);
      } else {
        const pct = p.total > 0 ? Math.min(100, Math.floor((p.done / p.total) * 100)) : 0;
        if (panelText.textContent?.startsWith(def.verb)) {
          panelText.textContent = `${def.verb}… ${pct}%`;
          bar.value = pct;
        } else {
          showWorking(pct);
          say(`${def.verb}…`);
        }
      }
    };

    try {
      const res = await def.run(file, c, onProgress, { signal: ctrl.signal, ...(key ? { modelKey: key } : {}) });
      if (g !== gen) return;
      running = false;
      controller = null;
      cleanup = def.renderResult(res, resultRoot);
      view('done');
      say('Done');
      succeeded();
    } catch (err) {
      if (g !== gen) return; // cancelled from the button, or replaced by a new file
      running = false;
      controller = null;
      logUnexpected(err);
      if (err instanceof AiError && err.badModel) {
        // The model's bytes didn't parse: drop the cached copy and treat it as a failed download, so Try again
        // fetches it afresh.
        if (key) await evictModel(modelUrl(key));
        if (g !== gen) return;
        return fail('network', undefined, () => void start(file, c, key, consented));
      }
      const reason = reasonOf(err);
      if (reason === 'cancelled') return cancel();
      fail(reason, err instanceof AiError ? err.detectedType : undefined, reason === 'network' ? () => void start(file, c, key, consented) : undefined);
    }
  }

  resetBtn.addEventListener('click', () => {
    abortRun();
    gen++;
    clearResult();
    view('drop');
    say('');
    input.focus();
  });

  // --- files: the picker, or a drop anywhere on the page (ignored while a run is going) ---
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    input.value = ''; // choosing the same file again must fire `change` again
    if (file) void take(file);
  });
  const hasFiles = (e: DragEvent) => [...(e.dataTransfer?.types ?? [])].includes('Files');
  let depth = 0;
  document.addEventListener('dragenter', (e) => {
    if (!hasFiles(e)) return;
    depth++;
    drop.classList.add('is-over');
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
    const file = e.dataTransfer?.files[0];
    if (file && !running) void take(file);
  });

  return {
    onSuccess: (cb) => void successListeners.push(cb),
    onError: (cb) => void errorListeners.push(cb),
  };
}
