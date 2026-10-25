import type { DevForm, DevGroup } from './form';
import type { ToolSlug } from '../tools';

// The 25 developer tools (spec: docs/superpowers/specs/2026-10-25-developer-tools-design.md). Written from scratch:
// no code or copy from it-tools (GPL-3.0). Each entry joins TOOLS in src/tools.ts as kind 'dev', so every registry
// rule (title, description, FAQ, how-to, related) applies to it.

export type DevSlug =
  | 'hash-generator'
  | 'password-generator'
  | 'uuid-generator'
  | 'bcrypt-generator'
  | 'hmac-generator'
  | 'url-encode-decode'
  | 'html-entities'
  | 'unix-timestamp-converter'
  | 'number-base-converter'
  | 'yaml-to-json'
  | 'json-to-yaml'
  | 'json-to-csv'
  | 'csv-to-json'
  | 'color-converter'
  | 'case-converter'
  | 'word-counter'
  | 'text-diff'
  | 'lorem-ipsum-generator'
  | 'slugify'
  | 'markdown-to-html'
  | 'regex-tester'
  | 'cron-expression-parser'
  | 'sql-formatter'
  | 'xml-formatter'
  | 'subnet-calculator';

export type DevEntry = {
  slug: DevSlug;
  group: DevGroup;
  title: string;
  description: string;
  h1: string;
  subhead: string;
  howTo: [string, string, string];
  faq: { q: string; a: string }[];
  related: ToolSlug[];
  form: DevForm;
};

const indent: [string, string][] = [['2', '2 spaces'], ['4', '4 spaces'], ['tab', 'Tab']];
const delimiters: [string, string][] = [[',', 'Comma'], [';', 'Semicolon'], ['tab', 'Tab']];
const LOCAL = 'Nothing you type is sent anywhere: it runs in this tab.';

