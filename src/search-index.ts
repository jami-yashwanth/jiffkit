import { TOOLS, type ToolSlug } from './tools';
import { placeOf } from './wall';
import { ICONS } from './icons';
import type { SearchEntry } from './search';

// The words people type for each tool, beyond its name and zone: other formats, synonyms, the job in plain words.
// A Record over every slug, so a new tool without search words does not compile.
const WORDS: Record<ToolSlug, string> = {
  'heic-to-jpg': 'iphone photo heif apple convert jpeg picture',
  'compress-image': 'reduce shrink smaller photo picture size jpeg png webp optimise optimize',
  'resize-image': 'scale dimensions width height pixels smaller photo picture jpeg png webp',
  'compress-image-to-kb': 'kb kilobyte reduce shrink size limit form exam application upload photo picture jpeg resize',
  'compress-image-to-20kb': '20kb 20 kb kilobyte reduce shrink size limit form exam application upload photo picture jpeg resize',
  'compress-image-to-50kb': '50kb 50 kb kilobyte reduce shrink size limit form exam application upload photo picture jpeg resize',
  'compress-image-to-100kb': '100kb 100 kb kilobyte reduce shrink size limit form exam application upload photo picture jpeg resize document scan',
  'compress-image-to-200kb': '200kb 200 kb kilobyte reduce shrink size limit form exam application upload photo picture jpeg resize certificate',
  'signature-resize-10-20kb': 'sign signature 10kb 20kb 10 20 kb form exam application upload scan',
  'webp-to-jpg': 'convert jpeg png picture photo',
  'png-to-jpg': 'convert jpeg picture photo screenshot',
  'jpg-to-png': 'convert jpeg picture photo lossless',
  'merge-pdf': 'combine join documents files',
  'split-pdf': 'extract pages separate cut documents',
  'rotate-pdf': 'turn flip pages landscape portrait upside down documents',
  'pdf-to-jpg': 'convert images pages png jpeg pictures',
  'jpg-to-pdf': 'images photos png webp heic convert document scan',
  'png-to-pdf': 'images screenshots convert document',
  'image-to-pdf': 'photos pictures jpg png webp heic convert document scan receipt',
  'remove-background': 'bg cut out transparent png cutout photo erase',
  'image-to-text': 'ocr extract read scan text recognition picture screenshot',
  'upscale-image': 'enlarge enhance resolution bigger sharpen photo',
  'transcribe-audio': 'speech text subtitles captions srt vtt whisper voice mp3 recording',
  'compress-video': 'reduce shrink smaller mp4 mov size',
  'video-to-gif': 'mp4 mov animated animation clip',
  'json-formatter': 'pretty print validate minify beautify lint',
  'base64-encode-decode': 'b64 encoding decoding',
  'jwt-decoder': 'json web token bearer auth claims inspect',
  'qr-code-generator': 'barcode link url wifi scan',
  'hash-generator': 'md5 sha1 sha256 sha512 sha 256 checksum digest',
  'password-generator': 'random strong secure passphrase',
  'uuid-generator': 'guid random unique identifier id',
  'bcrypt-generator': 'password hash verify check salt',
  'hmac-generator': 'signature sha256 sha 256 sign webhook secret key',
  'url-encode-decode': 'percent encoding escape query uri',
  'html-entities': 'escape unescape encode decode amp',
  'unix-timestamp-converter': 'epoch time date seconds milliseconds utc',
  'number-base-converter': 'binary hex hexadecimal octal decimal radix',
  'yaml-to-json': 'yml convert config',
  'json-to-yaml': 'yml convert config',
  'json-to-csv': 'spreadsheet excel table convert export',
  'csv-to-json': 'spreadsheet excel table convert import',
  'color-converter': 'colour hex rgb hsl picker',
  'case-converter': 'uppercase lowercase camelcase snake kebab title',
  'word-counter': 'characters count length reading time letters',
  'text-diff': 'compare difference changes diff',
  'lorem-ipsum-generator': 'placeholder dummy filler text',
  'slugify': 'slug url permalink seo',
  'markdown-to-html': 'md convert preview render',
  'regex-tester': 'regular expression regexp match pattern',
  'cron-expression-parser': 'crontab schedule job explain',
  'sql-formatter': 'query pretty print beautify database',
  'xml-formatter': 'pretty print beautify minify validate',
  'subnet-calculator': 'cidr ip ipv4 network mask netmask range',
};

/**
 * Every tool, as the page's search reads it (embedded in the page as JSON; no request). Landing pages come last, so on
 * a tie they rank after the tools ("compress" shows Compress video before the 20 KB page).
 */
export const SEARCH_INDEX: SearchEntry[] = [...TOOLS.filter((t) => !t.landingOf), ...TOOLS.filter((t) => t.landingOf)].map((t) => {
  const { zone, label } = placeOf(t.slug);
  // The first sentence of the subhead says what the tool does ("Combine PDF files into one document.").
  const blurb = t.subhead.match(/^[^.]*\./)?.[0] ?? t.subhead;
  return { slug: t.slug, name: t.h1, zone, label, words: WORDS[t.slug], blurb, icon: ICONS[t.slug] };
});
