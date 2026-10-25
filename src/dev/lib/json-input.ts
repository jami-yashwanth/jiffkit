import { minifyJson } from '../../text/json';

/** Parse JSON, with the JSON formatter's own error wording and position when it is invalid. */
export function parseJson(text: string): { value: unknown } | { error: string } {
  const checked = minifyJson(text);
  if (!checked.ok) return { error: `Invalid JSON at line ${checked.line}, column ${checked.column}: ${checked.message}.` };
  return { value: JSON.parse(text) };
}
