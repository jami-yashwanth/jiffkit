export type ToolSlug = 'heic-to-jpg' | 'compress-image' | 'webp-to-jpg';
export type OutFormat = 'jpg' | 'png' | 'webp';
export type InType = 'heic' | 'jpg' | 'png' | 'webp';

export interface Tool {
  slug: ToolSlug;
  title: string;
  description: string;
  h1: string;
  subhead: string;
  accepts: InType[];
  acceptAttr: string; // value for <input accept>
  outputs: OutFormat[] | 'same'; // 'same' = keep input format
  defaults: { format?: OutFormat; quality: number };
  emptyCopy: string;
  howTo: [string, string, string];
  faq: { q: string; a: string }[];
  related: ToolSlug[];
}

export const TOOLS: Tool[] = [
  {
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
    related: ['compress-image', 'webp-to-jpg'],
  },
  {
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
    related: ['heic-to-jpg', 'webp-to-jpg'],
  },
  {
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
    related: ['compress-image', 'heic-to-jpg'],
  },
];

export function getTool(slug: ToolSlug): Tool {
  const tool = TOOLS.find((t) => t.slug === slug);
  if (!tool) throw new Error(`Unknown tool: ${slug}`);
  return tool;
}

export function toolForType(t: InType): ToolSlug {
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