export const DEV_TOOLS: DevEntry[] = [
  // --- Security ---
  {
    slug: 'hash-generator',
    group: 'security',
    title: 'Hash Generator - MD5, SHA-1, SHA-256, SHA-512 Online',
    description:
      'Get the MD5, SHA-1, SHA-256, SHA-384 and SHA-512 hash of any text, right in your browser. Nothing you type is uploaded. Free, no sign-up.',
    h1: 'Hash generator',
    subhead: 'MD5, SHA-1 and SHA-2 hashes of any text. Your text stays in this tab.',
    howTo: ['Type or paste your text.', 'Every hash updates as you type.', 'Copy the one you need.'],
    faq: [
      { q: 'Is my text sent to a server?', a: `No. The hashes are computed in your browser. ${LOCAL}` },
      { q: 'Which text encoding is hashed?', a: 'UTF-8, the same bytes most programming languages and command-line tools hash for a string.' },
      { q: 'Should I use MD5 or SHA-1 for passwords?', a: 'No. MD5 and SHA-1 are broken for security and any fast hash is wrong for passwords. Use bcrypt, scrypt or Argon2 for passwords, and SHA-256 or better for integrity checks.' },
      { q: 'Why does my hash differ from another tool’s?', a: 'Usually a trailing newline or space, or a different text encoding. Command-line tools often hash the newline that echo adds.' },
    ],
    related: ['hmac-generator', 'bcrypt-generator', 'base64-encode-decode'],
    form: {
      run: 'live',
      fields: [{ id: 'text', label: 'Text', type: 'textarea', rows: 6, placeholder: 'Type or paste text' }],
      outputs: [{ id: 'hashes', label: 'Hashes', type: 'table', copy: true }],
    },
  },
  {
    slug: 'password-generator',
    group: 'security',
    title: 'Password Generator - Strong, Random, Private',
    description:
      'Generate strong random passwords in your browser with the length and characters you choose. Passwords are made on your device and never sent anywhere.',
    h1: 'Password generator',
    subhead: 'Strong random passwords, made on your device. Nothing is sent anywhere.',
    howTo: ['Choose the length and which characters to use.', 'A new password appears; select Generate for another.', 'Copy it into your password manager.'],
    faq: [
      { q: 'Are the passwords really random?', a: 'Yes. They come from your browser’s cryptographic random number generator (crypto.getRandomValues), with no bias towards any character.' },
      { q: 'Is the password sent or stored anywhere?', a: 'No. It is made in this tab and exists only on your screen until you copy it. Nothing is logged or saved.' },
      { q: 'How long should a password be?', a: 'At least 16 characters for accounts that matter. The bits shown under the password measure its strength: 80 bits and up is very hard to guess.' },
      { q: 'What does “avoid look-alike characters” do?', a: 'It leaves out characters that are easy to misread, such as l, 1, I, O and 0, which helps when a password has to be typed by hand.' },
    ],
    related: ['uuid-generator', 'bcrypt-generator', 'hash-generator'],
    form: {
      run: 'load',
      button: 'Generate',
      fields: [
        { id: 'length', label: 'Length', type: 'range', min: 8, max: 64, step: 1, value: '20' },
        { id: 'upper', label: 'A–Z', type: 'checkbox', checked: true },
        { id: 'lower', label: 'a–z', type: 'checkbox', checked: true },
        { id: 'digits', label: '0–9', type: 'checkbox', checked: true },
        { id: 'symbols', label: 'Symbols', type: 'checkbox', checked: true },
        { id: 'similar', label: 'Avoid look-alike characters', type: 'checkbox', checked: false },
      ],
      outputs: [{ id: 'password', label: 'Password', type: 'text', copy: true }],
    },
  },
  {
    slug: 'uuid-generator',
    group: 'security',
    title: 'UUID Generator - v4 and v7, Bulk, Private',
    description:
      'Generate random UUID v4 or time-ordered UUID v7 identifiers, up to 100 at once, in your browser. Made on your device and never sent anywhere. Free.',
    h1: 'UUID generator',
    subhead: 'Random v4 or time-ordered v7 UUIDs, up to 100 at once, made on your device.',
    howTo: ['Choose the version and how many you need.', 'Select Generate for a fresh batch.', 'Copy them, one per line.'],
    faq: [
      { q: 'What is the difference between v4 and v7?', a: 'A v4 UUID is fully random. A v7 UUID starts with the current time in milliseconds, so new ones sort after old ones, which keeps database indexes compact.' },
      { q: 'Can two UUIDs collide?', a: 'In practice no. A v4 UUID has 122 random bits; you would need about 2.7 quintillion of them for a 50% chance of a single duplicate.' },
      { q: 'Are they sent or stored anywhere?', a: 'No. They are made from your browser’s cryptographic random number generator and only exist on this page.' },
      { q: 'Which standard do they follow?', a: 'RFC 9562, which replaced RFC 4122 in 2024. Both versions use the standard 8-4-4-4-12 hex layout.' },
    ],
    related: ['password-generator', 'hash-generator', 'unix-timestamp-converter'],
    form: {
      run: 'load',
      button: 'Generate',
      fields: [
        { id: 'version', label: 'Version', type: 'select', options: [['4', 'v4 (random)'], ['7', 'v7 (time-ordered)']], value: '4' },
        { id: 'count', label: 'How many', type: 'number', min: 1, max: 100, value: '5' },
      ],
      outputs: [{ id: 'uuids', label: 'UUIDs', type: 'text', copy: true }],
    },
  },
  {
    slug: 'bcrypt-generator',
    group: 'security',
    title: 'Bcrypt Hash Generator and Checker - Private',
    description:
      'Hash a password with bcrypt at the cost you choose, or check a password against an existing bcrypt hash. Runs in your browser; nothing is uploaded.',
    h1: 'Bcrypt hash and verify',
    subhead: 'Hash a password with bcrypt, or check one against a hash. Nothing leaves this tab.',
    howTo: ['Type the password and choose the cost.', 'To check a password, paste the bcrypt hash too.', 'Select Hash: you get a new hash, and a match result if you pasted one.'],
    faq: [
      { q: 'Is my password sent anywhere?', a: `No. Hashing and checking run in your browser. ${LOCAL}` },
      { q: 'Which cost should I choose?', a: 'The highest your server can afford per login, typically 10 to 12. Each step up doubles the time, both for you and for anyone guessing.' },
      { q: 'Why is the hash different every time?', a: 'Bcrypt adds a random salt to each hash, so the same password gives a different hash each time. Checking still works because the salt is stored inside the hash.' },
      { q: 'Is there a length limit?', a: 'Bcrypt only uses the first 72 bytes of a password. Longer passwords are cut there, which is a property of bcrypt itself.' },
    ],
    related: ['password-generator', 'hash-generator', 'hmac-generator'],
    form: {
      run: 'button',
      button: 'Hash',
      fields: [
        { id: 'password', label: 'Password', type: 'text', placeholder: 'Password to hash' },
        { id: 'cost', label: 'Cost', type: 'range', min: 4, max: 14, step: 1, value: '10' },
        { id: 'hash', label: 'Hash to check (optional)', type: 'text', placeholder: '$2b$10$…' },
      ],
      outputs: [{ id: 'result', label: 'Bcrypt hash', type: 'text', copy: true }],
    },
  },
  {
    slug: 'hmac-generator',
    group: 'security',
    title: 'HMAC Generator - SHA-256, SHA-512, SHA-1 Online',
    description:
      'Create an HMAC signature of a message with your secret key, using SHA-1, SHA-256, SHA-384 or SHA-512, as hex or Base64. Your key never leaves the page.',
    h1: 'HMAC generator',
    subhead: 'Sign a message with a secret key. Your key and message stay in this tab.',
    howTo: ['Paste the message and the secret key.', 'Choose the hash and the output format.', 'Copy the signature.'],
    faq: [
      { q: 'Is my secret key sent anywhere?', a: `No. The signature is computed with your browser’s Web Crypto API. ${LOCAL}` },
      { q: 'What is an HMAC used for?', a: 'Checking that a message came from someone holding the same key and was not changed, for example webhook signatures from Stripe or GitHub.' },
      { q: 'Hex or Base64?', a: 'Use whatever the system you are matching expects. GitHub webhooks use hex; many APIs use Base64. Both encode the same bytes.' },
      { q: 'Which text encoding is used?', a: 'UTF-8 for both the message and the key, as most HMAC libraries do for strings.' },
    ],
    related: ['hash-generator', 'jwt-decoder', 'base64-encode-decode'],
    form: {
      run: 'live',
      fields: [
        { id: 'message', label: 'Message', type: 'textarea', rows: 5, placeholder: 'Message to sign' },
        { id: 'key', label: 'Secret key', type: 'text', placeholder: 'Secret key' },
        { id: 'algo', label: 'Hash', type: 'select', options: [['SHA-256', 'SHA-256'], ['SHA-384', 'SHA-384'], ['SHA-512', 'SHA-512'], ['SHA-1', 'SHA-1']], value: 'SHA-256' },
        { id: 'encoding', label: 'Output', type: 'select', options: [['hex', 'Hex'], ['base64', 'Base64']], value: 'hex' },
      ],
      outputs: [{ id: 'hmac', label: 'HMAC', type: 'text', copy: true }],
    },
  },
  // --- Encoding ---
  {
    slug: 'url-encode-decode',
    group: 'encoding',
    title: 'URL Encode and Decode - Percent-Encoding Online',
    description:
      'Percent-encode text for a URL or decode an encoded URL back to readable text, as a query value or a whole URL. Runs in your browser; nothing is sent.',
    h1: 'URL encode and decode',
    subhead: 'Percent-encode text for URLs, or decode it back. Your text stays in this tab.',
    howTo: ['Choose Encode or Decode.', 'Paste your text or URL.', 'Copy the result.'],
    faq: [
      { q: 'Component or full URL: which do I need?', a: 'Component encodes everything that has a meaning in a URL, including / ? & and =, which is right for a single query value. Full URL leaves those alone so a whole address keeps working.' },
      { q: 'Why does decoding fail?', a: 'A % must be followed by two hex digits that form valid UTF-8. A stray % or a broken sequence cannot be decoded, and we say where it is.' },
      { q: 'Are spaces encoded as + or %20?', a: 'As %20, which is correct everywhere in a URL. A + only means a space inside HTML form data.' },
      { q: 'Is my text sent anywhere?', a: `No. ${LOCAL}` },
    ],
    related: ['base64-encode-decode', 'html-entities', 'slugify'],
    form: {
      run: 'live',
      fields: [
        { id: 'mode', label: 'Mode', type: 'select', options: [['encode', 'Encode'], ['decode', 'Decode']], value: 'encode' },
        { id: 'scope', label: 'Treat as', type: 'select', options: [['component', 'Component (query value)'], ['uri', 'Full URL']], value: 'component' },
        { id: 'text', label: 'Text', type: 'textarea', rows: 5, placeholder: 'Text or URL' },
      ],
      outputs: [{ id: 'result', label: 'Result', type: 'text', copy: true }],
    },
  },
  {
    slug: 'html-entities',
    group: 'encoding',
    title: 'HTML Entity Encoder and Decoder - Escape HTML',
    description:
      'Escape text into HTML entities so it shows as text, or decode named and numeric entities back to characters. Runs in your browser; nothing is uploaded.',
    h1: 'HTML entity encoder and decoder',
    subhead: 'Escape text for HTML, or decode entities back to characters, in this tab.',
    howTo: ['Choose Encode or Decode.', 'Paste your text or HTML.', 'Copy the result.'],
    faq: [
      { q: 'Which characters are encoded?', a: 'The five that matter in HTML: & < > " and \'. Turn on “Also encode non-ASCII” to write every other non-ASCII character as a numeric entity too.' },
      { q: 'Which entities can be decoded?', a: 'All of them: named entities such as &nbsp; and &copy;, decimal ones like &#169; and hex ones like &#xA9;, using the browser’s own HTML parser.' },
      { q: 'Does decoding run any HTML or scripts?', a: 'No. The text is parsed in an inert document that never renders or runs anything, and only its text comes back.' },
      { q: 'Is my text sent anywhere?', a: `No. ${LOCAL}` },
    ],
    related: ['url-encode-decode', 'markdown-to-html', 'xml-formatter'],
    form: {
      run: 'live',
      fields: [
        { id: 'mode', label: 'Mode', type: 'select', options: [['encode', 'Encode'], ['decode', 'Decode']], value: 'encode' },
        { id: 'ascii', label: 'Also encode non-ASCII', type: 'checkbox', checked: false },
        { id: 'text', label: 'Text', type: 'textarea', rows: 6, placeholder: 'Text or HTML' },
      ],
      outputs: [{ id: 'result', label: 'Result', type: 'text', copy: true }],
    },
  },
  {
    slug: 'unix-timestamp-converter',
    group: 'encoding',
    title: 'Unix Timestamp Converter - Epoch to Date and Back',
    description:
      'Convert a Unix timestamp in seconds or milliseconds to a readable date in UTC and your time zone, or a date back to a timestamp. Runs in your browser.',
    h1: 'Unix timestamp converter',
    subhead: 'Epoch seconds or milliseconds to dates, and dates back to timestamps.',
    howTo: ['Paste a timestamp or a date, or select Now.', 'Seconds and milliseconds are told apart automatically.', 'Copy any of the formats.'],
    faq: [
      { q: 'Seconds or milliseconds?', a: 'Numbers up to 11 digits are read as seconds and longer ones as milliseconds, which covers every date from 1970 to the year 5138.' },
      { q: 'Which date formats can I paste?', a: 'ISO 8601 (2025-01-31T09:30:00Z) works everywhere. Most other formats work too, but without a time zone a date is read in your local time.' },
      { q: 'Which time zone is used?', a: 'Both: UTC, and your device’s own time zone for the local time.' },
      { q: 'Is anything sent to a server?', a: `No. ${LOCAL}` },
    ],
    related: ['cron-expression-parser', 'uuid-generator', 'jwt-decoder'],
    form: {
      run: 'load',
      button: 'Now',
      fields: [{ id: 'input', label: 'Timestamp or date', type: 'text', placeholder: '1735689600 or 2025-01-01T00:00:00Z' }],
      outputs: [{ id: 'formats', label: 'Formats', type: 'table', copy: true }],
    },
  },
  {
    slug: 'number-base-converter',
    group: 'encoding',
    title: 'Number Base Converter - Binary, Hex, Octal, Decimal',
    description:
      'Convert numbers between binary, octal, decimal and hexadecimal, at any length with no rounding. Runs in your browser; nothing you type is uploaded.',
    h1: 'Number base converter',
    subhead: 'Binary, octal, decimal and hex, at any length, converted in this tab.',
    howTo: ['Choose the base of your number.', 'Type or paste the number.', 'Copy it in any other base.'],
    faq: [
      { q: 'How big can the number be?', a: 'Any size. Numbers are converted as whole integers with no rounding, so a 256-bit hex value comes out exact.' },
      { q: 'Can I paste prefixes like 0x or 0b?', a: 'Yes. 0x, 0o and 0b are removed, and so are spaces and underscores used to group digits.' },
      { q: 'Are negative numbers or fractions supported?', a: 'A leading minus sign is kept. Fractions are not: they rarely convert exactly between bases.' },
      { q: 'Is my number sent anywhere?', a: `No. ${LOCAL}` },
    ],
    related: ['color-converter', 'subnet-calculator', 'hash-generator'],
    form: {
      run: 'live',
      fields: [
        { id: 'base', label: 'From', type: 'select', options: [['10', 'Decimal'], ['16', 'Hex'], ['2', 'Binary'], ['8', 'Octal']], value: '10' },
        { id: 'value', label: 'Number', type: 'text', placeholder: '255' },
      ],
      outputs: [{ id: 'bases', label: 'In every base', type: 'table', copy: true }],
    },
  },
  // --- Convert ---
  {
    slug: 'yaml-to-json',
    group: 'convert',
    title: 'YAML to JSON Converter - Private, Runs in Browser',
    description:
      'Convert YAML to JSON in your browser, with errors shown at their line. Config files and secrets stay on your device and are never uploaded. Free.',
    h1: 'YAML to JSON',
    subhead: 'Convert YAML to formatted JSON. Your config never leaves this tab.',
    howTo: ['Paste your YAML.', 'Choose the indent.', 'Copy the JSON.'],
    faq: [
      { q: 'Is my YAML sent to a server?', a: `No. It is converted in your browser, which makes it safe for config files with secrets. ${LOCAL}` },
      { q: 'Which YAML is supported?', a: 'YAML 1.2, including anchors, aliases and multi-line strings. A file with several documents separated by --- becomes a JSON array.' },
      { q: 'What happens to comments?', a: 'They are dropped, because JSON has no comments.' },
      { q: 'Why does a value come out as a string?', a: 'YAML 1.2 only treats true, false, null and plain numbers as special. Values such as yes, no or on stay strings, unlike in older YAML 1.1 parsers.' },
    ],
    related: ['json-to-yaml', 'json-formatter', 'xml-formatter'],
    form: {
      run: 'live',
      fields: [
        { id: 'indent', label: 'Indent', type: 'select', options: indent, value: '2' },
        { id: 'text', label: 'YAML', type: 'textarea', rows: 10, placeholder: 'Paste YAML here' },
      ],
      outputs: [{ id: 'result', label: 'JSON', type: 'text', copy: true }],
    },
  },
  {
    slug: 'json-to-yaml',
    group: 'convert',
    title: 'JSON to YAML Converter - Private, Runs in Browser',
    description:
      'Convert JSON to clean, readable YAML in your browser, with errors shown at their place. Your data stays on your device and is never uploaded. Free.',
    h1: 'JSON to YAML',
    subhead: 'Convert JSON to readable YAML. Your data never leaves this tab.',
    howTo: ['Paste your JSON.', 'The YAML appears as you type.', 'Copy the YAML.'],
    faq: [
      { q: 'Is my JSON sent to a server?', a: `No. ${LOCAL}` },
      { q: 'Are strings quoted?', a: 'Only when they must be, for example a string that would otherwise read as a number or as true, so the YAML means exactly what the JSON did.' },
      { q: 'What indent is used?', a: 'Two spaces, the usual style for YAML files such as Kubernetes manifests and GitHub workflows.' },
      { q: 'Does the key order change?', a: 'No. Keys keep the order they have in your JSON.' },
    ],
    related: ['yaml-to-json', 'json-formatter', 'json-to-csv'],
    form: {
      run: 'live',
      fields: [{ id: 'text', label: 'JSON', type: 'textarea', rows: 10, placeholder: 'Paste JSON here' }],
      outputs: [{ id: 'result', label: 'YAML', type: 'text', copy: true }],
    },
  },
  {
    slug: 'json-to-csv',
    group: 'convert',
    title: 'JSON to CSV Converter - Private, Runs in Browser',
    description:
      'Convert a JSON array to CSV for Excel or Google Sheets, with every key as a column. Runs in your browser; your data is never uploaded. Free, no sign-up.',
    h1: 'JSON to CSV',
    subhead: 'Turn a JSON array into CSV for any spreadsheet. Your data stays in this tab.',
    howTo: ['Paste a JSON array.', 'Choose the delimiter.', 'Copy the CSV, or paste it into a spreadsheet.'],
    faq: [
      { q: 'What JSON can be converted?', a: 'An array of objects (each key becomes a column) or an array of arrays (each one becomes a row). A single object becomes one row.' },
      { q: 'What if objects have different keys?', a: 'Every key found becomes a column, in the order first seen; a row without that key gets an empty cell.' },
      { q: 'How are nested objects handled?', a: 'They are written into their cell as JSON text, so no data is lost.' },
      { q: 'Is my data sent anywhere?', a: `No. ${LOCAL}` },
    ],
    related: ['csv-to-json', 'json-formatter', 'json-to-yaml'],
    form: {
      run: 'live',
      fields: [
        { id: 'delimiter', label: 'Delimiter', type: 'select', options: delimiters, value: ',' },
        { id: 'text', label: 'JSON', type: 'textarea', rows: 10, placeholder: '[{"name": "Ada", "year": 1815}]' },
      ],
      outputs: [{ id: 'result', label: 'CSV', type: 'text', copy: true }],
    },
  },
  {
    slug: 'csv-to-json',
    group: 'convert',
    title: 'CSV to JSON Converter - Private, Runs in Browser',
    description:
      'Convert CSV from Excel or Google Sheets to JSON, with quoted fields and line breaks handled. Runs in your browser; your data is never uploaded. Free.',
    h1: 'CSV to JSON',
    subhead: 'Turn CSV into a JSON array. Your spreadsheet data stays in this tab.',
    howTo: ['Paste your CSV.', 'Say whether the first row holds the column names.', 'Copy the JSON.'],
    faq: [
      { q: 'Are quotes and line breaks inside fields handled?', a: 'Yes. Fields in double quotes can hold commas, line breaks and doubled quotes (""), as the CSV standard (RFC 4180) describes.' },
      { q: 'Which delimiter is used?', a: 'Auto picks comma, semicolon or tab from your first line. You can also choose one.' },
      { q: 'Are numbers converted?', a: 'No. Every value stays a string, so codes such as 007 or long IDs keep their exact digits.' },
      { q: 'Is my data sent anywhere?', a: `No. ${LOCAL}` },
    ],
    related: ['json-to-csv', 'json-formatter', 'yaml-to-json'],
    form: {
      run: 'live',
      fields: [
        { id: 'delimiter', label: 'Delimiter', type: 'select', options: [['auto', 'Auto'], ...delimiters], value: 'auto' },
        { id: 'header', label: 'First row is column names', type: 'checkbox', checked: true },
        { id: 'text', label: 'CSV', type: 'textarea', rows: 10, placeholder: 'name,year\nAda,1815' },
      ],
      outputs: [{ id: 'result', label: 'JSON', type: 'text', copy: true }],
    },
  },
  {
    slug: 'color-converter',
    group: 'convert',
    title: 'Color Converter - HEX, RGB and HSL Online',
    description:
      'Convert colors between HEX, RGB and HSL, or pick one with the color picker, and copy the format you need for CSS. Runs in your browser. Free, no sign-up.',
    h1: 'Color converter',
    subhead: 'HEX, RGB and HSL, converted as you type or pick, ready to paste into CSS.',
    howTo: ['Type a color in any format, or use the picker.', 'Every format updates at once.', 'Copy the one you need.'],
    faq: [
      { q: 'Which formats can I type?', a: 'HEX (#0e6b52, #0e6b52cc, #fff), rgb() and rgba(), and hsl() and hsla(), in the old comma style or the modern space style.' },
      { q: 'Is transparency kept?', a: 'Yes. An alpha value is carried into every format; the picker itself has no alpha, so picking sets it back to opaque.' },
      { q: 'Why is HSL rounded?', a: 'Hue, saturation and lightness are rounded to whole numbers for readability, which can shift the color by at most one step per channel.' },
      { q: 'Is anything sent anywhere?', a: `No. ${LOCAL}` },
    ],
    related: ['number-base-converter', 'case-converter', 'qr-code-generator'],
    form: {
      run: 'live',
      fields: [
        { id: 'color', label: 'Color', type: 'text', placeholder: '#0e6b52 or rgb(14 107 82)', value: '#0e6b52' },
        { id: 'picker', label: 'Picker', type: 'color', value: '#0e6b52' },
      ],
      outputs: [{ id: 'formats', label: 'Formats', type: 'table', copy: true }],
    },
  },
  {
    slug: 'case-converter',
    group: 'convert',
    title: 'Case Converter - camelCase, snake_case, kebab-case',
    description:
      'Convert text to camelCase, PascalCase, snake_case, CONSTANT_CASE, kebab-case, Title Case and more, all at once. Runs in your browser. Free, no sign-up.',
    h1: 'Case converter',
    subhead: 'camelCase, snake_case, kebab-case and six more, all at once, in this tab.',
    howTo: ['Type or paste your text or identifier.', 'Every case updates as you type.', 'Copy the one you need.'],
    faq: [
      { q: 'How are words found?', a: 'At spaces, punctuation, underscores, dashes and changes from lower to upper case, so getHTTPResponse becomes get, HTTP and Response.' },
      { q: 'Are accents and other alphabets kept?', a: 'Yes. Letters in any alphabet are kept as they are; only the separators and the case change.' },
      { q: 'Does it handle several lines?', a: 'Each case treats the whole text as one name. For a list, convert one line at a time.' },
      { q: 'Is my text sent anywhere?', a: `No. ${LOCAL}` },
    ],
    related: ['slugify', 'word-counter', 'url-encode-decode'],
    form: {
      run: 'live',
      fields: [{ id: 'text', label: 'Text', type: 'textarea', rows: 3, placeholder: 'Hello world, getHTTPResponse or user_id', prose: true }],
      outputs: [{ id: 'cases', label: 'Cases', type: 'table', copy: true }],
    },
  },
  // --- Text ---
  {
    slug: 'word-counter',
    group: 'text',
    title: 'Word Counter - Words, Characters and Reading Time',
    description:
      'Count words, characters, sentences and paragraphs as you type, with reading and speaking time. Your text stays in your browser and is never uploaded.',
    h1: 'Word counter',
    subhead: 'Words, characters, sentences and reading time, counted as you type.',
    howTo: ['Type or paste your text.', 'The counts update as you type.', 'Edit until you hit your target.'],
    faq: [
      { q: 'How are words counted?', a: 'With your browser’s own word rules for the language (Intl.Segmenter), so hyphenated words and contractions count once and languages without spaces are split properly.' },
      { q: 'How is reading time worked out?', a: 'At 238 words a minute for reading and 150 for speaking aloud, the average adult rates found in studies of English text.' },
      { q: 'Is my text saved or uploaded?', a: 'No. It is counted in this tab and is gone when you close it.' },
      { q: 'Do emojis count as one character?', a: 'Yes. Characters are counted as you see them, so an emoji or an accented letter counts as one.' },
    ],
    related: ['case-converter', 'text-diff', 'lorem-ipsum-generator'],
    form: {
      run: 'live',
      fields: [{ id: 'text', label: 'Text', type: 'textarea', rows: 10, placeholder: 'Type or paste your text', prose: true }],
      outputs: [{ id: 'counts', label: 'Counts', type: 'table' }],
    },
  },
  {
    slug: 'text-diff',
    group: 'text',
    title: 'Text Diff - Compare Two Texts Online, Privately',
    description:
      'Compare two versions of a text or code and see every added and removed line, with an option to ignore whitespace. Runs in your browser; nothing is uploaded.',
    h1: 'Text diff',
    subhead: 'See what changed between two texts, line by line. Both stay in this tab.',
    howTo: ['Paste the original text.', 'Paste the changed text.', 'Read the added and removed lines below.'],
    faq: [
      { q: 'Is my text sent to a server?', a: `No. The comparison runs in your browser, which makes it safe for contracts and code. ${LOCAL}` },
      { q: 'What does “ignore whitespace” do?', a: 'Lines that differ only in spaces or tabs at the start or end are treated as the same, which hides indentation-only changes.' },
      { q: 'Does it compare words or lines?', a: 'Lines, like git diff: a changed line shows as one line removed and one line added.' },
      { q: 'How big can the texts be?', a: 'There is no fixed limit, but very large texts with many changes take longer, on your device.' },
    ],
    related: ['word-counter', 'json-formatter', 'case-converter'],
    form: {
      run: 'live',
      fields: [
        { id: 'a', label: 'Original', type: 'textarea', rows: 8, placeholder: 'Original text' },
        { id: 'b', label: 'Changed', type: 'textarea', rows: 8, placeholder: 'Changed text' },
        { id: 'ws', label: 'Ignore whitespace', type: 'checkbox', checked: false },
      ],
      outputs: [{ id: 'diff', label: 'Changes', type: 'diff' }],
    },
  },
  {
    slug: 'lorem-ipsum-generator',
    group: 'text',
    title: 'Lorem Ipsum Generator - Paragraphs, Sentences, Words',
    description:
      'Generate lorem ipsum placeholder text by paragraphs, sentences or words, with or without the classic opening. Runs in your browser. Free, no sign-up.',
    h1: 'Lorem ipsum generator',
    subhead: 'Placeholder text by paragraphs, sentences or words, ready to copy.',
    howTo: ['Choose how much and in what unit.', 'Select Generate for a new mix.', 'Copy the text.'],
    faq: [
      { q: 'What is lorem ipsum?', a: 'Scrambled Latin, based on a passage by Cicero, used since the 1500s to fill a layout so it can be judged without the words drawing attention.' },
      { q: 'Does every result start with “Lorem ipsum dolor sit amet”?', a: 'Only if “Start with Lorem ipsum” is on. Turn it off for text that starts at random.' },
      { q: 'How much can I generate?', a: 'Up to 50 paragraphs, sentences or words at once. Select Generate again for more.' },
      { q: 'Is it sent anywhere?', a: 'No. It is made in this tab.' },
    ],
    related: ['word-counter', 'markdown-to-html', 'case-converter'],
    form: {
      run: 'load',
      button: 'Generate',
      fields: [
        { id: 'count', label: 'How many', type: 'number', min: 1, max: 50, value: '3' },
        { id: 'unit', label: 'Unit', type: 'select', options: [['paragraphs', 'Paragraphs'], ['sentences', 'Sentences'], ['words', 'Words']], value: 'paragraphs' },
        { id: 'classic', label: 'Start with Lorem ipsum', type: 'checkbox', checked: true },
      ],
      outputs: [{ id: 'text', label: 'Text', type: 'text', copy: true }],
    },
  },
  {
    slug: 'slugify',
    group: 'text',
    title: 'Slugify - Text to URL Slug Generator Online',
    description:
      'Turn a title or any text into a clean URL slug, with accents removed, symbols dropped and your choice of separator. Runs in your browser. Free.',
    h1: 'Slugify',
    subhead: 'Turn any title into a clean URL slug, in this tab.',
    howTo: ['Type or paste the title.', 'Choose the separator and the case.', 'Copy the slug.'],
    faq: [
      { q: 'What happens to accents?', a: 'They are removed, so Crème brûlée becomes creme-brulee. Letters with no plain Latin form, such as Greek or Chinese, are kept.' },
      { q: 'What happens to symbols?', a: 'Anything that is not a letter or a digit becomes a separator, and repeated separators are joined into one, so there are no double dashes.' },
      { q: 'Dash or underscore?', a: 'Use the dash for web addresses: search engines read dashes as spaces between words, and underscores as part of a word.' },
      { q: 'Is my text sent anywhere?', a: `No. ${LOCAL}` },
    ],
    related: ['case-converter', 'url-encode-decode', 'word-counter'],
    form: {
      run: 'live',
      fields: [
        { id: 'separator', label: 'Separator', type: 'select', options: [['-', 'Dash (-)'], ['_', 'Underscore (_)']], value: '-' },
        { id: 'lower', label: 'Lowercase', type: 'checkbox', checked: true },
        { id: 'text', label: 'Text', type: 'textarea', rows: 3, placeholder: 'Crème brûlée: 10 tips & tricks!', prose: true },
      ],
      outputs: [{ id: 'slug', label: 'Slug', type: 'text', copy: true }],
    },
  },
  {
    slug: 'markdown-to-html',
    group: 'text',
    title: 'Markdown to HTML Converter with Live Preview',
    description:
      'Convert Markdown to HTML with a live preview, including tables, task lists and code blocks. Runs in your browser; your text is never uploaded. Free.',
    h1: 'Markdown to HTML',
    subhead: 'Markdown to clean HTML with a live preview, converted in this tab.',
    howTo: ['Type or paste your Markdown.', 'Check the preview.', 'Copy the HTML.'],
    faq: [
      { q: 'Which Markdown is supported?', a: 'CommonMark plus the GitHub additions: tables, task lists, strikethrough and fenced code blocks.' },
      { q: 'Is HTML inside my Markdown kept?', a: 'Yes, as Markdown allows. The preview runs in a sandbox with scripts turned off, so nothing in it can run, but check the HTML before you publish it anywhere.' },
      { q: 'Is the HTML styled?', a: 'No. You get plain semantic HTML (headings, lists, tables) for your own styles; the preview uses simple defaults.' },
      { q: 'Why don’t my images show in the preview?', a: 'The preview never loads anything from another site, so pasting Markdown can’t make your browser contact one. The HTML you copy keeps every image link as written.' },
      { q: 'Is my text sent anywhere?', a: `No. ${LOCAL}` },
    ],
    related: ['html-entities', 'word-counter', 'lorem-ipsum-generator'],
    form: {
      run: 'live',
      fields: [{ id: 'text', label: 'Markdown', type: 'textarea', rows: 10, placeholder: '# Title\n\nSome **bold** text and a [link](https://example.com).' }],
      outputs: [
        { id: 'html', label: 'HTML', type: 'text', copy: true },
        { id: 'preview', label: 'Preview', type: 'preview' },
      ],
    },
  },
  // --- Code ---
  {
    slug: 'regex-tester',
    group: 'code',
    title: 'Regex Tester - Test JavaScript Regular Expressions',
    description:
      'Test a JavaScript regular expression against your text, with every match highlighted and its groups listed. Runs in your browser; nothing is uploaded.',
    h1: 'Regex tester',
    subhead: 'Test a regular expression and see every match and group, in this tab.',
    howTo: ['Type the pattern and its flags.', 'Paste the text to test.', 'Read the highlighted matches and their groups.'],
    faq: [
      { q: 'Which regex flavour is this?', a: 'JavaScript’s, as in your browser, including named groups, lookbehind and the u, s and v flags. Most patterns work the same in other languages.' },
      { q: 'What if my pattern takes forever?', a: 'It runs in the background with a one-second limit. A pattern with catastrophic backtracking stops with a message instead of freezing the page.' },
      { q: 'Why does it find only one match?', a: 'Without the g flag a regex stops at the first match. The flags box starts with g for that reason.' },
      { q: 'Is my text sent anywhere?', a: `No. ${LOCAL}` },
    ],
    related: ['text-diff', 'cron-expression-parser', 'json-formatter'],
    form: {
      run: 'live',
      fields: [
        { id: 'pattern', label: 'Pattern', type: 'text', placeholder: '(\\w+)@(\\w+)\\.com' },
        { id: 'flags', label: 'Flags', type: 'text', value: 'g', placeholder: 'g, i, m, s, u, y' },
        { id: 'text', label: 'Test text', type: 'textarea', rows: 8, placeholder: 'Text to search' },
      ],
      outputs: [
        { id: 'highlight', label: 'Matches', type: 'highlight' },
        { id: 'groups', label: 'Match details', type: 'table' },
      ],
    },
  },
  {
    slug: 'cron-expression-parser',
    group: 'code',
    title: 'Cron Expression Explainer - Next Run Times Online',
    description:
      'Turn a cron expression into plain English and see its next five run times in your time zone. Runs in your browser; nothing is uploaded. Free, no sign-up.',
    h1: 'Cron expression explainer',
    subhead: 'A cron schedule in plain English, with its next run times.',
    howTo: ['Type a five-field cron expression.', 'Read what it means.', 'Check the next run times.'],
    faq: [
      { q: 'Which cron format is this?', a: 'The standard five fields: minute, hour, day of month, month and day of week, as used by Linux cron, Kubernetes CronJobs and GitHub Actions.' },
      { q: 'Which time zone are the run times in?', a: 'Your device’s time zone. Servers often run cron in UTC, so check your server’s setting.' },
      { q: 'Are names like MON or JAN allowed?', a: 'Yes, along with ranges (1-5), lists (1,15), steps (*/10) and shortcuts such as @daily.' },
      { q: 'What if both day fields are set?', a: 'As in standard cron, the job runs when either the day of month or the day of week matches.' },
    ],
    related: ['unix-timestamp-converter', 'regex-tester', 'subnet-calculator'],
    form: {
      run: 'live',
      fields: [{ id: 'expr', label: 'Cron expression', type: 'text', value: '*/15 9-17 * * 1-5', placeholder: '*/15 9-17 * * 1-5' }],
      outputs: [
        { id: 'meaning', label: 'Meaning', type: 'text' },
        { id: 'next', label: 'Next runs', type: 'table' },
      ],
    },
  },
  {
    slug: 'sql-formatter',
    group: 'code',
    title: 'SQL Formatter - Beautify SQL Queries, Privately',
    description:
      'Format SQL for PostgreSQL, MySQL, SQLite, SQL Server or BigQuery, with keyword case of your choice. Runs in your browser; queries are never uploaded.',
    h1: 'SQL formatter',
    subhead: 'Make any SQL query readable. Your queries never leave this tab.',
    howTo: ['Paste your SQL.', 'Choose the dialect and keyword case.', 'Copy the formatted query.'],
    faq: [
      { q: 'Is my SQL sent to a server?', a: `No. It is formatted in your browser, which keeps table names and data out of other people’s logs. ${LOCAL}` },
      { q: 'Does formatting change what the query does?', a: 'No. Only spaces, line breaks and, if you choose, keyword case change. The query itself stays the same.' },
      { q: 'Why choose a dialect?', a: 'Dialects differ in quoting, operators and keywords, such as backticks in MySQL or :: casts in PostgreSQL. Picking yours avoids misreading them.' },
      { q: 'What if my SQL has an error?', a: 'We show the formatter’s message. Formatting does not check that tables or columns exist.' },
    ],
    related: ['json-formatter', 'xml-formatter', 'text-diff'],
    form: {
      run: 'live',
      fields: [
        { id: 'dialect', label: 'Dialect', type: 'select', options: [['sql', 'Standard SQL'], ['postgresql', 'PostgreSQL'], ['mysql', 'MySQL'], ['sqlite', 'SQLite'], ['tsql', 'SQL Server'], ['bigquery', 'BigQuery']], value: 'sql' },
        { id: 'case', label: 'Keywords', type: 'select', options: [['upper', 'UPPER'], ['lower', 'lower'], ['preserve', 'As typed']], value: 'upper' },
        { id: 'text', label: 'SQL', type: 'textarea', rows: 10, placeholder: 'select id, name from users where active = 1 order by name' },
      ],
      outputs: [{ id: 'result', label: 'Formatted SQL', type: 'text', copy: true }],
    },
  },
  {
    slug: 'xml-formatter',
    group: 'code',
    title: 'XML Formatter and Validator - Private, Online',
    description:
      'Format and validate XML in your browser, with errors shown at their line and your choice of indent. Your files are never uploaded. Free, no sign-up.',
    h1: 'XML formatter',
    subhead: 'Format and check XML. Your files never leave this tab.',
    howTo: ['Paste your XML.', 'Choose the indent.', 'Copy the formatted XML.'],
    faq: [
      { q: 'Is my XML sent to a server?', a: `No. ${LOCAL}` },
      { q: 'How is it validated?', a: 'Your browser’s XML parser checks that the document is well-formed: tags closed and nested, attributes quoted. It does not check it against a schema (XSD).' },
      { q: 'Is text inside elements changed?', a: 'No. Text, CDATA sections and comments are kept; only the spaces between tags change.' },
      { q: 'Does it work for SVG and HTML?', a: 'SVG, yes: it is XML. HTML only if it is written as XHTML, with every tag closed.' },
    ],
    related: ['json-formatter', 'sql-formatter', 'html-entities'],
    form: {
      run: 'live',
      fields: [
        { id: 'indent', label: 'Indent', type: 'select', options: indent, value: '2' },
        { id: 'text', label: 'XML', type: 'textarea', rows: 10, placeholder: '<note><to>Ada</to><body>Hello</body></note>' },
      ],
      outputs: [{ id: 'result', label: 'Formatted XML', type: 'text', copy: true }],
    },
  },
  {
    slug: 'subnet-calculator',
    group: 'code',
    title: 'IPv4 Subnet Calculator - CIDR, Netmask, Hosts',
    description:
      'Work out the network, netmask, broadcast, host range and host count of any IPv4 subnet from CIDR notation or a netmask. Runs in your browser. Free.',
    h1: 'IPv4 subnet calculator',
    subhead: 'Network, netmask, broadcast and host range of any IPv4 subnet.',
    howTo: ['Type an address with /prefix, or with a netmask.', 'Read the subnet details.', 'Copy any value.'],
    faq: [
      { q: 'What can I type?', a: 'CIDR notation such as 192.168.1.10/24, or an address and a netmask such as 10.0.0.1 255.255.252.0. Any address inside the subnet works.' },
      { q: 'Why are there 2 fewer usable hosts?', a: 'The first address names the network and the last is the broadcast address, so neither can be given to a host. /31 and /32 are the exceptions, as RFC 3021 allows.' },
      { q: 'What does “private” mean?', a: 'The address is in a range reserved for private networks (RFC 1918: 10/8, 172.16/12, 192.168/16) and is not reachable from the internet.' },
      { q: 'Is IPv6 supported?', a: 'Not yet. This calculator is IPv4 only.' },
    ],
    related: ['number-base-converter', 'cron-expression-parser', 'regex-tester'],
    form: {
      run: 'live',
      fields: [{ id: 'input', label: 'Address and prefix', type: 'text', value: '192.168.1.10/24', placeholder: '192.168.1.10/24' }],
      outputs: [{ id: 'details', label: 'Subnet', type: 'table', copy: true }],
    },
  },
];
