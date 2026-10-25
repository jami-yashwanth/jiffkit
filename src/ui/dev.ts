import type { OutValue, Result, Runner, Values } from '../dev/form';
import { copyText } from './clipboard';
import { track } from './track';

// Brings any DevTool.astro form to life. The tool's module (and any library it needs) is a dynamic import, loaded on
// the first interaction, or at once for tools that run at load, so it never counts against the page's script budget.
// Output is written with textContent and DOM nodes only; the Markdown preview goes into a sandbox="" iframe.

const RUNNERS: Record<string, () => Promise<{ run: Runner }>> = {
  'hash-generator': () => import('../dev/run/hash-generator'),
  'password-generator': () => import('../dev/run/password-generator'),
  'uuid-generator': () => import('../dev/run/uuid-generator'),
  'bcrypt-generator': () => import('../dev/run/bcrypt-generator'),
  'hmac-generator': () => import('../dev/run/hmac-generator'),
  'url-encode-decode': () => import('../dev/run/url-encode-decode'),
  'html-entities': () => import('../dev/run/html-entities'),
  'unix-timestamp-converter': () => import('../dev/run/unix-timestamp-converter'),
  'number-base-converter': () => import('../dev/run/number-base-converter'),
  'yaml-to-json': () => import('../dev/run/yaml-to-json'),
  'json-to-yaml': () => import('../dev/run/json-to-yaml'),
  'json-to-csv': () => import('../dev/run/json-to-csv'),
  'csv-to-json': () => import('../dev/run/csv-to-json'),
  'color-converter': () => import('../dev/run/color-converter'),
  'case-converter': () => import('../dev/run/case-converter'),
  'word-counter': () => import('../dev/run/word-counter'),
  'text-diff': () => import('../dev/run/text-diff'),
  'lorem-ipsum-generator': () => import('../dev/run/lorem-ipsum-generator'),
  slugify: () => import('../dev/run/slugify'),
  'markdown-to-html': () => import('../dev/run/markdown-to-html'),
  'regex-tester': () => import('../dev/run/regex-tester'),
  'cron-expression-parser': () => import('../dev/run/cron-expression-parser'),
  'sql-formatter': () => import('../dev/run/sql-formatter'),
  'xml-formatter': () => import('../dev/run/xml-formatter'),
  'subnet-calculator': () => import('../dev/run/subnet-calculator'),
};

const LOAD_FAILED = 'Couldn’t load this tool. Check your connection, then try again.';
const WORKING_AFTER_MS = 200; // a run slower than this (bcrypt at a high cost) shows "Working…" until it finishes
const DEBOUNCE_MS = 150;
const DEBOUNCE_LARGE_MS = 400; // over 200,000 characters, wait for a longer pause in typing
const COPIED_MS = 1500;
// The preview may contact nothing: no remote images, fonts or anything else (an image link in the Markdown would
// otherwise tell its host you visited). Only inline styles and data: images load.
const PREVIEW_CSP = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">`;
const PREVIEW_STYLE =
  '<style>body{font:16px/1.55 system-ui,-apple-system,sans-serif;color:#141414;margin:16px;overflow-wrap:anywhere}' +
  'pre,code{font-family:ui-monospace,Menlo,monospace;font-size:.9em}pre{background:#f1f1ee;padding:12px;border-radius:6px;overflow:auto}' +
  'table{border-collapse:collapse}td,th{border:1px solid #d4d4ce;padding:4px 8px}img{max-width:100%}a{color:#141414}</style>';

type FieldEl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

/**
 * The preview's HTML without <meta>, <base> or <link>: a meta refresh is not governed by CSP and could send the preview
 * frame to another site, and a <base> could redirect its links. Parsed in an inert document; nothing renders or runs.
 */
function inert(html: string): string {
  const doc = new DOMParser().parseFromString(`<!doctype html><body>${html}`, 'text/html');
  doc.querySelectorAll('meta, base, link').forEach((el) => el.remove());
  return doc.body.innerHTML;
}

