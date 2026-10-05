// P2-2a (contract §2.2, §4.2, §8.1 F-8): a page inlines a layout's global sheet only when its page module imports that
// layout. Astro bundles the CSS of every module a page imports, rendered or not, and a dynamic [variant] route is one
// module for both versions, so the per-version page module imports the layout and no shared view does.
// A sheet's "own" classes are the classes it defines that no other stylesheet in src/ names (other src/**/*.css files,
// <style> blocks of src/**/*.astro); they reach a page's inlined CSS only through that sheet.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { test } from 'node:test';

const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
const posix = (file) => file.split(sep).join('/');
const classesIn = (css) => new Set([...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1]));
const styleText = (text) => [...text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');

function ownClasses(sheet) {
  const others = new Set();
  for (const file of walk('src').map(posix)) {
    if (file === sheet) continue;
    const text = file.endsWith('.css') ? readFileSync(file, 'utf8') : file.endsWith('.astro') ? styleText(readFileSync(file, 'utf8')) : '';
    for (const c of classesIn(text)) others.add(c);
  }
  return [...classesIn(readFileSync(sheet, 'utf8'))].filter((c) => !others.has(c)).sort();
}

const HUD_OWN = ownClasses('src/styles/hud.css');
const ED_OWN = ownClasses('src/styles/editorial.css');
const has = (css, cls) => new RegExp(`\\.${cls}(?![\\w-])`).test(css);
// A page's CSS = its inline <style> blocks + the stylesheets it links (only data pages link one: data-site.css).
const sheetHrefs = (html) => [...html.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*>/g)].map((m) => /\bhref="([^"]+)"/.exec(m[0])?.[1] ?? '');
const pages = walk('dist')
  .filter((f) => f.endsWith('.html'))
  .map((f) => {
    const html = readFileSync(f, 'utf8');
    const links = sheetHrefs(html);
    const inline = styleText(html);
    const linked = links.map((href) => readFileSync(join('dist', ...href.split('/').filter(Boolean)), 'utf8')).join('\n');
    return { path: posix(relative('dist', f)), variant: html.match(/<html\b[^>]*\bdata-variant="([a-z]+)"/)?.[1] ?? null, html, links, inline, css: `${inline}\n${linked}` };
  });
const ofVariant = (v) => pages.filter((p) => p.variant === v);

test('each version sheet has classes of its own to look for', () => {
  assert.ok(HUD_OWN.length >= 5, `hud.css own classes: ${HUD_OWN.join(' ')}`);
  assert.ok(ED_OWN.length >= 5, `editorial.css own classes: ${ED_OWN.join(' ')}`);
});

test('game pages inline hud.css and never editorial.css', () => {
  const game = ofVariant('game');
  assert.ok(game.length > 0, 'no game page in dist');
  for (const p of game) {
    assert.deepEqual(HUD_OWN.filter((c) => !has(p.css, c)), [], `${p.path}: hud.css is not inlined`);
    assert.deepEqual(ED_OWN.filter((c) => has(p.css, c)), [], `${p.path}: editorial.css leaked into a game page`);
  }
});

test('neutral pages (chooser, shared pages, 404) inline neither version sheet', () => {
  const neutral = ofVariant('neutral');
  assert.ok(neutral.length > 0, 'no neutral page in dist');
  for (const p of neutral) {
    assert.deepEqual(HUD_OWN.filter((c) => has(p.css, c)), [], `${p.path}: hud.css leaked`);
    assert.deepEqual(ED_OWN.filter((c) => has(p.css, c)), [], `${p.path}: editorial.css leaked`);
  }
});

// Named change (data CSS external): editorial.css and paint.css are no longer inlined per data page; they reach every
// data page through one shared, content-hashed stylesheet.
test('data pages load editorial.css (P2-2) from the shared data stylesheet, not inline', () => {
  const data = ofVariant('data');
  assert.ok(data.length > 0, 'no data page in dist');
  for (const p of data) {
    assert.deepEqual(ED_OWN.filter((c) => !has(p.css, c)), [], `${p.path}: editorial.css is not loaded`);
    assert.deepEqual(ED_OWN.filter((c) => has(p.inline, c)), [], `${p.path}: editorial.css is inlined again`);
  }
});

test('the data CSS is one external, content-hashed stylesheet that every data page shares', () => {
  const data = ofVariant('data');
  assert.ok(data.length >= 16, 'the general pages');
  const hrefs = new Set(data.flatMap((p) => p.links));
  assert.equal(hrefs.size, 1, `data pages link ${[...hrefs].join(', ') || 'no stylesheet'}`);
  const [href] = hrefs;
  assert.match(href, /^\/_astro\/data-site\.[\w-]{6,}\.css$/, 'a hashed, cacheable /_astro/ file');
  for (const p of data) {
    assert.deepEqual(p.links, [href], `${p.path}: exactly one data stylesheet link`);
    const head = /<head[^>]*>([\s\S]*?)<\/head>/.exec(p.html)?.[1] ?? '';
    assert.ok(head.includes(`href="${href}"`), `${p.path}: the link sits in <head> (no flash of unstyled content)`);
  }
});

test('game and neutral pages link no stylesheet and never name the data sheet', () => {
  const others = [...ofVariant('game'), ...ofVariant('neutral')];
  assert.ok(others.length > 0, 'no game or neutral page in dist');
  for (const p of others) {
    assert.deepEqual(p.links, [], `${p.path}: links a stylesheet`);
    assert.ok(!/_astro\/data-site\./.test(p.html), `${p.path}: names the data sheet`);
  }
});

const READ_OWN = ownClasses('src/styles/read.css');

test('data pages inline neither hud.css nor read.css (P2-9: the D-7 transition is over)', () => {
  assert.ok(READ_OWN.length >= 5, `read.css own classes: ${READ_OWN.join(' ')}`);
  const data = ofVariant('data');
  assert.ok(data.length > 0, 'no data page in dist');
  for (const p of data) {
    assert.deepEqual(HUD_OWN.filter((c) => has(p.css, c)), [], `${p.path}: hud.css leaked into a general page`);
    assert.deepEqual(READ_OWN.filter((c) => has(p.css, c)), [], `${p.path}: read.css leaked into a general page`);
  }
});

// Named change (data CSS external): "inline" → "load" (through the shared data sheet); the inline CSS holds no paint.
test('DS-2: data pages load paint.css; game and neutral pages never contain --tex- or --ragbox', () => {
  const data = ofVariant('data');
  assert.ok(data.length >= 16, 'the general pages');
  for (const p of data) {
    for (const name of ['--tex-rh', '--tex-rv', '--tex-bh', '--tex-bv', '--tex-yh', '--tex-yv', '--ragbox', '--ed-paint-rh', '--ed-rag']) {
      assert.ok(p.css.includes(`${name}:`), `${p.path}: ${name} is not loaded`);
    }
    assert.ok(!/--tex-|--ragbox/.test(p.inline), `${p.path}: paint.css is inlined again`);
  }
  for (const p of [...ofVariant('game'), ...ofVariant('neutral')]) {
    assert.ok(!/--tex-|--ragbox|--ed-paint-/.test(p.css), `${p.path}: paint.css leaked`);
  }
});
