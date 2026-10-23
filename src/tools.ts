export type ToolSlug =
  | 'heic-to-jpg'
  | 'compress-image'
  | 'webp-to-jpg'
  | 'merge-pdf'
  | 'split-pdf'
  | 'json-formatter'
  | 'base64-encode-decode'
  | 'jwt-decoder'
  | 'qr-code-generator';
export type ImageSlug = 'heic-to-jpg' | 'compress-image' | 'webp-to-jpg';
export type Category = 'image' | 'pdf' | 'developer' | 'qr';
export type OutFormat = 'jpg' | 'png' | 'webp';
export type InType = 'heic' | 'jpg' | 'png' | 'webp';

interface ToolBase {
  slug: ToolSlug;
  category: Category;
  title: string;
  description: string;
  h1: string;
  subhead: string;
  howTo: [string, string, string];
  faq: { q: string; a: string }[];
  related: ToolSlug[];
}

export type ImageTool = ToolBase & {
  kind: 'image';
  slug: ImageSlug;
  accepts: InType[];
  acceptAttr: string; // value for <input accept>
  outputs: OutFormat[] | 'same'; // 'same' = keep input format
  defaults: { format?: OutFormat; quality: number };
  emptyCopy: string;
};
export type PdfTool = ToolBase & { kind: 'pdf'; op: 'merge' | 'split' };
export type TextTool = ToolBase & { kind: 'text'; transform: 'json' | 'base64' | 'jwt' };
export type QrTool = ToolBase & { kind: 'qr' };
export type Tool = ImageTool | PdfTool | TextTool | QrTool;

export const CATEGORY_LABEL: Record<Category, string> = {
  image: 'Image',
  pdf: 'PDF',
  developer: 'Developer',
  qr: 'QR code',
};

