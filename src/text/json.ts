export type JsonResult =
  | { ok: true; output: string }
  | { ok: false; line: number; column: number; message: string };

type Indent = 2 | 4 | '\t';

export const TOO_DEEP = 'Nested too deeply to format';

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

  // Iterative (explicit stack) so deeply nested input cannot overflow the call
  // stack and real errors keep their true position.
  function key(): ScanError | null {
    skipWs();
    if (text[i] !== '"') return unexpected(i);
    const err = string();
    if (err) return err;
    skipWs();
    if (i >= n) return unexpected(i);
    if (text[i] !== ':') return fail(i, "Expected ':'");
    i++;
    return null;
  }

  const stack: ('o' | 'a')[] = [];
  let expectValue = true;
  for (;;) {
    let err: ScanError | null;
    if (expectValue) {
      skipWs();
      if (i >= n) return unexpected(i);
      const c = text[i];
      if (c === '{') {
        i++;
        stack.push('o');
        skipWs();
        if (text[i] === '}') {
          i++;
          stack.pop();
          expectValue = false;
        } else if ((err = key())) return err;
        continue;
      }
      if (c === '[') {
        i++;
        stack.push('a');
        skipWs();
        if (text[i] === ']') {
          i++;
          stack.pop();
          expectValue = false;
        }
        continue;
      }
      if (c === '"') err = string();
      else if (c === '-' || isDigit(c)) err = number();
      else if (c === 't') err = literal('true');
      else if (c === 'f') err = literal('false');
      else if (c === 'n') err = literal('null');
      else err = unexpected(i);
      if (err) return err;
      expectValue = false;
      continue;
    }
    skipWs();
    if (stack.length === 0) return i < n ? fail(i, 'Unexpected content after end of JSON') : null;
    if (i >= n) return unexpected(i);
    const inObject = stack[stack.length - 1] === 'o';
    const close = inObject ? '}' : ']';
    if (text[i] === close) {
      i++;
      stack.pop();
    } else if (text[i] === ',') {
      i++;
      skipWs();
      if (text[i] === close) return fail(i, `Trailing comma before '${close}'`);
      if (inObject) {
        if ((err = key())) return err;
      }
      expectValue = true;
    } else {
      return fail(i, `Expected ',' or '${close}'`);
    }
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
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Valid JSON the engine still cannot parse can only be too deeply nested.
    const err = scan(text) ?? { offset: 0, message: TOO_DEEP };
    return { ok: false, ...locate(text, err.offset), message: err.message };
  }
  try {
    return { ok: true, output: JSON.stringify(parsed, null, indent) };
  } catch {
    return { ok: false, line: 1, column: 1, message: TOO_DEEP };
  }
}

export function formatJson(input: string, indent: Indent): JsonResult {
  return run(input, indent);
}

export function minifyJson(input: string): JsonResult {
  return run(input);
}
