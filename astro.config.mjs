import { defineConfig } from 'astro/config';

const base = process.env.BASE_PATH || '/';

export default defineConfig({
  site: process.env.SITE_URL || 'https://scd-ku.github.io',
  base,
  trailingSlash: 'always'
});