const IMAGE_TOOLS: ImageTool[] = [
  {
    kind: 'image',
    category: 'image',
    slug: 'heic-to-jpg',
    title: 'HEIC to JPG Converter - Free, Private, No Upload',
    description:
      'Convert iPhone HEIC photos to JPG in your browser. Nothing is uploaded, location data is removed, and it works on many photos at once. Free, no sign-up.',
    h1: 'HEIC to JPG',
    subhead: 'Convert iPhone photos to JPG that opens anywhere. Nothing leaves your device.',
    accepts: ['heic'],
    acceptAttr: '.heic,.heif,image/heic,image/heif',
    outputs: ['jpg'],
    defaults: { format: 'jpg', quality: 85 },
    emptyCopy: 'Drop HEIC photos here',
    howTo: [
      'Drop your HEIC photos onto the page, or choose them from your device.',
      'Wait a moment while each photo is converted on your device.',
      'Download each JPG, or download them all in one ZIP file.',
    ],
    faq: [
      {
        q: 'Are my photos uploaded anywhere?',
        a: 'No. The conversion runs entirely in your browser. Your photos never leave your device, and no file names or pixels are sent to a server.',
      },
      {
        q: 'What is a HEIC file?',
        a: 'HEIC is the photo format iPhones use by default. It keeps files small, but many apps, websites and Windows PCs cannot open it without extra software.',
      },
      {
        q: 'Will converting reduce the quality?',
        a: 'JPG is a lossy format, so there is a small change. We use quality 85, which keeps photos looking the same to the eye while staying much smaller than a lossless file.',
      },
      {
        q: 'Is my location data kept?',
        a: 'No. Each JPG is built from the image pixels alone, so GPS location and other metadata are not copied over. This makes the photos safer to share.',
      },
      {
        q: 'Can I convert many photos at once?',
        a: 'Yes. Drop as many as you like. They are converted one at a time to keep your device responsive, and you can download them together as a ZIP.',
      },
    ],
    related: ['compress-image', 'webp-to-jpg', 'merge-pdf'],
  },
  {
    kind: 'image',
    category: 'image',
    slug: 'compress-image',
    title: 'Compress Image - Shrink JPG, PNG and WebP Privately',
    description:
      'Make JPG, PNG and WebP images smaller without uploading them. Pick the quality, see the size saved, and download. Free, private and fast in your browser.',
    h1: 'Compress image',
    subhead: 'Make JPG, PNG and WebP files smaller. Your images stay on your device.',
    accepts: ['jpg', 'png', 'webp'],
    acceptAttr: '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp',
    outputs: 'same',
    defaults: { quality: 75 },
    emptyCopy: 'Drop images here',
    howTo: [
      'Drop your JPG, PNG or WebP images onto the page, or choose them from your device.',
      'Adjust the quality if you want a smaller or sharper result.',
      'Download each compressed image, or download them all in one ZIP file.',
    ],
    faq: [
      {
        q: 'Are my images uploaded anywhere?',
        a: 'No. Compression runs entirely in your browser. Your images never leave your device, and no file names or pixels are sent to a server.',
      },
      {
        q: 'How much smaller will my images get?',
        a: 'It depends on the image. Photos often shrink by half or more at the default quality of 75. We show the before and after size for every file.',
      },
      {
        q: 'Does compressing a PNG lose quality?',
        a: 'No. PNG files are compressed losslessly at 8 bits per channel, so they look exactly the same. The quality slider only applies to JPG and WebP images.',
      },
      {
        q: 'What quality should I choose?',
        a: 'The default of 75 suits most web and email use. Go higher for photos you plan to print or edit later, and lower when file size matters most.',
      },
      {
        q: 'Is image metadata removed?',
        a: "Yes, whenever we re-encode the image. If we can't make a file smaller, we give you back your original file unchanged, including its metadata, and we won't show \"Location data removed\".",
      },
    ],
    related: ['heic-to-jpg', 'webp-to-jpg', 'merge-pdf'],
  },
  {
    kind: 'image',
    category: 'image',
    slug: 'webp-to-jpg',
    title: 'WebP to JPG or PNG Converter - Free, No Upload',
    description:
      'Convert WebP images to JPG or PNG in your browser. Nothing is uploaded, and you can convert many files at once. Free, private, and no sign-up needed.',
    h1: 'WebP to JPG or PNG',
    subhead: 'Turn WebP images into JPG or PNG files that work everywhere. Nothing is uploaded.',
    accepts: ['webp'],
    acceptAttr: '.webp,image/webp',
    outputs: ['jpg', 'png'],
    defaults: { format: 'jpg', quality: 85 },
    emptyCopy: 'Drop WebP images here',
    howTo: [
      'Drop your WebP images onto the page, or choose them from your device.',
      'Pick JPG for smaller files, or PNG to keep transparency.',
      'Download each converted image, or download them all in one ZIP file.',
    ],
    faq: [
      {
        q: 'Are my images uploaded anywhere?',
        a: 'No. The conversion runs entirely in your browser. Your images never leave your device, and no file names or pixels are sent to a server.',
      },
      {
        q: 'Should I choose JPG or PNG?',
        a: 'Choose JPG for photos and the smallest files. Choose PNG if the image has transparency or sharp graphics such as logos and screenshots.',
      },
      {
        q: 'What happens to transparent areas in JPG?',
        a: 'JPG cannot store transparency, so transparent areas become white. Use the PNG option to keep them see-through.',
      },
      {
        q: 'Why would I convert WebP at all?',
        a: 'Some editors, email clients, print services and older devices cannot open WebP. JPG and PNG open almost everywhere.',
      },
      {
        q: 'Can I convert many images at once?',
        a: 'Yes. Drop as many as you like. They are converted one at a time, and you can download them together as a ZIP.',
      },
    ],
    related: ['compress-image', 'heic-to-jpg', 'qr-code-generator'],
  },
];

