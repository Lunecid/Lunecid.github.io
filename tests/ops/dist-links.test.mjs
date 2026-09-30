// Review Focus 1: internal links that bypass pageHref. Every built page (redirect stubs and print pages aside), in any
// attribute, inline script or island prop: no old-form target (/research/…, /projects/…, /records/…, /player-log/…), and a
// version page links only its own version — the version switch (a[data-switch-variant], P1-15) aside.
// Run after `npm run build`: npm run test:ops.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const DIST = process.env.DIST_DIR ?? 'dist';
const OLD = /(?:^|["'`=(\s]|&quot;|&#34;)(\/(?:en\/)?(?:research|projects|records|player-log)\/[^"'`\s<>)&]*)/g;
/**
 * Built client scripts under dist/_astro. The one allowed hit: src/variants/ids.ts's BASE_PATH map, base-form keys that
 * pageHref prefixes at runtime (never an href by itself). It is recognised by its shape, not by a file name.
 */
const BASE_PATH_MAP = /research:\s*[`"']\/research\/[`"'],\s*projects:\s*[`"']\/projects\/[`"'],\s*records:\s*[`"']\/records\/[`"'],\s*playerLog:\s*[`"']\/player-log\/[`"']/g;

/** @param {string} dir @returns {string[]} */
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
const pages = () => {
  assert.ok(existsSync(join(DIST, 'index.html')), `${DIST} missing: run npm run build first`);
  return walk(DIST)
    .filter((f) => f.endsWith('.html'))
    .map((file) => ({ file, route: `/${relative(DIST, file).split(sep).join('/').replace(/index\.html$/, '')}`, html: readFileSync(file, 'utf8') }))
    .filter((p) => !p.route.startsWith('/print/') && !p.html.includes('data-legacy-redirect') && !p.html.includes('data-utility-page'));
};

test('no built page carries an old-form internal link', () => {
  const hits = pages().flatMap((p) => [...p.html.matchAll(OLD)].map((m) => `${p.route}: ${m[1]}`));
  assert.deepEqual(hits, [], hits.join('\n'));
});

test('no built client script under _astro carries an old-form internal link (the BASE_PATH map aside)', () => {
  const dir = join(DIST, '_astro');
  assert.ok(existsSync(dir), `${dir} missing: run npm run build first`);
  const hits = walk(dir)
    .filter((f) => f.endsWith('.js'))
    .flatMap((file) => [...readFileSync(file, 'utf8').replace(BASE_PATH_MAP, '').matchAll(OLD)].map((m) => `${relative(DIST, file)}: ${m[1]}`));
  assert.deepEqual(hits, [], hits.join('\n'));
});

test('a version page links only its own version (the version switch aside)', () => {
  const hits = [];
  for (const p of pages()) {
    const own = /^\/(?:en\/)?(game|data)\//.exec(p.route)?.[1];
    if (!own) continue;
    const other = own === 'game' ? 'data' : 'game';
    const html = p.html.replace(/<a\b[^>]*data-switch-variant[^>]*>/g, '');
    const re = new RegExp(`(?:["'=(]|&quot;|&#34;)(\\/(?:en\\/)?${other}\\/[^"'\\s<>)&]*)`, 'g');
    for (const m of html.matchAll(re)) hits.push(`${p.route}: ${m[1]}`);
  }
  assert.deepEqual(hits, [], hits.join('\n'));
});

test('the scanners catch planted links', () => {
  assert.equal([...'<a href="/records/#job-fit">'.matchAll(OLD)].length, 1);
  assert.equal([...'<a href="/game/records/">'.matchAll(OLD)].length, 0);
  assert.equal([...'{&quot;href&quot;:&quot;/en/projects/x/&quot;}'.matchAll(OLD)].length, 1);
  assert.equal([...'a.href = `/records/`;'.matchAll(OLD)].length, 1);
  const map = 'const B={home:`/`,research:`/research/`,projects:`/projects/`,records:`/records/`,playerLog:`/player-log/`,privacy:`/privacy/`}';
  assert.equal([...map.replace(BASE_PATH_MAP, '').matchAll(OLD)].length, 0);
});
