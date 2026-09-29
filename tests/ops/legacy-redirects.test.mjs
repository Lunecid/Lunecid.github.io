// Review Focus 4 (P1-13): every old game URL is a stub that forwards to /game/…, the stubs never replace a route, stay
// out of the sitemap and are never linked; checked in dist and, when present, in dist-no-art. Run after npm run build.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { SITE } from '../../src/config.ts';
import { allRoutes, legacyRedirects } from '../../src/lib/routes.ts';

const DIRS = [process.env.DIST_DIR ?? 'dist', 'dist-no-art'].filter((dir, i) => i === 0 || existsSync(join(dir, 'index.html')));
const MARKER = 'data-legacy-redirect';
const fileOf = (dist, route) => join(dist, ...route.split('/').filter(Boolean), 'index.html');
/** @param {string} dir @returns {string[]} */
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
const meta = (html, re) => re.exec(html)?.[1] ?? null;

for (const DIST of DIRS) {
  test(`${DIST}: every legacy URL is a stub with the pinned head order, pointing at the built /game/ page`, () => {
    assert.ok(existsSync(join(DIST, 'index.html')), `${DIST} missing: run npm run build first`);
    const problems = [];
    for (const r of legacyRedirects()) {
      const file = fileOf(DIST, r.from);
      if (!existsSync(file)) { problems.push(`${r.from}: no stub`); continue; }
      const html = readFileSync(file, 'utf8');
      const target = readFileSync(fileOf(DIST, r.to), 'utf8');
      if (!html.includes(MARKER)) problems.push(`${r.from}: no ${MARKER}`);
      const order = ['<meta charset="utf-8">', `location.replace(${JSON.stringify(r.to)} + location.hash)`, `<meta http-equiv="refresh" content="0; url=${r.to}">`, `<link rel="canonical" href="${SITE.url}${r.to}">`].map((n) => html.indexOf(n));
      if (order.some((i) => i < 0) || order.some((i, k) => k > 0 && i < order[k - 1])) problems.push(`${r.from}: head order ${order.join(',')}`);
      if (html.includes('noindex')) problems.push(`${r.from}: noindex`);
      if (meta(html, /<meta property="og:image" content="([^"]*)"/) !== meta(target, /<meta property="og:image" content="([^"]*)"/)) problems.push(`${r.from}: og:image differs from ${r.to}`);
      if (meta(html, /<title>([^<]*)<\/title>/) !== meta(target, /<title>([^<]*)<\/title>/)) problems.push(`${r.from}: title differs from ${r.to}`);
      if (!html.includes(`<html lang="${r.lang}"`)) problems.push(`${r.from}: lang`);
      for (const absent of ['goatcounter', '@font-face', '<style', 'stylesheet']) if (html.includes(absent)) problems.push(`${r.from}: carries ${absent}`);
    }
    assert.deepEqual(problems, [], problems.join('\n'));
  });

  test(`${DIST}: no stub replaces a route; stubs are not in the sitemap; no page links a stub`, () => {
    const routes = new Set(allRoutes());
    for (const r of legacyRedirects()) assert.ok(!routes.has(r.from), `${r.from} is also a route`);
    for (const route of allRoutes()) assert.ok(!readFileSync(fileOf(DIST, route), 'utf8').includes(MARKER), `${route} was overwritten by a stub`);
    const sitemap = readFileSync(join(DIST, 'sitemap-0.xml'), 'utf8');
    for (const r of legacyRedirects()) assert.ok(!sitemap.includes(`<loc>${SITE.url}${r.from}</loc>`), `${r.from} in the sitemap`);
    const froms = legacyRedirects().map((r) => r.from);
    const linked = [];
    for (const file of walk(DIST).filter((f) => f.endsWith('.html'))) {
      const html = readFileSync(file, 'utf8');
      if (html.includes(MARKER)) continue;
      for (const from of froms) if (html.includes(`href="${from}"`) || html.includes(`href="${from}#`)) linked.push(`${relative(DIST, file).split(sep).join('/')} → ${from}`);
    }
    assert.deepEqual(linked, [], linked.join('\n'));
  });
}
