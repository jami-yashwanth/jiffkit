import type { AiProgress } from '../ai/client';
import { AiError, reasonOf, type AiFail } from '../ai/errors';
import { MAX_BYTES, UNDECODABLE, type Preset, type Resolution } from '../video/limits';
import { formatBytes, middleTruncate } from './format';

// Compress video (VideoTool.astro): empty → the file, read (its size, length and whether it can be decoded), with
// Quality and Max width → Compress → "Compressing… n%" with Cancel → "<in> → <out>" with Download MP4 and Start over,
// or an alert. The work runs in a worker (src/video/worker.ts) loaded with the first file. File names only ever go
// into the page as text.

export interface VideoHooks {
  /** `cb(count)` after each compressed video (count is always 1). */
  onSuccess(cb: (count: number) => void): void;
  /** `cb(reason)` for each failure the user sees, including Cancel. */
  onError(cb: (reason: AiFail) => void): void;
}

const NO_ENCODE = "Your browser can't encode video. Try Chrome, Edge, Safari 17+ or Firefox 130+.";
const LIMITS = 'Videos up to 2 minutes and 200 MB for now.';
const COPY: Record<AiFail, string> = {
  'too-long': LIMITS,
  'too-large': LIMITS,
  unsupported: "This video format isn't supported yet. Try an MP4 or MOV.",
  // No H.264 encoder for this video (or none at all): the browser can't do this.
  device: NO_ENCODE,
  corrupt: "We couldn't read this file. It may be damaged or incomplete.",
  network: "Couldn't load the video tools. Check your connection.",
  encrypted: "We couldn't read this file. It may be damaged or incomplete.",
  'wrong-type': "This file isn't a video.",
  cancelled: '',
};
/** The file reads fine, but this browser can't decode its picture (HEVC in Firefox, say): another browser can. */
const UNDECODABLE_COPY = "This browser can't play this video's format. Try Chrome, Edge or Safari.";
const SOUND_DROPPED = "This video's sound couldn't be kept.";
const NOT_SMALLER = 'This video was already well compressed.';
const TYPE_NAMES: Record<string, string> = { jpg: 'JPG', png: 'PNG', webp: 'WebP', heic: 'HEIC', pdf: 'PDF' };
const ELSEWHERE: Record<string, { href: string; h1: string }> = {
  jpg: { href: '/compress-image/', h1: 'Compress image' },
  png: { href: '/compress-image/', h1: 'Compress image' },
  webp: { href: '/compress-image/', h1: 'Compress image' },
  heic: { href: '/heic-to-jpg/', h1: 'HEIC to JPG' },
};
const NAME_MAX = 40;

const baseName = (name: string): string => name.replace(/\.[^./\\]*$/, '').trim() || 'video';
const clock = (s: number): string => {
  const t = Math.round(s);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};
/** WebCodecs, the browser's own video encoder and decoder: without them there is nothing this tool can do. */
const canEncode = (): boolean => typeof VideoEncoder !== 'undefined' && typeof VideoDecoder !== 'undefined';