export function mount(root: HTMLElement): void {
  const slug = root.dataset.tool!;
  const mode = root.dataset.run as 'live' | 'load' | 'button';
  const fields = [...root.querySelectorAll<FieldEl>('[data-field]')];
  const status = root.querySelector<HTMLElement>('[data-status]')!;
  const sections = [...root.querySelectorAll<HTMLElement>('[data-out]')];
  const button = root.querySelector<HTMLButtonElement>('[data-run-button]');

  let runner: Promise<Runner> | undefined;
  // A failed download (offline, or a new deploy replaced the file) is not remembered: the next try fetches again.
  const load = () =>
    (runner ??= RUNNERS[slug]().then(
      (m) => m.run,
      () => {
        runner = undefined;
        throw new Error(LOAD_FAILED);
      },
    ));
  let seq = 0;
  let timer: number | undefined;
  let used = false;

  const values = (): Values =>
    Object.fromEntries(fields.map((f) => [f.dataset.field!, f instanceof HTMLInputElement && f.type === 'checkbox' ? f.checked : f.value]));

  const markUsed = () => {
    if (used) return;
    used = true;
    track('tool_used', { tool: slug });
  };

  async function go(changed?: string) {
    const mine = ++seq;
    const working = window.setTimeout(() => {
      if (mine !== seq) return;
      status.textContent = 'Working…';
      status.classList.remove('is-error');
    }, WORKING_AFTER_MS);
    let result: Result;
    try {
      result = await (await load())(values(), changed);
    } catch (e) {
      result = { error: e instanceof Error ? e.message : String(e) };
    }
    clearTimeout(working);
    if (mine === seq) render(result); // a slower, older run never overwrites a newer one
  }

  function render(result: Result) {
    for (const [id, v] of Object.entries(result.set ?? {})) {
      const f = fields.find((x) => x.dataset.field === id);
      if (f) f.value = v;
    }
    status.textContent = result.error ?? result.status ?? '';
    status.classList.toggle('is-error', !!result.error);
    for (const s of sections) fill(s, result.error ? undefined : result.out?.[s.dataset.out!]);
  }

  function fill(section: HTMLElement, v: OutValue | undefined) {
    const target = section.querySelector<HTMLElement>('[data-target]')!;
    const empty = v === undefined || v === '' || (typeof v === 'object' && Object.values(v)[0]?.length === 0);
    section.hidden = empty;
    if (target instanceof HTMLIFrameElement) {
      target.srcdoc = empty || typeof v !== 'object' || !('html' in v) ? '' : `<!doctype html><meta charset="utf-8">${PREVIEW_CSP}${PREVIEW_STYLE}${inert(v.html)}`;
      return;
    }
    target.replaceChildren();
    if (empty) return;
    if (typeof v === 'string') target.textContent = v;
    else if ('rows' in v) target.append(...v.rows.map(([label, value]) => row(label, value, section.querySelector('[data-copy-rows]') !== null)));
    else if ('lines' in v)
      target.append(
        ...v.lines.map(({ op, text }) => {
          const line = document.createElement('span');
          line.className = op === '+' ? 'diff-add' : op === '-' ? 'diff-del' : 'diff-same';
          line.textContent = `${op} ${text}\n`;
          return line;
        }),
      );
    else if ('segments' in v)
      target.append(
        ...v.segments.map(({ text, match }) => {
          if (!match) return document.createTextNode(text);
          const mark = document.createElement('mark');
          mark.textContent = text;
          return mark;
        }),
      );
  }

  function row(label: string, value: string, copyable: boolean) {
    const tr = document.createElement('tr');
    const th = document.createElement('th');
    th.scope = 'row';
    th.textContent = label;
    const td = document.createElement('td');
    td.textContent = value;
    tr.append(th, td);
    if (copyable) {
      const cell = document.createElement('td');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-quiet btn-small';
      btn.textContent = 'Copy';
      btn.setAttribute('aria-label', `Copy ${label}`);
      wireCopy(btn, () => value, () => getSelection()?.selectAllChildren(td));
      cell.append(btn);
      tr.append(cell);
    }
    return tr;
  }

  /** Copy, then "Copied" beside the button for 1.5 s; if copying is refused, select the text instead. */
  function wireCopy(btn: HTMLButtonElement, text: () => string, fallback: () => void) {
    const note = document.createElement('span');
    note.className = 'copied';
    note.setAttribute('aria-live', 'polite');
    btn.after(note);
    let t: number | undefined;
    btn.addEventListener('click', async () => {
      if (!(await copyText(text()))) return fallback();
      note.textContent = 'Copied';
      clearTimeout(t);
      t = window.setTimeout(() => (note.textContent = ''), COPIED_MS);
      markUsed();
    });
  }

  for (const s of sections) {
    const btn = s.querySelector<HTMLButtonElement>('[data-copy]');
    const target = s.querySelector<HTMLElement>('[data-target]')!;
    if (btn) wireCopy(btn, () => target.textContent ?? '', () => getSelection()?.selectAllChildren(target));
  }

  for (const f of fields) {
    const id = f.dataset.field!;
    const out = root.querySelector<HTMLOutputElement>(`[data-range-out="${id}"]`);
    const onChange = () => {
      if (out) out.value = f.value;
      if (mode === 'button') return;
      clearTimeout(timer);
      const large = fields.some((x) => x.value.length > 200_000);
      timer = window.setTimeout(() => go(id), large ? DEBOUNCE_LARGE_MS : DEBOUNCE_MS);
    };
    f.addEventListener('input', onChange);
    if (f instanceof HTMLSelectElement || (f instanceof HTMLInputElement && f.type === 'checkbox')) f.addEventListener('change', onChange);
    // Fetch the tool's code while the user starts typing. A failure here is quiet: the run itself retries and reports.
    f.addEventListener('focus', () => load().catch(() => {}), { once: true });
    if (mode === 'button' && f instanceof HTMLInputElement && f.type === 'text')
      f.addEventListener('keydown', (e) => e.key === 'Enter' && button?.click());
  }
  button?.addEventListener('click', () => {
    clearTimeout(timer);
    void go('$button');
  });

  // Tools that start with content (a generated password, the current time, an example) run once at load. Others
  // with a prefilled value (the colour, cron and subnet examples) also show their result straight away.
  if (mode === 'load' || (mode === 'live' && fields.some((f) => f.type !== 'checkbox' && f.tagName !== 'SELECT' && f.value))) void go();
}
