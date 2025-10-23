import { defineConfig } from 'astro/config';
import tailwind from "@astrojs/tailwind";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: 'https://lfdario.github.io/motori/', // ✅
  base: '/motori/',                          // ✅
  integrations: [tailwind(), sitemap()],
  output: 'static'
});
