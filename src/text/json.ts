export type JsonResult =
  | { ok: true; output: string }
  | { ok: false; line: number; column: number; message: string };

type Indent = 2 | 4 | '\t';

interface ScanError {
  offset: number;
  message: string;
}

// Our own scanner, so error text and positions do not depend on the engine's
// JSON.parse wording (V8, JavaScriptCore and SpiderMonkey all differ). It only
// runs after JSON.parse has already rejected the input.
function scan(text: string): ScanError | null {
  let i = 0;
  const n = text.length;

  const fail = (offset: number, message: string): ScanError => ({ offset, message });
  const unexpected = (at: number): ScanError => {
    if (at >= n) return fail(n, 'Unexpected end of input');
    if (text[at] === ',') return fail(at, 'Unexpected comma');
    return fail(at, `Unexpected character "${String.fromCodePoint(text.codePointAt(at)!)}"`);
  };
  const skipWs = () => {
    while (i < n && (text[i] === ' ' || text[i] === '\t' || text[i] === '\n' || text[i] === '\r')) i++;
  };
  const isDigit = (c: string | undefined) => c !== undefined && c >= '0' && c <= '9';

  function string(): ScanError | null {
    i++; // opening quote
    while (i < n) {
      const c = text[i];
      if (c === '"') {
        i++;
        return null;
      }
      if (c < ' ') return fail(i, 'Unescaped control character in string');
      if (c === '\\') {
        const e = text[i + 1];
        if (e === undefined) return fail(n, 'Unterminated string');
        if (e === 'u') {
          for (let k = 2; k <= 5; k++) {
            const h = text[i + k];
            if (h === undefined) return fail(n, 'Unterminated string');
            if (!/[0-9a-fA-F]/.test(h)) return fail(i + k, 'Invalid unicode escape');
          }
          i += 6;
        } else if ('"\\/bfnrt'.includes(e)) {
          i += 2;
        } else {
          return fail(i + 1, 'Invalid escape sequence');
        }
        continue;
      }
      i++;
    }
    return fail(n, 'Unterminated string');
  }

  function number(): ScanError | null {
    if (text[i] === '-') i++;
    if (text[i] === '0') i++;
    else if (isDigit(text[i])) while (isDigit(text[i])) i++;
    else return i >= n ? unexpected(i) : fail(i, 'Invalid number');
    if (text[i] === '.') {
      i++;
      if (!isDigit(text[i])) return i >= n ? unexpected(i) : fail(i, 'Invalid number');
      while (isDigit(text[i])) i++;
    }
    if (text[i] === 'e' || text[i] === 'E') {
      i++;
      if (text[i] === '+' || text[i] === '-') i++;
      if (!isDigit(text[i])) return i >= n ? unexpected(i) : fail(i, 'Invalid number');
      while (isDigit(text[i])) i++;
    }
    return null;
  }

  function literal(word: string): ScanError | null {
    for (const ch of word) {
      if (text[i] !== ch) return unexpected(i);
      i++;
    }
    return null;
  }

  function value(): ScanError | null {
    skipWs();
    if (i >= n) return unexpected(i);
    const c = text[i];
    if (c === '{') return object();
    if (c === '[') return array();
    if (c === '"') return string();
    if (c === '-' || isDigit(c)) return number();
    if (c === 't') return literal('true');
    if (c === 'f') return literal('false');
    if (c === 'n') return literal('null');
    return unexpected(i);
  }

  function object(): ScanError | null {
    i++;
    skipWs();
    if (text[i] === '}') {
      i++;
      return null;
    }
    for (;;) {
      skipWs();
      if (text[i] !== '"') return unexpected(i);
      let err = string();
      if (err) return err;
      skipWs();
      if (i >= n) return unexpected(i);
      if (text[i] !== ':') return fail(i, "Expected ':'");
      i++;
      err = value();
      if (err) return err;
      skipWs();
      if (i >= n) return unexpected(i);
      if (text[i] === '}') {
        i++;
        return null;
      }
      if (text[i] !== ',') return fail(i, "Expected ',' or '}'");
      i++;
      skipWs();
      if (text[i] === '}') return fail(i, "Trailing comma before '}'");
    }
  }

  function array(): ScanError | null {
    i++;
    skipWs();
    if (text[i] === ']') {
      i++;
      return null;
    }
    for (;;) {
      const err = value();
      if (err) return err;
      skipWs();
      if (i >= n) return unexpected(i);
      if (text[i] === ']') {
        i++;
        return null;
      }
      if (text[i] !== ',') return fail(i, "Expected ',' or ']'");
      i++;
      skipWs();
      if (text[i] === ']') return fail(i, "Trailing comma before ']'");
    }
  }

  try {
    const err = value();
    if (err) return err;
    skipWs();
    if (i < n) return fail(i, 'Unexpected content after end of JSON');
    return null;
  } catch {
    return null; // e.g. stack overflow on absurd nesting: caller falls back
  }
}

function locate(text: string, offset: number): { line: number; column: number } {
  let line = 1;
  let lineStart = 0;
  for (let k = 0; k < offset; k++) {
    if (text[k] === '\n') {
      line++;
      lineStart = k + 1;
    }
  }
  return { line, column: offset - lineStart + 1 };
}

function run(input: string, indent?: Indent): JsonResult {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  try {
    return { ok: true, output: JSON.stringify(JSON.parse(text), null, indent) };
  } catch {
    const err = scan(text) ?? { offset: 0, message: 'Invalid JSON' };
    return { ok: false, ...locate(text, err.offset), message: err.message };
  }
}

export function formatJson(input: string, indent: Indent): JsonResult {
  return run(input, indent);
}

export function minifyJson(input: string): JsonResult {
  return run(input);
}
