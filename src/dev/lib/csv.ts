// CSV per RFC 4180: fields with the delimiter, a quote or a line break are quoted, and quotes inside are doubled.

export const delimiterOf = (d: string): string => (d === 'tab' ? '\t' : d);

export function csvField(v: string, delim: string): string {
  return v.includes(delim) || /["\r\n]/.test(v) || /^\s|\s$/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export const toCsv = (rows: string[][], delim: string): string => rows.map((r) => r.map((v) => csvField(v, delim)).join(delim)).join('\n');

/** The delimiter that occurs most often (outside quotes) on the first line: comma, semicolon or tab. */
export function guessDelimiter(text: string): string {
  const first = text.split(/\r?\n/, 1)[0].replace(/"[^"]*"/g, '');
  const count = (d: string) => first.split(d).length - 1;
  return [',', ';', '\t'].reduce((best, d) => (count(d) > count(best) ? d : best), ',');
}

/** Rows of fields, or the line where a quoted field opens and never closes. */
export function parseCsv(text: string, delim: string): { rows: string[][] } | { unclosedAt: number } {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let quoteLine = 0;
  let line = 1;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else {
        if (c === '\n') line++;
        field += c;
      }
    } else if (c === '"' && field === '') {
      quoted = true;
      quoteLine = line;
    } else if (c === delim) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      line++;
    } else field += c;
  }
  if (quoted) return { unclosedAt: quoteLine };
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return { rows };
}
