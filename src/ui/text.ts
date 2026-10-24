import { copyText } from './clipboard';
import { formatJson, minifyJson, TOO_DEEP } from '../text/json';
import { decodeBase64, encodeBase64 } from '../text/base64';
import { decodeJwt } from '../text/jwt';
import { track } from './track';

// Enhances the static markup from TextTool.astro. User text only ever goes in via textContent/value.

const LARGE = 5 * 1024 * 1024;
const LARGE_MSG = 'Large file: formatting may take a moment.';
const DEBOUNCE_MS = 150;
const COPIED_MS = 1500;

const usedListeners: (() => void)[] = [];
let used = false;

/** `cb` runs once per page view, on the first successful Copy. */
export function onUsed(cb: () => void): void {
  usedListeners.push(cb);
}

const $ = <T extends HTMLElement = HTMLElement>(root: HTMLElement, sel: string) => root.querySelector<T>(sel)!;

/** One shared timer, so typing in one box then the other never lets a stale update land last. */
function debouncer() {
  let timer: number | undefined;
  return {
    later: (fn: () => void) => {
      clearTimeout(timer);
      timer = window.setTimeout(fn, DEBOUNCE_MS);
    },
    cancel: () => clearTimeout(timer),
  };
}

/** Copy `source`'s text; "Copied" shows beside the button for 1.5 s. If copying is refused, select the text instead. */
function wireCopy(btn: HTMLButtonElement, source: HTMLElement) {
  const note = document.createElement('span');
  note.className = 'copied';
  note.setAttribute('aria-live', 'polite');
  btn.after(note);
  let timer: number | undefined;
  btn.addEventListener('click', async () => {
    const isBox = source instanceof HTMLTextAreaElement;
    if (!(await copyText(isBox ? source.value : (source.textContent ?? '')))) {
      if (isBox) source.select();
      else getSelection()?.selectAllChildren(source);
      return;
    }
    note.textContent = 'Copied';
    clearTimeout(timer);
    timer = window.setTimeout(() => (note.textContent = ''), COPIED_MS);
    if (!used) {
      used = true;
      for (const cb of usedListeners) cb();
    }
  });
}

function json(root: HTMLElement) {
  const input = $<HTMLTextAreaElement>(root, '[data-input]');
  const out = $(root, '[data-results]');
  const status = $(root, '[data-status]');
  const [format, minify, copy] = ['format', 'minify', 'copy'].map((a) => $<HTMLButtonElement>(root, `[data-action="${a}"]`));
  // Decorative: the status line carries the error for assistive tech.
  const excerpt = document.createElement('pre');
  excerpt.className = 'error-excerpt';
  excerpt.setAttribute('aria-hidden', 'true');
  excerpt.hidden = true;
  input.after(excerpt);

  let last: 'format' | 'minify' | null = null;
  const indent = () => {
    const v = root.querySelector<HTMLInputElement>('[data-indent]:checked')?.value;
    return v === 'tab' ? '\t' : v === '4' ? 4 : 2;
  };
  const largeNote = () => (input.value.length > LARGE ? LARGE_MSG : '');

  const showError = (line: number, column: number) => {
    const text = (input.value.split('\n')[line - 1] ?? '').replace(/\r$/, '').replace(/\t/g, ' ');
    const start = Math.max(0, column - 41); // long (minified) lines: a window around the column
    const clipped = start > 0;
    const shown = (clipped ? '…' : '') + text.slice(start, start + 80) + (text.length > start + 80 ? '…' : '');
    const gutter = String(line);
    const row = document.createElement('span');
    row.className = 'error-line';
    row.textContent = `${gutter} | ${shown}`;
    const caret = document.createElement('span');
    caret.textContent = `${' '.repeat(gutter.length)} | ${' '.repeat(column - 1 - start + (clipped ? 1 : 0))}^`;
    excerpt.replaceChildren(row, caret);
    excerpt.hidden = false;
  };

  const run = (kind: 'format' | 'minify') => {
    last = kind;
    const r = kind === 'format' ? formatJson(input.value, indent()) : minifyJson(input.value);
    excerpt.hidden = true;
    if (r.ok) {
      out.textContent = r.output;
      status.textContent = largeNote();
      input.removeAttribute('aria-invalid');
    } else {
      out.textContent = '';
      status.textContent = `Invalid JSON at line ${r.line}, column ${r.column}: ${r.message}.`;
      input.setAttribute('aria-invalid', 'true');
      if (r.message !== TOO_DEEP) showError(r.line, r.column);
    }
    copy.disabled = !r.ok;
  };

  input.addEventListener('input', () => {
    const empty = !/\S/.test(input.value);
    format.disabled = minify.disabled = empty;
    // Any edit makes the old result stale: clear it so Copy can never copy it.
    out.textContent = '';
    copy.disabled = true;
    last = null;
    input.removeAttribute('aria-invalid');
    excerpt.hidden = true;
    status.textContent = largeNote();
  });
  format.addEventListener('click', () => run('format'));
  minify.addEventListener('click', () => run('minify'));
  for (const radio of root.querySelectorAll<HTMLInputElement>('[data-indent]')) {
    radio.addEventListener('change', () => {
      if (last === 'format' && out.textContent) run('format');
    });
  }
  wireCopy(copy, out);
  // Browsers can restore a typed value on reload: run the input path so Format and Minify match the box.
  if (input.value) input.dispatchEvent(new Event('input'));
}

