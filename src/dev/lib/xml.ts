// Re-indents XML without changing its content: tags, text, comments, CDATA and processing instructions are kept as
// written; only the whitespace between tags changes. An element holding only text stays on one line.

// Tags are read with quote awareness, so a > inside an attribute value does not end the tag.
const TOKEN = /<!\[CDATA\[[\s\S]*?\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!(?:[^>"'\[]|"[^"]*"|'[^']*'|\[[\s\S]*?\])*>|<\/?(?:[^>"']|"[^"]*"|'[^']*')+>|[^<]+/g;

export function formatXml(xml: string, indent: string): string {
  const tokens = xml.match(TOKEN) ?? [];
  const lines: string[] = [];
  let depth = 0;
  const pad = () => indent.repeat(Math.max(0, depth));
  const isOpen = (t: string) => /^<[^/!?]/.test(t) && !t.endsWith('/>');
  const isClose = (t: string) => t.startsWith('</');
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (!t.startsWith('<')) {
      if (t.trim()) lines.push(pad() + t.trim());
      continue;
    }
    const next = tokens[i + 1], after = tokens[i + 2];
    if (isOpen(t) && next !== undefined && !next.startsWith('<') && after !== undefined && isClose(after)) {
      lines.push(pad() + t + next + after); // a text-only element keeps its text exactly
      i += 2;
    } else if (isOpen(t) && next !== undefined && isClose(next)) {
      lines.push(pad() + t + next);
      i += 1;
    } else if (isClose(t)) {
      depth--;
      lines.push(pad() + t);
    } else {
      lines.push(pad() + t);
      if (isOpen(t)) depth++;
    }
  }
  return lines.join('\n');
}

/** The browser's XML parser's complaint about a document that is not well-formed, or undefined if it is fine. */
export function xmlError(xml: string): string | undefined {
  if (typeof DOMParser === 'undefined') return undefined;
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const err = doc.getElementsByTagName('parsererror')[0];
  if (!err) return undefined;
  const text = (err.textContent ?? '').replace(/\s+/g, ' ').trim();
  return text.replace(/^This page contains the following errors:\s*/i, '').replace(/\s*Below is a rendering of the page up to the first error\.?$/i, '');
}
