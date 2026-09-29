// Review Focus 1: internal links that bypass pageHref. Every built page (redirect stubs and print pages aside), in any
// attribute, inline script or island prop: no old-form target (/research/…, /projects/…, /records/…, /player-log/…), and a
// version page links only its own version — the version switch (a[data-switch-variant], P1-15) aside.
// Run after `npm run build`: npm run test:ops.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const DIST = process.env.DIST_DIR ?? 'dist';
const OLD = /(?:^|["'=(\s]|&quot;|&#34;)(\/(?:en\/)?(?:research|projects|records|player-log)\/[^"'\s<>)&]*)/g;

/** @param {string} dir @returns {string[]} */
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
const pages = () => {
  assert.ok(existsSync(join(DIST, 'index.html')), `${DIST} missing: run npm run build first`);
  return walk(DIST)
    .filter((f) => f.endsWith('.html'))
    .map((file) => ({ file, route: `/${relative(DIST, file).split(sep).join('/').replace(/index\.html$/, '')}`, html: readFileSync(file, 'utf8') }))
    .filter((p) => !p.route.startsWith('/print/') && !p.html.includes('data-legacy-redirect'));
};

test('no built page carries an old-form internal link', () => {
  const hits = pages().flatMap((p) => [...p.html.matchAll(OLD)].map((m) => `${p.route}: ${m[1]}`));
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
});
