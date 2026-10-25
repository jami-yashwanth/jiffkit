import { marked } from 'marked';
import type { Runner } from '../form';

export const toHtml = (md: string): string => marked.parse(md, { gfm: true, async: false });

// The HTML is shown as text and previewed in a sandbox="" iframe (src/ui/dev.ts): no script in it can run.
export const run: Runner = ({ text }) => {
  const s = String(text);
  if (!s.trim()) return {};
  const html = toHtml(s);
  return { out: { html, preview: { html } } };
};
