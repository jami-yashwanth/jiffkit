// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// The canonical origin: used for canonical links, the sitemap and robots.txt. Production builds on Cloudflare Pages
// must say which domain they serve, or every canonical would point at the placeholder.
if (process.env.CF_PAGES && !process.env.SITE_URL) {
  throw new Error('Set SITE_URL in Cloudflare Pages env (for example https://example.com)');
}

export default defineConfig({
  output: 'static',
  site: process.env.SITE_URL || 'https://web-tools.pages.dev',
  trailingSlash: 'always',
  integrations: [sitemap()],
  vite: {
    // The engine worker is a module worker. 'es' lets it code-split, so each codec stays its own
    // dynamically imported chunk; the default 'iife' inlines every codec (2+ MB) into the worker file.
    worker: { format: 'es' },
  },
});
