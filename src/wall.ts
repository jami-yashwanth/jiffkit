import { HOME_TOOLS, TOOLS, type Tool, type ToolSlug } from './tools';
import { GROUP_LABEL, type DevGroup } from './dev/form';

// The tool wall: every tool sits in one zone of a wall. The homepage wall has the five tool families; the /developer/
// wall has the five developer groups. A tool's own zone is on its own wall: file tools on the homepage, developer
// tools on the developer wall.

export type ZoneId = 'image' | 'pdf' | 'ai' | 'video' | 'developer' | DevGroup;
export type Zone = { id: ZoneId; label: string; tools: Tool[] };

/** The round 2 text and QR tools, placed in the developer wall's groups. */
const OLDER: Partial<Record<ToolSlug, DevGroup>> = {
  'jwt-decoder': 'security',
  'base64-encode-decode': 'encoding',
  'qr-code-generator': 'encoding',
  'json-formatter': 'code',
};
export const devGroupOf = (t: Tool): DevGroup | undefined => (t.kind === 'dev' ? t.group : OLDER[t.slug]);

const home = (id: ZoneId, label: string, cats: Tool['category'][]): Zone => ({
  id,
  label,
  tools: HOME_TOOLS.filter((t) => cats.includes(t.category)),
});

export const HOME_ZONES: Zone[] = [
  home('image', 'Image', ['image']),
  home('pdf', 'PDF', ['pdf']),
  home('ai', 'AI', ['ai']),
  home('video', 'Video', ['video']),
  home('developer', 'Developer', ['developer', 'qr']),
];

const DEV_ORDER: DevGroup[] = ['security', 'encoding', 'convert', 'text', 'code'];
export const DEV_ZONES: Zone[] = DEV_ORDER.map((g) => ({
  id: g,
  label: GROUP_LABEL[g],
  tools: TOOLS.filter((t) => devGroupOf(t) === g),
}));

/** Where each tool lives: its zone (for colour) and the zone's name. */
export const PLACE = new Map<ToolSlug, { zone: ZoneId; label: string }>();
for (const z of [...HOME_ZONES.filter((z) => z.id !== 'developer'), ...DEV_ZONES]) {
  for (const t of z.tools) PLACE.set(t.slug, { zone: z.id, label: z.label });
}
export const placeOf = (slug: ToolSlug) => PLACE.get(slug)!;

/** What goes in and what comes out, shown on every tool's bench before anything runs. */
export const IO: Record<ToolSlug, [string, string]> = {
  'heic-to-jpg': ['HEIC', 'JPG'],
  'compress-image': ['JPG · PNG · WebP', 'the same format, smaller'],
  'webp-to-jpg': ['WebP', 'JPG or PNG'],
  'merge-pdf': ['PDFs', 'one PDF'],
  'split-pdf': ['a PDF', 'PDF pages'],
  'pdf-to-jpg': ['a PDF', 'a JPG or PNG per page'],
  'jpg-to-pdf': ['JPG · PNG · WebP · HEIC', 'one PDF'],
  'remove-background': ['a photo', 'a PNG with no background'],
  'image-to-text': ['an image', 'text'],
  'upscale-image': ['an image', 'a PNG, 2× or 4×'],
  'transcribe-audio': ['audio or video', 'text, SRT or VTT'],
  'compress-video': ['MP4 · MOV', 'a smaller MP4'],
  'video-to-gif': ['MP4 · MOV', 'a GIF'],
  'json-formatter': ['JSON', 'the same JSON, indented or minified'],
  'base64-encode-decode': ['text or Base64', 'Base64 or text'],
  'jwt-decoder': ['a JWT', 'its header, payload and expiry'],
  'qr-code-generator': ['text or a link', 'a QR code as PNG or SVG'],
  'hash-generator': ['text', 'MD5, SHA-1, SHA-256 and SHA-512 hashes'],
  'password-generator': ['a length and the characters to use', 'passwords'],
  'uuid-generator': ['how many', 'UUIDs'],
  'bcrypt-generator': ['a password', 'a bcrypt hash, or a yes or no for a hash'],
  'hmac-generator': ['text and a secret key', 'an HMAC'],
  'url-encode-decode': ['text or an encoded URL', 'the other one'],
  'html-entities': ['text or HTML entities', 'the other one'],
  'unix-timestamp-converter': ['a timestamp or a date', 'both, in UTC and your time zone'],
  'number-base-converter': ['a number', 'binary, octal, decimal and hex'],
  'yaml-to-json': ['YAML', 'JSON'],
  'json-to-yaml': ['JSON', 'YAML'],
  'json-to-csv': ['a JSON array', 'CSV'],
  'csv-to-json': ['CSV', 'a JSON array'],
  'color-converter': ['a colour', 'HEX, RGB and HSL'],
  'case-converter': ['text', 'camelCase, snake_case and more'],
  'word-counter': ['text', 'words, characters and reading time'],
  'text-diff': ['two texts', 'the lines that changed'],
  'lorem-ipsum-generator': ['how much', 'placeholder text'],
  'slugify': ['a title', 'a URL slug'],
  'markdown-to-html': ['Markdown', 'HTML and a preview'],
  'regex-tester': ['a pattern and text', 'the matches'],
  'cron-expression-parser': ['a cron expression', 'what it means, in English'],
  'sql-formatter': ['SQL', 'the same SQL, formatted'],
  'xml-formatter': ['XML', 'the same XML, indented or minified'],
  'subnet-calculator': ['an IPv4 address and prefix', 'its network, range and host count'],
};
