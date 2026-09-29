// @ts-check
import { defineConfig, fontProviders } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import { fontSubsets } from './scripts/fonts/build.mjs';
import { satteri } from '@astrojs/markdown-satteri';
import { baseLinksHastPlugin } from './scripts/markdown/rehype-base-links.mjs';

/** Print routes are PDF sources only: keep them out of the sitemap. @param {string} page absolute URL */
export function sitemapFilter(page) {
  return !new URL(page).pathname.startsWith('/print/');
}

/**
 * Final fix 2 item 20: the sitemap uses the page heads' hreflang scheme (src/lib/seo.ts alternateLinks): 'ko', 'en'
 * and 'x-default' → the Korean page. The integration's i18n option writes only the locale links, so x-default is
 * added here, next to them.
 * @param {import('@astrojs/sitemap').SitemapItem} item
 */
export function sitemapSerialize(item) {
  const ko = item.links?.find((link) => link.lang === 'ko');
  if (!item.links || !ko || item.links.some((link) => link.lang === 'x-default')) return item;
  return { ...item, links: [...item.links, { url: ko.url, lang: 'x-default' }] };
}

export default defineConfig({
  site: 'https://lunecid.github.io',
  trailingSlash: 'always',
  // P1-3 (R-5, A-5): Markdown links are base form; the plugin localizes shared pages and the chooser and fails the
  // build on a version link (a collection entry renders once for both versions). Astro 7's Markdown processor is
  // Sätteri, so the plugin is a Sätteri hast plugin (satteri() without options is Astro's default processor).
  markdown: { processor: satteri({ hastPlugins: [baseLinksHastPlugin] }) },
  compressHTML: true, // Astro 7 default 'jsx' drops spaces between inline elements (stack-core G1)
  // 'always': every page's CSS is inlined into <head> instead of <link rel="stylesheet">. Measured after the
  // batch 2 font subsetting (the @font-face rules are now a few hundred bytes): 22.2-42.9 KB of inline CSS per
  // page (6.0-9.2 KB gzipped; it was 72.5-93.2 KB before, not ~1 KB). 'auto' inlines 1.2-8.6 KB and links the
  // rest as up to two render-blocking stylesheets (BaseLayout 20 KB + the page view's). Lighthouse, 3 runs per
  // URL, six lighthouserc routes: mobile medians 'always' 0.92/0.95/0.94/0.95/0.97/0.97 vs 'auto'
  // 0.92/0.94/0.95/0.95/0.96/0.98 (/, /en/, /player-log/, /projects/, /records/, paper page), desktop 1.00
  // everywhere for both: a tie within run-to-run noise. 'always' stays: no render-blocking request on the
  // critical path (which weighs more on real high-RTT phones than in the simulation), and GitHub Pages' 10-minute
  // max-age leaves little cache benefit for a separate stylesheet.
  build: { format: 'directory', inlineStylesheets: 'always' },
  integrations: [
    react(),
    sitemap({ filter: sitemapFilter, serialize: sitemapSerialize, i18n: { defaultLocale: 'ko', locales: { ko: 'ko', en: 'en' } } }),
    fontSubsets(), // after the build: subset the page fonts to the characters of the built pages (batch 2)
  ],
  i18n: { defaultLocale: 'ko', locales: ['ko', 'en'], routing: { prefixDefaultLocale: false } },
  fonts: [
    {
      provider: fontProviders.local(),
      name: 'Pretendard Print',
      cssVariable: '--font-print',
      fallbacks: ['sans-serif'],
      options: {
        variants: [
          { weight: 400, style: 'normal', src: ['pretendard/dist/web/static/woff2/Pretendard-Regular.woff2'] },
          { weight: 600, style: 'normal', src: ['pretendard/dist/web/static/woff2/Pretendard-SemiBold.woff2'] },
          { weight: 700, style: 'normal', src: ['pretendard/dist/web/static/woff2/Pretendard-Bold.woff2'] },
        ],
      },
    },
    // Final fix 2 item 12: the local provider with the installed @fontsource/anton file, like Pretendard Print. The
    // npm provider rewrote the package's font URLs to cdn.jsdelivr.net, so every cold-cache build (first CI run, fresh
    // clone) downloaded Anton over the network and failed offline. Latin only: the membership card sets Latin text.
    {
      provider: fontProviders.local(),
      name: 'Anton',
      cssVariable: '--font-anton',
      fallbacks: ['Impact', 'sans-serif'],
      options: {
        variants: [
          {
            weight: 400,
            style: 'normal',
            src: ['@fontsource/anton/files/anton-latin-400-normal.woff2'],
            // @fontsource/anton/index.css, latin subset
            unicodeRange: ['U+0000-00FF', 'U+0131', 'U+0152-0153', 'U+02BB-02BC', 'U+02C6', 'U+02DA', 'U+02DC', 'U+0304', 'U+0308', 'U+0329', 'U+2000-206F', 'U+20AC', 'U+2122', 'U+2191', 'U+2193', 'U+2212', 'U+2215', 'U+FEFF', 'U+FFFD'],
          },
        ],
      },
    },
  ],
});
