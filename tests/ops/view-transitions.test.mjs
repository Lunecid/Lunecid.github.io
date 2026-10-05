// Page transitions (motion audit V1): every site page (a <html data-variant>: game, data and neutral pages) carries the
// @view-transition opt-in of base.css in its inlined CSS; print pages, the legacy redirect stubs and the utility page
// (/link-return/) import no layout sheet and must not. Reads dist/ (DIST_DIR to override); skips when the site is not
// built. Run after `npm run build`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const DIST = process.env.DIST_DIR ?? 'dist';
const notBuilt = !existsSync(join(DIST, 'index.html'));
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
const styleText = (html) => [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
const OPT_IN = /@view-transition\s*\{\s*navigation\s*:\s*auto\s*;\s*types\s*:\s*page\s*;?\s*\}/;

test('every site page carries the @view-transition opt-in in its inline CSS; print pages, legacy stubs and utility pages do not', { skip: notBuilt }, () => {
  const pages = walk(DIST)
    .filter((f) => f.endsWith('.html'))
    .map((f) => {
      const html = readFileSync(f, 'utf8');
      const tag = /<html\b[^>]*>/.exec(html)?.[0] ?? '';
      return { path: relative(DIST, f).split(sep).join('/'), site: /\bdata-variant="(game|data|neutral)"/.test(tag), tag, css: styleText(html) };
    });
  const site = pages.filter((p) => p.site);
  const other = pages.filter((p) => !p.site);
  assert.ok(site.length >= 30, `only ${site.length} site pages in dist`);
  for (const kind of ['data-page="print"', 'data-legacy-redirect', 'data-utility-page']) {
    assert.ok(other.some((p) => p.tag.includes(kind)), `no ${kind} page in dist`);
  }
  assert.deepEqual(site.filter((p) => !OPT_IN.test(p.css)).map((p) => p.path), [], 'site pages without the opt-in');
  assert.deepEqual(other.filter((p) => /@view-transition/.test(p.css)).map((p) => p.path), [], 'non-site pages with the opt-in');
});
