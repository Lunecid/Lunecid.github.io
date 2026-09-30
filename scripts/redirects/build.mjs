// scripts/redirects/build.mjs — legacy redirect stubs (R-6, contract §2.4, A-6). Every old game HTML URL (the published
// version before the move) gets a static page that forwards to the same base under /game/, keeping the #hash. Written
// at astro:build:done by the LAST integration, after the sitemap and the font subsetting, so stubs are in neither.
// Title, description and og:image come from the BUILT target page (no page meta import into plain Node).
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE } from '../../src/config.ts';
import { legacyRedirects } from '../../src/lib/routes.ts';

export const STUB_MARKER = 'data-legacy-redirect';

/** @param {string} s */
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** @param {string} s */
const decode = (s) => s.replace(/&#34;|&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

const BODY = {
  /** @param {string} to */ ko: (to) => `<p>이 페이지는 새 주소로 옮겼습니다. <a href="${esc(to)}">새 주소로 가기</a></p>`,
  /** @param {string} to */ en: (to) => `<p>This page has moved. <a href="${esc(to)}">Go to the new address</a></p>`,
};

/**
 * AL-1 (C0): the stub's own policy — nothing but its one forwarding script (by hash) and the icons. Stubs are written
 * after csp-finalize, so they carry this meta themselves.
 * @param {string} script the exact text of the stub's inline script
 * @returns {string}
 */
export function stubCsp(script) {
  const hash = createHash('sha256').update(script, 'utf8').digest('base64');
  return `default-src 'none'; script-src 'sha256-${hash}'; img-src 'self'; base-uri 'none'; form-action 'none'`;
}

/**
 * @typedef {{ from: string, to: string, lang: 'ko' | 'en', title: string, description: string, ogImage: string, siteUrl: string }} StubInput
 * @param {StubInput} input
 * @returns {string}
 */
export function stubHtml({ to, lang, title, description, ogImage, siteUrl }) {
  const canonical = `${siteUrl}${to}`;
  const script = `location.replace(${JSON.stringify(to)} + location.hash)`;
  return [
    `<!doctype html><html lang="${lang}" ${STUB_MARKER}><head>`,
    '<meta charset="utf-8">',
    `<meta http-equiv="content-security-policy" content="${esc(stubCsp(script))}">`,
    `<script>${script}</script>`,
    `<meta http-equiv="refresh" content="0; url=${esc(to)}">`,
    `<link rel="canonical" href="${esc(canonical)}">`,
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    `<meta property="og:url" content="${esc(canonical)}">`,
    `<meta property="og:image" content="${esc(ogImage)}">`,
    '<meta name="twitter:card" content="summary_large_image">',
    '<link rel="icon" href="/favicon.ico" sizes="32x32">',
    '<link rel="icon" type="image/svg+xml" href="/favicon.svg">',
    '<link rel="apple-touch-icon" href="/apple-touch-icon.png">',
    `</head><body>${BODY[lang](to)}</body></html>`,
    '',
  ].join('\n');
}

/** @param {string} html @param {RegExp} re @param {string} what @param {string} file */
function pick(html, re, what, file) {
  const m = re.exec(html);
  if (!m) throw new Error(`legacy-redirects: ${file} has no ${what}`);
  return decode(m[1] ?? '');
}

/** @param {string} distDir @param {string} route */
const fileOf = (distDir, route) => join(distDir, ...route.split('/').filter(Boolean), 'index.html');

/**
 * @param {string} distDir
 * @param {{ warn(msg: string): void, redirects?: import('../../src/lib/routes.ts').LegacyRedirect[] }} opts
 * @returns {Promise<import('../../src/lib/routes.ts').LegacyRedirect[]>}
 */
export async function writeStubs(distDir, opts) {
  const redirects = opts.redirects ?? legacyRedirects();
  const written = [];
  for (const r of redirects) {
    const target = fileOf(distDir, r.to);
    if (!existsSync(target)) throw new Error(`legacy-redirects: target ${r.to} was not built (${target})`);
    const out = fileOf(distDir, r.from);
    if (existsSync(out)) throw new Error(`legacy-redirects: ${r.from} already exists in ${distDir}; a stub never overwrites a page`);
    const html = readFileSync(target, 'utf8');
    const title = pick(html, /<title>([^<]*)<\/title>/, '<title>', target);
    const description = pick(html, /<meta name="description" content="([^"]*)"/, 'meta description', target);
    const ogImage = pick(html, /<meta property="og:image" content="([^"]*)"/, 'og:image', target);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, stubHtml({ ...r, title, description, ogImage, siteUrl: SITE.url }));
    written.push(r);
  }
  if (written.length === 0) opts.warn('legacy-redirects: no stub was written');
  return written;
}

/** Astro integration; registered LAST in astro.config.mjs (after sitemap and font-subsets). */
export function legacyRedirectStubs() {
  return {
    name: 'legacy-redirects',
    hooks: {
      /** @param {{ dir: URL, logger: { info(m: string): void, warn(m: string): void } }} ctx */
      'astro:build:done': async ({ dir, logger }) => {
        const written = await writeStubs(fileURLToPath(dir), { warn: (m) => logger.warn(m) });
        logger.info(`${written.length} legacy redirect stubs`);
      },
    },
  };
}
