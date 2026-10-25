// The declarative form each developer tool is built from: DevTool.astro renders it as static markup, src/ui/dev.ts
// reads the fields back from the DOM and renders the tool module's result. Types only, so the page script never
// carries a tool's copy or form spec.

export type DevGroup = 'security' | 'encoding' | 'convert' | 'text' | 'code';

export const GROUP_LABEL: Record<DevGroup, string> = {
  security: 'Security',
  encoding: 'Encoding',
  convert: 'Convert',
  text: 'Text',
  code: 'Code',
};

export type Field = {
  id: string;
  label: string;
  type: 'textarea' | 'text' | 'number' | 'range' | 'select' | 'checkbox' | 'color';
  value?: string;
  checked?: boolean;
  placeholder?: string;
  rows?: number;
  /** A textarea of prose rather than code: the body font, not monospace. */
  prose?: boolean;
  options?: [value: string, label: string][];
  min?: number;
  max?: number;
  step?: number;
};

export type Output = {
  id: string;
  label: string;
  type: 'text' | 'table' | 'diff' | 'highlight' | 'preview';
  /** A Copy button on a text output, or one per row of a table. */
  copy?: boolean;
};

export type DevForm = {
  fields: Field[];
  outputs: Output[];
  /** live: on every change. load: once at load, then on every change and on the button. button: only on the button. */
  run: 'live' | 'load' | 'button';
  button?: string;
};

export type Values = Record<string, string | boolean>;

export type OutValue =
  | string
  | { rows: [label: string, value: string][] }
  | { lines: { op: '+' | '-' | ' '; text: string }[] }
  | { segments: { text: string; match?: boolean }[] }
  | { html: string };

export type Result = {
  out?: Record<string, OutValue>;
  /** Shown in the status line with the alert mark; outputs are cleared. */
  error?: string;
  /** Shown in the status line as plain information. */
  status?: string;
  /** Values to write back into fields (a colour picker kept in sync, "now" for a timestamp). */
  set?: Record<string, string>;
};

/** `changed` is the id of the field that changed, '$button' for the button, or undefined at load. */
export type Runner = (values: Values, changed?: string) => Result | Promise<Result>;