const OTHER_TOOLS: (PdfTool | TextTool | QrTool)[] = [
  {
    kind: 'pdf',
    op: 'merge',
    category: 'pdf',
    slug: 'merge-pdf',
    title: 'Merge PDF - Combine PDF Files Privately, No Upload',
    description:
      'Combine several PDF files into one in your browser. Nothing is uploaded, you choose the order, and it is free with no sign-up. Works on phones and laptops.',
    h1: 'Merge PDF',
    subhead: 'Combine PDF files into one document. Your files never leave your device.',
    howTo: [
      'Drop your PDF files onto the page, or choose them from your device.',
      'Put them in the order you want with the up and down buttons, and remove any you do not need.',
      'Select Merge PDFs, then download the combined file.',
    ],
    faq: [
      {
        q: 'Are my PDFs uploaded anywhere?',
        a: 'No. Merging runs entirely in your browser. Your files, their names and their contents never leave your device and are never sent to a server.',
      },
      {
        q: 'Can I choose the order of the pages?',
        a: 'Yes. Files are merged in the order shown in the list, and you can move any file up or down before you merge. All pages of each file are kept in their original order.',
      },
      {
        q: 'Why can I not merge a password-protected PDF?',
        a: 'We cannot read the pages of an encrypted file, and we will not bypass the protection. Remove the password in the app you created it with, then try again.',
      },
      {
        q: 'Is there a limit on file size or number of files?',
        a: 'There is no fixed limit. Your device does the work, so very large files or hundreds of pages at once may be slow on older phones.',
      },
      {
        q: 'Will merging change how my pages look?',
        a: 'No. Pages are copied as they are, without being re-rendered or compressed, so text and images look the same. Bookmarks and form fields may not carry over.',
      },
    ],
    related: ['split-pdf', 'compress-image'],
  },
  {
    kind: 'pdf',
    op: 'split',
    category: 'pdf',
    slug: 'split-pdf',
    title: 'Split PDF - Extract Pages Privately, No Upload',
    description:
      'Split a PDF into single pages or extract the pages you need, right in your browser. Nothing is uploaded. Free, private and no sign-up required.',
    h1: 'Split PDF',
    subhead: 'Pull pages out of a PDF, or split it into one file per page. Nothing is uploaded.',
    howTo: [
      'Drop a PDF onto the page, or choose one from your device.',
      'Choose every page as a separate file, or type the pages to extract, like 1-3, 5.',
      'Select Split PDF, then download the result.',
    ],
    faq: [
      {
        q: 'Is my PDF uploaded anywhere?',
        a: 'No. Splitting runs entirely in your browser. Your file, its name and its contents never leave your device and are never sent to a server.',
      },
      {
        q: 'How do I write the pages to extract?',
        a: 'Use commas and dashes, like 1-3, 5. A dash with no end, like 7-, means from page 7 to the last page. A dash with no start, like -4, means pages 1 to 4.',
      },
      {
        q: 'What do I get when I split every page?',
        a: 'One PDF per page, named after your file, bundled into a single ZIP so you only download once.',
      },
      {
        q: 'Why can I not split a password-protected PDF?',
        a: 'We cannot read the pages of an encrypted file, and we will not bypass the protection. Remove the password in the app you created it with, then try again.',
      },
      {
        q: 'Will the pages look the same?',
        a: 'Mostly. Pages are copied as they are, without being re-rendered or compressed, so text and images look the same. Bookmarks and form fields may not carry over.',
      },
    ],
    related: ['merge-pdf', 'compress-image'],
  },
  {
    kind: 'text',
    transform: 'json',
    category: 'developer',
    slug: 'json-formatter',
    title: 'JSON Formatter and Validator - Private, Runs in Browser',
    description:
      'Format, validate and minify JSON in your browser. Errors show the exact line and column. Your data is never uploaded. Free, fast and no sign-up needed.',
    h1: 'JSON formatter',
    subhead: 'Format, validate and minify JSON. Your data stays in this tab.',
    howTo: [
      'Paste your JSON into the box.',
      'Choose 2 spaces, 4 spaces or tab for indentation.',
      'Select Format or Minify, then copy the result.',
    ],
    faq: [
      {
        q: 'Is my JSON sent to a server?',
        a: 'No. Formatting happens in your browser and nothing you paste is sent anywhere, which makes it safe for tokens, config files and customer data.',
      },
      {
        q: 'How do I find the error in invalid JSON?',
        a: 'We show the line and column where parsing failed, with that line highlighted. Common causes are trailing commas, single quotes and missing quotes around keys.',
      },
      {
        q: 'What is the difference between Format and Minify?',
        a: 'Format adds line breaks and indentation so people can read it. Minify removes all unnecessary spaces so the JSON is as small as possible.',
      },
      {
        q: 'Does it change my data?',
        a: 'Formatting only changes whitespace, with three exceptions: very large numbers lose precision, duplicate keys keep only the last value, and numeric keys such as "1" move to the front.',
      },
      {
        q: 'How large a file can I format?',
        a: 'Several megabytes work fine. Above 5 MB we warn you that it may take a moment, since your device is doing the work.',
      },
    ],
    related: ['base64-encode-decode', 'jwt-decoder', 'qr-code-generator'],
  },
  {
    kind: 'text',
    transform: 'base64',
    category: 'developer',
    slug: 'base64-encode-decode',
    title: 'Base64 Encode and Decode - Private, Runs in Browser',
    description:
      'Encode text to Base64 or decode Base64 to text in your browser. Handles Unicode and URL-safe Base64. Nothing is uploaded. Free and no sign-up needed.',
    h1: 'Base64 encode and decode',
    subhead: 'Convert text to Base64 and back. Nothing you type leaves this tab.',
    howTo: [
      'Type or paste text in the Text box, or paste Base64 in the Base64 box.',
      'The other box updates as you type. Turn on URL-safe if you need it.',
      'Copy the result.',
    ],
    faq: [
      {
        q: 'Is my text sent to a server?',
        a: 'No. Encoding and decoding happen in your browser and nothing you type or paste is sent anywhere.',
      },
      {
        q: 'Does it work with emoji and non-English text?',
        a: 'Yes. Text is converted as UTF-8, so accents, other scripts and emoji survive a round trip unchanged.',
      },
      {
        q: 'What does URL-safe mean?',
        a: 'URL-safe Base64 swaps the plus and slash characters for a dash and an underscore and leaves out the trailing equals signs, so it can sit in a web address or a JWT.',
      },
      {
        q: 'Why does it say my Base64 is not valid?',
        a: 'Base64 only uses letters, numbers, plus, slash and equals signs, and its length has to fit. A stray character or a cut-off string is the usual cause.',
      },
      {
        q: 'Is Base64 a form of encryption?',
        a: 'No. Anyone can decode it, so do not use it to hide secrets. It only makes data safe to carry through systems that expect plain text.',
      },
    ],
    related: ['json-formatter', 'jwt-decoder', 'qr-code-generator'],
  },
  {
    kind: 'text',
    transform: 'jwt',
    category: 'developer',
    slug: 'jwt-decoder',
    title: 'JWT Decoder - Read Tokens Privately, No Upload',
    description:
      'Decode a JWT to read its header, payload and expiry in your browser. Your token never leaves the page and is not verified. Free, with no sign-up needed.',
    h1: 'JWT decoder',
    subhead: 'Read the header and payload of a JSON Web Token. Your token never leaves this page.',
    howTo: [
      'Paste your JWT into the box.',
      'Read the header and payload, and check when the token expires.',
      'Copy either part if you need it.',
    ],
    faq: [
      {
        q: 'Is my token sent to a server?',
        a: 'No. Decoding happens in your browser and your token is never sent anywhere. Even so, avoid pasting live production tokens into any tool you do not trust.',
      },
      {
        q: 'Does this verify the signature?',
        a: 'No. It only decodes the token. Verifying a signature needs the secret or public key, and a decoded token is not proof that it is genuine.',
      },
      {
        q: 'What are exp, iat and nbf?',
        a: 'They are times in seconds since 1970. exp is when the token expires, iat is when it was issued, and nbf is the time before which it must not be accepted.',
      },
      {
        q: 'Why does it say this is not a JWT?',
        a: 'A JWT has three parts separated by dots, and the first two must decode to JSON. A cut-off token or one with extra text around it will fail.',
      },
      {
        q: 'Can anyone read what is in my JWT?',
        a: 'Yes. The header and payload are only encoded, not encrypted, so never put secrets in them. That is why a decoder like this works at all.',
      },
    ],
    related: ['json-formatter', 'base64-encode-decode', 'qr-code-generator'],
  },
  {
    kind: 'qr',
    category: 'qr',
    slug: 'qr-code-generator',
    title: 'QR Code Generator - Free, Private, No Tracking',
    description:
      'Make a QR code from any text or link in your browser. Download it as PNG or SVG. Nothing is uploaded, nothing is tracked, and it never expires. Free.',
    h1: 'QR code generator',
    subhead: 'Turn text or a link into a QR code. Made on your device, nothing is tracked.',
    howTo: [
      'Type or paste your text or link.',
      'Choose the error correction level and the size you want.',
      'Download the code as a PNG or an SVG.',
    ],
    faq: [
      {
        q: 'Is my text sent to a server?',
        a: 'No. The code is drawn in your browser, so the text or link you enter is never uploaded or stored anywhere.',
      },
      {
        q: 'Will the QR code expire?',
        a: 'No. It is a static code: the text is stored in the pattern itself. It works forever, with no tracking and no account needed.',
      },
      {
        q: 'What is error correction?',
        a: 'It lets a code still scan when part of it is dirty or covered. Higher levels survive more damage but fit less text. M is a good default.',
      },
      {
        q: 'Should I download PNG or SVG?',
        a: 'Use PNG for screens and documents. Use SVG for print, since it stays sharp at any size and can be scaled without blur.',
      },
      {
        q: 'How much text can a QR code hold?',
        a: 'Up to a few thousand characters, less at higher error correction. If your text is too long, we tell you the limit for the level you picked.',
      },
    ],
    related: ['json-formatter', 'base64-encode-decode', 'heic-to-jpg'],
  },
];

export const TOOLS: Tool[] = [...IMAGE_TOOLS, ...OTHER_TOOLS];

export function getTool(slug: ToolSlug): Tool {
  const tool = TOOLS.find((t) => t.slug === slug);
  if (!tool) throw new Error(`Unknown tool: ${slug}`);
  return tool;
}

export function getImageTool(slug: ImageSlug): ImageTool {
  const tool = getTool(slug);
  if (tool.kind !== 'image') throw new Error(`Not an image tool: ${slug}`);
  return tool;
}

export function toolForType(t: InType): ImageSlug {
  switch (t) {
    case 'heic':
      return 'heic-to-jpg';
    case 'webp':
      return 'webp-to-jpg';
    case 'jpg':
    case 'png':
      return 'compress-image';
  }
}
