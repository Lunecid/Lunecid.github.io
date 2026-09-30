// scripts/csp/finalize.mjs — csp-finalize (account-link AL-1, C0, spec §8.2). Astro's security.csp emits the
// hash-based <meta http-equiv="content-security-policy"> at the head injection point, i.e. AFTER the layouts' own
// is:inline scripts, and it hashes neither those is:inline blocks nor the font <style> text that font-subsets rewrites
// after the build. This post-build pass (after font-subsets, before legacy-redirects) recomputes the sha256 of every
// executable inline <script> and every <style> of each built page, replaces the hash list in the governing directives
// and moves the meta directly after <meta charset>. The legacy stubs are written later with their own meta.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const META_RE = /<meta\s+http-equiv="content-security-policy"\s+content="([^"]*)"\s*\/?>/gi;
const CHARSET_RE = /<meta charset="utf-8"\s*\/?>/i;
// One left-to-right scan over both raw-text elements, as the HTML parser reads them: whichever opens first owns its
// body up to its own end tag, so "<style>" text inside a script body (or "<script" inside a style) is never taken
// for an element.
const BLOCK_RE = /<script\b([^>]*)>([\s\S]*?)<\/script>|<style\b[^>]*>([\s\S]*?)<\/style>/gi;
const HASH_RE = /^'sha(256|384|512)-[^']*'$/;
/** Script types a browser executes (and so a CSP governs): hashed. */
const EXEC_TYPES = new Set(['', 'module', 'text/javascript', 'application/javascript']);
/** Data blocks that never run: skipped. Any other type throws (a new runnable type must not slip past unhashed). */
const DATA_TYPES = new Set(['application/ld+json', 'application/json']);

/** @param {string} s */
const decode = (s) => s.replace(/&#39;|&#x27;/gi, "'").replace(/&quot;|&#34;/g, '"').replace(/&amp;/g, '&');
/** @param {string} s */
const encode = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
/** @param {string} s */
const sha256 = (s) => `'sha256-${createHash('sha256').update(s, 'utf8').digest('base64')}'`;

/** @param {string} attrs @param {string} name @returns {string | null} the value ('' when bare), null when absent */
function attr(attrs, name) {
  const m = new RegExp(`(?:^|\\s)${name}(?:\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+)))?(?=\\s|$)`, 'i').exec(attrs);
  return m ? (m[1] ?? m[2] ?? m[3] ?? '') : null;
}

/**
 * @param {string} html
 * @param {string} [file] for error messages
 * @returns {{ scripts: string[], styles: string[] }} texts in source order
 */
export function inlineBlocks(html, file = 'page') {
  const scripts = [];
  const styles = [];
  for (const m of html.matchAll(BLOCK_RE)) {
    if (m[3] !== undefined) {
      styles.push(m[3]);
      continue;
    }
    const attrs = m[1] ?? '';
    if (attr(attrs, 'src') !== null) continue;
    const type = (attr(attrs, 'type') ?? '').trim().toLowerCase();
    if (DATA_TYPES.has(type)) continue;
    if (!EXEC_TYPES.has(type)) throw new Error(`csp-finalize: ${file} unknown script type "${type}"`);
    scripts.push(m[2] ?? '');
  }
  return { scripts, styles };
}

/**
 * @param {string[][]} directives [name, ...sources]
 * @param {'script' | 'style'} kind
 * @param {string[]} hashes
 */
function rehash(directives, kind, hashes) {
  for (const d of directives) {
    if ([`${kind}-src`, `${kind}-src-elem`].includes(d[0] ?? '')) d.splice(1, d.length - 1, ...d.slice(1).filter((s) => !HASH_RE.test(s)));
  }
  if (hashes.length === 0) return;
  const target = directives.find((d) => d[0] === `${kind}-src-elem`) ?? directives.find((d) => d[0] === `${kind}-src`);
  if (!target) throw new Error(`csp-finalize: the CSP meta has no ${kind}-src directive for ${hashes.length} inline block(s)`);
  target.push(...hashes);
}

/**
 * Pure and idempotent: the page with exactly one CSP meta directly after <meta charset="utf-8">, whose script/style
 * hash lists are exactly the current inline blocks (source order, de-duplicated). Pages without inline code and
 * without a meta are returned unchanged.
 * @param {string} html
 * @param {string} [file] for error messages
 * @returns {string}
 */
export function finalizeHtml(html, file = 'page') {
  const metas = [...html.matchAll(META_RE)];
  const { scripts, styles } = inlineBlocks(html, file);
  if (metas.length === 0) {
    if (scripts.length + styles.length > 0) throw new Error(`csp-finalize: ${file} has no CSP meta`);
    return html;
  }
  if (metas.length > 1) throw new Error(`csp-finalize: ${file} has ${metas.length} CSP metas`);
  const directives = decode(metas[0]?.[1] ?? '')
    .split(';')
    .map((part) => part.trim().split(/\s+/).filter(Boolean))
    .filter((d) => d.length > 0);
  rehash(directives, 'script', [...new Set(scripts.map(sha256))]);
  rehash(directives, 'style', [...new Set(styles.map(sha256))]);
  const meta = `<meta http-equiv="content-security-policy" content="${encode(directives.map((d) => d.join(' ')).join('; '))}">`;
  const without = html.replace(META_RE, '');
  const charset = CHARSET_RE.exec(without);
  if (!charset) throw new Error(`csp-finalize: ${file} has no <meta charset="utf-8">`);
  const at = charset.index + charset[0].length;
  return without.slice(0, at) + meta + without.slice(at);
}

/** @param {string} dir @returns {string[]} */
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));

/** @param {string} distDir @returns {{ pages: number, changed: number }} */
export function finalizeDir(distDir) {
  let pages = 0;
  let changed = 0;
  for (const file of walk(distDir).filter((f) => f.endsWith('.html'))) {
    pages++;
    const html = readFileSync(file, 'utf8');
    const out = finalizeHtml(html, relative(distDir, file));
    if (out !== html) {
      writeFileSync(file, out);
      changed++;
    }
  }
  return { pages, changed };
}

/** Astro integration; registered after font-subsets and before legacy-redirects in astro.config.mjs. */
export function cspFinalize() {
  return {
    name: 'csp-finalize',
    hooks: {
      /** @param {{ dir: URL, logger: { info(m: string): void } }} ctx */
      'astro:build:done': async ({ dir, logger }) => {
        const { pages, changed } = finalizeDir(fileURLToPath(dir));
        logger.info(`${changed} of ${pages} pages re-hashed, CSP meta first after <meta charset>`);
      },
    },
  };
}
