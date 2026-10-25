import { STARTERS, findTools, highlight, type SearchEntry } from '../search';

// One fetch per page view at most, shared by every box; the browser caches the file across pages.
let loading: Promise<SearchEntry[]> | undefined;
const loadIndex = (): Promise<SearchEntry[]> =>
  (loading ??= fetch('/search-index.json').then((r) => {
    if (!r.ok) throw new Error(String(r.status));
    return r.json() as Promise<SearchEntry[]>;
  }).catch((e) => {
    loading = undefined; // the next focus tries again
    throw e;
  }));

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};

/**
 * Wire one search box. Empty and focused, it offers a few starting points; typing shows the matching tools, each with
 * its icon, its name with the typed part marked, what it does and its zone. Arrow keys and Enter pick; Escape or a
 * click outside closes.
 */
export async function mount(form: HTMLFormElement): Promise<void> {
  if (form.dataset.ready || form.dataset.loading) return;
  const failed = form.querySelector<HTMLElement>('.search-failed')!;
  form.dataset.loading = '1';
  let all: SearchEntry[];
  try {
    all = await loadIndex();
  } catch {
    delete form.dataset.loading;
    const pop = form.querySelector<HTMLElement>('.search-pop')!;
    pop.hidden = false;
    failed.hidden = false;
    form.querySelector<HTMLElement>('.search-tip')!.hidden = true;
    // Close the message like the results would, and try again on the next focus.
    const close = (e: Event) => {
      if (e.type === 'keydown' && (e as KeyboardEvent).key !== 'Escape') return;
      const to = (e as FocusEvent).relatedTarget ?? (e.type === 'pointerdown' ? e.target : null);
      if (e.type !== 'keydown' && to && form.contains(to as Node)) return;
      pop.hidden = true;
      form.removeEventListener('focusout', close);
      form.removeEventListener('keydown', close);
      document.removeEventListener('pointerdown', close);
    };
    form.addEventListener('focusout', close);
    form.addEventListener('keydown', close);
    document.addEventListener('pointerdown', close);
    form.querySelector('input')!.addEventListener('focus', () => mount(form), { once: true });
    return;
  }
  failed.hidden = true;
  delete form.dataset.loading;
  form.dataset.ready = '1';
  const input = form.querySelector<HTMLInputElement>('input')!;
  const pop = form.querySelector<HTMLElement>('.search-pop')!;
  const head = form.querySelector<HTMLElement>('.search-head')!;
  const list = form.querySelector<HTMLUListElement>('.search-list')!;
  const none = form.querySelector<HTMLElement>('.search-none')!;
  const keys = form.querySelector<HTMLElement>('.search-keys')!;
  const tip = form.querySelector<HTMLElement>('.search-tip')!;
  const here = location.pathname.replace(/^\/|\/$/g, '');
  let results: SearchEntry[] = [];
  let active = -1;

  const open = (on: boolean) => {
    pop.hidden = !on;
    input.setAttribute('aria-expanded', String(on && results.length > 0));
  };
  const setActive = (i: number) => {
    active = i;
    list.querySelectorAll('[role="option"]').forEach((li, n) => li.setAttribute('aria-selected', String(n === i)));
    if (i >= 0) input.setAttribute('aria-activedescendant', `${list.id}-${i}`);
    else input.removeAttribute('aria-activedescendant');
  };
  const row = (r: SearchEntry, i: number, q: string) => {
    const li = el('li');
    li.id = `${list.id}-${i}`;
    li.setAttribute('role', 'option');
    li.dataset.zone = r.zone;
    const a = el('a');
    a.href = `/${r.slug}/`;
    a.tabIndex = -1;
    const tile = el('span', 'search-tile');
    tile.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${r.icon}</svg>`;
    const name = el('span', 'search-name');
    for (const p of highlight(r.name, q)) name.append(p.hit ? el('mark', undefined, p.text) : p.text);
    const text = el('span', 'search-text');
    text.append(name, el('span', 'search-blurb', r.blurb));
    a.append(tile, text, el('span', 'search-zone', r.label), el('span', 'search-enter', 'Enter ↵'));
    li.append(a);
    li.addEventListener('mousemove', () => { if (active !== i) setActive(i); });
    return li;
  };
  const render = () => {
    const q = input.value.trim();
    results = q ? findTools(q, all) : STARTERS.filter((s) => s !== here).slice(0, 3).map((s) => all.find((e) => e.slug === s)!);
    list.replaceChildren(...results.map((r, i) => row(r, i, q)));
    head.textContent = !q ? 'Try' : results.length ? `${results.length} ${results.length === 1 ? 'tool' : 'tools'}` : '';
    none.hidden = !q || results.length > 0;
    none.querySelector('[data-q]')!.textContent = q;
    keys.hidden = !q || !results.length;
    tip.hidden = Boolean(q);
    setActive(results.length ? 0 : -1);
    open(true);
  };
  const go = (i: number) => {
    const r = results[i];
    if (r) location.assign(`/${r.slug}/`);
  };

  input.addEventListener('input', render);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (pop.hidden) render();
      if (!results.length) return;
      e.preventDefault();
      setActive((active + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(active);
    } else if (e.key === 'Escape') {
      // First Escape closes the results and keeps what was typed (browsers would clear a search box); the next clears it.
      e.preventDefault();
      if (!pop.hidden) open(false);
      else input.value = '';
    }
  });
  input.addEventListener('focus', render);
  document.addEventListener('pointerdown', (e) => { if (!form.contains(e.target as Node)) open(false); });
  form.addEventListener('focusout', (e) => { if (!form.contains(e.relatedTarget as Node | null)) open(false); });
  if (document.activeElement === input) render(); // focused (and maybe typed in) before this loaded
}
