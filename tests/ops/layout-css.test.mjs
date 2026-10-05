// P2-2a (contract §2.2, §4.2, §8.1 F-8): a page inlines a layout's global sheet only when its page module imports that
// layout. Astro bundles the CSS of every module a page imports, rendered or not, and a dynamic [variant] route is one
// module for both versions, so the per-version page module imports the layout and no shared view does.
// A sheet's "own" classes are the classes it defines that no other stylesheet in src/ names (other src/**/*.css files,
// <style> blocks of src/**/*.astro); they reach a page's inlined CSS only through that sheet.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
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

// The chooser's own sheet (MO-23) is the one exception: only the two chooser pages link it (pinned below).
const CHOOSER_PAGES = ['index.html', 'en/index.html'];
const isChooserSheet = (href) => /^\/_astro\/chooser\.[\w-]+\.css$/.test(href);
/** The stylesheets a game or neutral page links besides the chooser's own sheet on the chooser pages. */
const otherLinks = (p) => p.links.filter((href) => !(CHOOSER_PAGES.includes(p.path) && isChooserSheet(href)));

test('game and neutral pages link no stylesheet (the chooser pages: only the chooser sheet) and never name the data sheet', () => {
  const others = [...ofVariant('game'), ...ofVariant('neutral')];
  assert.ok(others.length > 0, 'no game or neutral page in dist');
  for (const p of others) {
    assert.deepEqual(otherLinks(p), [], `${p.path}: links a stylesheet`);
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
  // The chooser sheet paints its printout with brush tokens of its own (same names, live SVG); paint.css's own
  // marks (--ed-paint-*, the /_astro/paint-* tiles) never reach it, and nothing else on these pages carries any.
  for (const p of [...ofVariant('game'), ...ofVariant('neutral')]) {
    const css = `${p.inline}\n${otherLinks(p).map((href) => readFileSync(join('dist', ...href.split('/').filter(Boolean)), 'utf8')).join('\n')}`;
    assert.ok(!/--tex-|--ragbox|--ed-paint-/.test(css), `${p.path}: paint.css leaked`);
    assert.ok(!/--ed-paint-|\/_astro\/paint-/.test(p.css), `${p.path}: paint.css leaked into the chooser sheet`);
  }
});

// Live SVG feTurbulence cost 0.6–1.2 s of main-thread rasterising per data page on phones (TBT up to 685 ms): the six
// brush tiles ship pre-rendered (scripts/paint/paint.mjs), as hashed, cacheable WebP files next to the data sheet.
test('the brush textures are pre-rendered WebP tiles (1× and 2×) in /_astro/, never SVG noise', () => {
  const data = ofVariant('data');
  assert.ok(data.length >= 16, 'the general pages');
  for (const p of data) assert.ok(!/feTurbulence|%3Cfilter|<filter/i.test(p.css), `${p.path}: SVG noise in the page CSS`);
  const css = data[0].css;
  for (const key of ['rh', 'rv', 'bh', 'bv', 'yh', 'yv']) {
    // Named change (deferred textures): --tex-* is none until [data-paint-tex] attaches the tiles after load
    assert.match(css, new RegExp(`--tex-${key}:\\s*none`), `--tex-${key} defaults to none`);
    const value = new RegExp(`--tex-${key}:\\s*(image-set[^;}]+)`).exec(css)?.[1] ?? '';
    const urls = [...value.matchAll(/url\(\s*["']?([^"')\s]+)["']?\s*\)\s*([\d.]+x)/g)].map((m) => [m[1], m[2]]);
    assert.equal(urls.length, 2, `--tex-${key}: ${value}`);
    assert.match(value.trim(), /^image-set\(/, `--tex-${key} is an image-set`);
    const [[one, s1], [two, s2]] = urls;
    assert.deepEqual([s1, s2], ['1x', '2x'], `--tex-${key} scales`);
    assert.match(one, new RegExp(`^/_astro/paint-${key}\\.[\\w-]{6,}\\.webp$`), `--tex-${key} 1x`);
    assert.match(two, new RegExp(`^/_astro/paint-${key}-2x\\.[\\w-]{6,}\\.webp$`), `--tex-${key} 2x`);
    for (const href of [one, two]) assert.ok(statSync(join('dist', ...href.split('/').filter(Boolean))).size > 0, `${href} exists`);
  }
});

// MO-23 (controller ruling): the chooser's page, desk and cover styles are one external, content-hashed stylesheet that
// only the two chooser pages link; no page inlines its rules.
test('only the chooser pages link the chooser sheet; no page inlines it', () => {
  const sheetRe = /<link rel="stylesheet" href="(\/_astro\/chooser\.[\w-]+\.css)"/g;
  const linked = [];
  for (const file of walk('dist').filter((f) => f.endsWith('.html'))) {
    const html = readFileSync(file, 'utf8');
    const path = posix(relative('dist', file));
    const hrefs = [...html.matchAll(sheetRe)].map((m) => m[1]);
    const chooser = path === 'index.html' || path === 'en/index.html';
    assert.equal(hrefs.length, chooser ? 1 : 0, `${path}: ${hrefs.length} chooser sheet links`);
    if (chooser) linked.push(hrefs[0]);
    assert.doesNotMatch(styleText(html), /\.file--data|\.file--game|--tex-rh|\.chooser__stage/, `${path}: chooser rules inlined`);
  }
  assert.equal(new Set(linked).size, 1, 'both chooser pages share one cached file');
  assert.ok(existsSync(join('dist', ...linked[0].split('/').filter(Boolean))), `${linked[0]} is in dist`);
});
