// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  output: 'static',
  site: 'https://web-tools.pages.dev',
  trailingSlash: 'always',
  integrations: [sitemap()],
  vite: {
    // The engine worker is a module worker. 'es' lets it code-split, so each codec stays its own
    // dynamically imported chunk; the default 'iife' inlines every codec (2+ MB) into the worker file.
    worker: { format: 'es' },
  },
});
