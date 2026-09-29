// scripts/markdown/rehype-base-links.mjs — Markdown internal links (base form) → localized paths (R-5, A-5).
// A collection entry renders once for both versions, so Markdown may link only shared pages, the chooser and the
// document PDFs; a version page link or an unknown path fails the build. The language comes from the entry's locale
// folder (src/content/<collection>/ko|en/…; none → ko). Plain Node: imports only node:url and plain-Node-safe .ts files.
// Astro 7 renders Markdown with Sätteri (no unified/rehype pipeline), so astro.config.mjs registers
// `baseLinksHastPlugin`, the same rewrite as a Sätteri hast plugin; `rehypeBaseLinks` stays for plain hast trees.
import { fileURLToPath } from 'node:url';
import { DOCUMENTS } from '../../src/config.ts';
import { anchorsFor, chooserRoute, routePath } from '../../src/lib/routes.ts';
import { SHARED_PATHS } from '../../src/variants/ids.ts';

const DOCUMENT_HREFS = Object.values(DOCUMENTS);

/**
 * @param {string} href
 * @param {'ko' | 'en'} lang
 * @returns {string}
 */
export function markdownHref(href, lang) {
  if (!href.startsWith('/') || href.startsWith('//')) return href;
  const hashAt = href.indexOf('#');
  const path = hashAt === -1 ? href : href.slice(0, hashAt);
  const hash = hashAt === -1 ? null : href.slice(hashAt + 1);
  if (DOCUMENT_HREFS.includes(path) && hash === null) return href;
  if (SHARED_PATHS.includes(path) && (hash === null || anchorsFor(path, null).includes(hash))) return routePath(href, lang, null);
  if (path === '/' && hash === null) return chooserRoute(lang);
  throw new Error(
    `rehype-base-links: "${href}" in a ${lang} Markdown entry is not a shared page, the chooser or a document (Markdown cannot link a version page: an entry renders once for both versions)`,
  );
}

/**
 * @param {{ path?: string, history?: string[] } | undefined} file
 * @returns {'ko' | 'en'}
 */
export function langOfFile(file) {
  const path = (file?.path ?? file?.history?.[0] ?? '').replace(/\\/g, '/');
  return /\/src\/content\/[^/]+\/en\//.test(path) ? 'en' : 'ko';
}

/** @param {any} node @param {'ko' | 'en'} lang */
function walk(node, lang) {
  if (node && node.type === 'element' && node.tagName === 'a' && typeof node.properties?.href === 'string') {
    node.properties.href = markdownHref(node.properties.href, lang);
  }
  for (const child of node?.children ?? []) walk(child, lang);
}

/** Rehype plugin: `markdown: { rehypePlugins: [rehypeBaseLinks] }` in astro.config.mjs. */
export default function rehypeBaseLinks() {
  /** @param {any} tree @param {any} file */
  return (tree, file) => walk(tree, langOfFile(file));
}

/** Sätteri hast plugin (Astro 7's Markdown processor): `satteri({ hastPlugins: [baseLinksHastPlugin] })`. */
export const baseLinksHastPlugin = {
  name: 'base-links',
  element: {
    filter: ['a'],
    /** @param {any} node @param {{ fileURL: URL | undefined, setProperty(node: any, key: string, value: unknown): void }} ctx */
    visit(node, ctx) {
      const href = node.properties?.href;
      if (typeof href !== 'string') return;
      const lang = langOfFile({ path: ctx.fileURL ? fileURLToPath(ctx.fileURL) : undefined });
      const next = markdownHref(href, lang);
      if (next !== href) ctx.setProperty(node, 'href', next);
    },
  },
};
