import { defineConfig } from 'astro/config';
import tailwind from "@astrojs/tailwind";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: 'https://lfdario.github.io/site-automation-pro/',
  base: '/site-automation-pro/',
  integrations: [tailwind(), sitemap()],
  output: 'static'
});