export function mountCompress(el: HTMLElement): VideoHooks {
  const successListeners: ((count: number) => void)[] = [];
  const errorListeners: ((reason: AiFail) => void)[] = [];
  const failed = (reason: AiFail) => errorListeners.forEach((cb) => cb(reason));

  const q = <T extends HTMLElement = HTMLElement>(sel: string) => el.querySelector<T>(sel)!;
  const drop = q('.drop');
  const input = q<HTMLInputElement>('input[type=file]');
  const status = q('[data-status]');
  const alert = q('[data-video-alert]');
  const alertText = q('[data-alert-text]');
  const tryLink = q<HTMLAnchorElement>('[data-try]');
  const retryBtn = q<HTMLButtonElement>('[data-retry]');
  const fileBox = q('[data-video-file]');
  const nameEl = q('[data-name]');
  const metaEl = q('[data-meta]');
  const runBtn = q<HTMLButtonElement>('[data-run]');
  const panel = q('[data-video-panel]');
  const panelText = q('[data-panel-text]');
  const bar = panel.querySelector('progress')!;
  const cancelBtn = q<HTMLButtonElement>('[data-cancel]');
  const done = q('[data-video-done]');
  const sizes = q('[data-video-sizes]');
  const notes = q('[data-video-notes]');
  const downloadBtn = q<HTMLButtonElement>('[data-download]');
  const resetBtn = q<HTMLButtonElement>('[data-reset]');

  let gen = 0; // bumped by every new file, Cancel and Start over: late answers from before are dropped
  let current: File | null = null;
  let controller: AbortController | null = null;
  let running = false;
  let url: string | null = null;
  let outName = '';
  let onRetry: (() => void) | null = null;

  /** Announce to screen readers only; what's on screen says the same. */
  function say(text: string): void {
    status.textContent = text;
    status.classList.add('visually-hidden');
  }
  function show(parts: { drop?: boolean; file?: boolean; panel?: boolean; done?: boolean; alert?: boolean }): void {
    drop.hidden = !parts.drop;
    fileBox.hidden = !parts.file;
    panel.hidden = !parts.panel;
    done.hidden = !parts.done;
    alert.hidden = !parts.alert;
    drop.classList.toggle('drop-compact', !!parts.file);
  }
  function revoke(): void {
    if (url) URL.revokeObjectURL(url);
    url = null;
  }
  function abort(): void {
    controller?.abort();
    controller = null;
    running = false;
  }
  const loadClient = () => import('../video/client');

  /** Show a failure under the drop zone (another file is the way on), or on its own with Try again. */
  function fail(err: unknown, retry?: () => void): void {
    if (!(err instanceof AiError)) console.error('video: unexpected failure', err);
    const reason = reasonOf(err);
    failed(reason);
    const type = err instanceof AiError ? err.detectedType : undefined;
    let text = reason === 'unsupported' && type === UNDECODABLE ? UNDECODABLE_COPY : COPY[reason];
    tryLink.hidden = true;
    if (reason === 'wrong-type' && type && TYPE_NAMES[type]) {
      text = `This is a ${TYPE_NAMES[type]}, not a video.`;
      const target = ELSEWHERE[type];
      if (target) {
        tryLink.href = target.href;
        tryLink.textContent = `Try ${target.h1} →`;
        tryLink.hidden = false;
      }
    }
    alertText.textContent = text;
    onRetry = retry ?? null;
    retryBtn.hidden = !retry;
    if (retry) {
      show({ alert: true });
      retryBtn.focus();
    } else show({ drop: true, alert: true });
    say('');
  }
  retryBtn.addEventListener('click', () => onRetry?.());

  // --- a file: read it, then offer Compress ---
  async function take(file: File): Promise<void> {
    abort();
    revoke();
    const g = ++gen;
    current = null;
    if (file.size > MAX_BYTES) return fail(new AiError('too-large')); // before reading any of it
    if (file.size === 0) return fail(new AiError('corrupt'));
    nameEl.textContent = middleTruncate(file.name, NAME_MAX);
    nameEl.title = file.name;
    metaEl.textContent = 'Reading…';
    runBtn.disabled = true;
    show({ drop: true, file: true });
    say('Reading the video…');
    const ctrl = new AbortController();
    controller = ctrl;
    try {
      const { probeVideo } = await loadClient().catch(() => Promise.reject(new AiError('network')));
      const info = await probeVideo(file, ctrl.signal);
      if (g !== gen) return;
      controller = null;
      current = file;
      metaEl.textContent = `${info.width} × ${info.height} · ${clock(info.durationS)} · ${formatBytes(file.size)}`;
      runBtn.disabled = false;
      say(`${file.name}, ${metaEl.textContent}`);
    } catch (err) {
      if (g !== gen) return;
      controller = null;
      fail(err, reasonOf(err) === 'network' ? () => void take(file) : undefined);
    }
  }

  // --- Compress ---
  const checked = (name: string) => el.querySelector<HTMLInputElement>(`input[name=${name}]:checked`)!.value;

  async function run(): Promise<void> {
    const file = current;
    if (!file || running) return;
    const preset = checked('preset') as Preset;
    const resolution = (Number(checked('resolution')) || null) as Resolution;
    revoke();
    const g = ++gen;
    const ctrl = new AbortController();
    controller = ctrl;
    running = true;
    panelText.textContent = 'Compressing… 0%';
    bar.value = 0;
    show({ panel: true });
    cancelBtn.focus();
    say('Compressing…');
    const onProgress = (p: AiProgress) => {
      if (g !== gen) return;
      const pct = p.total > 0 ? Math.min(100, Math.floor((p.done / p.total) * 100)) : 0;
      panelText.textContent = `Compressing… ${pct}%`;
      bar.value = pct;
    };
    try {
      const { compressVideo } = await loadClient().catch(() => Promise.reject(new AiError('network')));
      const out = await compressVideo(file, { preset, resolution }, onProgress, ctrl.signal);
      if (g !== gen) return;
      running = false;
      controller = null;
      url = URL.createObjectURL(out.blob);
      outName = `${baseName(file.name)}-compressed.mp4`;
      sizes.textContent = `${formatBytes(out.inBytes)} → ${formatBytes(out.outBytes)}`;
      const lines = [out.outBytes >= out.inBytes ? NOT_SMALLER : '', out.soundDropped ? SOUND_DROPPED : ''].filter(Boolean);
      notes.textContent = lines.join(' ');
      notes.hidden = !lines.length;
      show({ done: true });
      downloadBtn.focus();
      say(`Done. ${sizes.textContent}`);
      successListeners.forEach((cb) => cb(1));
    } catch (err) {
      if (g !== gen) return;
      running = false;
      controller = null;
      if (reasonOf(err) === 'cancelled') return cancelled();
      fail(err, reasonOf(err) === 'network' ? () => void run() : undefined);
    }
  }
  runBtn.addEventListener('click', () => void run());

  /** Cancel: the worker is stopped; the file stays, ready to compress again. */
  function cancelled(): void {
    failed('cancelled');
    show({ drop: true, file: true });
    runBtn.disabled = false;
    runBtn.focus();
    say('Cancelled');
  }
  cancelBtn.addEventListener('click', () => {
    if (!running) return;
    gen++;
    abort(); // terminates the worker
    cancelled();
  });

  downloadBtn.addEventListener('click', () => {
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = outName;
    document.body.append(a);
    a.click();
    a.remove();
  });

  resetBtn.addEventListener('click', () => {
    abort();
    revoke();
    gen++;
    current = null;
    show({ drop: true });
    say('');
    input.focus();
  });

  // --- files: the picker, or a drop anywhere on the page (ignored while compressing) ---
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    input.value = ''; // choosing the same file again must fire `change` again
    if (file) void take(file);
  });
  const hasFiles = (e: DragEvent) => [...(e.dataTransfer?.types ?? [])].includes('Files');
  let depth = 0;
  document.addEventListener('dragenter', (e) => {
    if (!hasFiles(e) || drop.hidden) return;
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
    if (e.dataTransfer) e.dataTransfer.dropEffect = drop.hidden ? 'none' : 'copy';
  });
  document.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth = 0;
    drop.classList.remove('is-over');
    const file = e.dataTransfer?.files[0];
    if (file && !running && !drop.hidden) void take(file);
  });

  // No WebCodecs at all: say so at once, rather than after a file. Reported once listeners can be added (right after
  // this returns), like every other failure the user sees.
  if (!canEncode()) {
    alertText.textContent = NO_ENCODE;
    show({ alert: true });
    queueMicrotask(() => failed('device'));
  }
  el.dataset.ready = ''; // the island has taken over

  return {
    onSuccess: (cb) => void successListeners.push(cb),
    onError: (cb) => void errorListeners.push(cb),
  };
}
