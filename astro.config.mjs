import { defineConfig, passthroughImageService } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://loghry.org',
  output: 'static',
  // the 404 page is not a destination
  integrations: [sitemap({ filter: (page) => !page.includes('404') })],
  // images are baked offline (bake/); nothing is resized at build time, so no native image library is needed
  image: { service: passthroughImageService() },
  build: { inlineStylesheets: 'never' },
  // never inline assets as data: URIs, so the content security policy can stay 'self'-only
  vite: { build: { assetsInlineLimit: 0 } },
});