function base64(root: HTMLElement) {
  const text = $<HTMLTextAreaElement>(root, '[data-text]');
  const b64 = $<HTMLTextAreaElement>(root, '[data-base64]');
  const urlSafe = $<HTMLInputElement>(root, '[data-urlsafe]');
  const status = $(root, '[data-status]');
  const timer = debouncer();
  const opts = () => ({ urlSafe: urlSafe.checked });
  const copies = [...root.querySelectorAll<HTMLButtonElement>('[data-copy]')];
  const boxFor = (btn: HTMLButtonElement) => (btn.dataset.copy === 'text' ? text : b64);
  const syncCopies = () => {
    for (const c of copies) c.disabled = boxFor(c).value === '';
  };
  let lastEdited: 'text' | 'base64' = 'text';

  const encode = () => {
    b64.value = encodeBase64(text.value, opts());
    b64.removeAttribute('aria-invalid');
    status.textContent = '';
    syncCopies();
  };
  const decode = () => {
    const r = decodeBase64(b64.value, opts());
    if (r.ok) {
      text.value = r.text;
      b64.removeAttribute('aria-invalid');
      status.textContent = '';
      syncCopies();
      return;
    }
    // The Text box keeps its last good value.
    b64.setAttribute('aria-invalid', 'true');
    status.textContent = r.reason === 'invalid' ? "This isn't valid Base64." : "This is valid Base64, but it isn't text.";
  };

  text.addEventListener('input', () => {
    lastEdited = 'text';
    syncCopies();
    timer.later(encode);
  });
  b64.addEventListener('input', () => {
    lastEdited = 'base64';
    syncCopies();
    timer.later(decode);
  });
  // Re-read whichever box the user edited last under the new alphabet; never overwrite what they typed.
  urlSafe.addEventListener('change', () => {
    timer.cancel();
    if (lastEdited === 'base64') decode();
    else encode();
  });
  copies.forEach((btn) => wireCopy(btn, boxFor(btn)));
  syncCopies(); // a restored form value must enable Copy
}

const DATE_PARTS = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
/** "24 Oct 2026, 14:03" in local time. Built from parts: WebKit's ICU joins date and time with " at ". */
const formatDate = (d: Date) => {
  const p: Record<string, string> = {};
  for (const { type, value } of DATE_PARTS.formatToParts(d)) p[type] = value;
  return `${p.day} ${p.month} ${p.year}, ${p.hour}:${p.minute}`;
};

function jwt(root: HTMLElement) {
  const input = $<HTMLTextAreaElement>(root, '[data-input]');
  const status = $(root, '[data-status]');
  const header = $(root, '[data-header]');
  const payload = $(root, '[data-payload]');
  const copies = [...root.querySelectorAll<HTMLButtonElement>('[data-copy]')];
  const claims = document.createElement('ul');
  claims.className = 'claims';
  $(root, '[data-results]').prepend(claims);
  const timer = debouncer();

  const line = (text: string, expired = false) => {
    const li = document.createElement('li');
    li.textContent = text;
    if (expired) li.className = 'claim-expired';
    return li;
  };

  const render = () => {
    const token = input.value.trim();
    const r = token ? decodeJwt(token, new Date()) : null;
    const ok = r?.ok === true;
    header.textContent = ok ? JSON.stringify(r.header, null, 2) : '';
    payload.textContent = ok ? JSON.stringify(r.payload, null, 2) : '';
    for (const c of copies) c.disabled = !ok;
    status.textContent = r && !ok ? "This doesn't look like a JWT. A JWT has three parts separated by dots." : '';
    if (r && !ok) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
    const items: HTMLLIElement[] = [];
    if (ok) {
      const { exp, iat, nbf } = r.claims;
      if (exp) items.push(exp.expired ? line(`Expired ${exp.relative}`, true) : line(`Expires ${formatDate(exp.date)} (${exp.relative})`));
      if (iat) items.push(line(`Issued ${formatDate(iat.date)} (${iat.relative})`));
      if (nbf) items.push(line(`Not valid before ${formatDate(nbf.date)} (${nbf.relative})`));
    }
    claims.replaceChildren(...items);
  };

  input.addEventListener('input', () => timer.later(render));
  copies.forEach((btn) => wireCopy(btn, btn.dataset.copy === 'header' ? header : payload));
  if (input.value) render(); // a value restored on reload is decoded straight away
}

export function mount(el: HTMLElement): void {
  const tool = el.dataset.tool!;
  onUsed(() => track('tool_used', { tool })); // registered before any Copy, so the one-time event can't be missed
  const t = el.dataset.transform;
  if (t === 'json') json(el);
  else if (t === 'base64') base64(el);
  else if (t === 'jwt') jwt(el);
}
