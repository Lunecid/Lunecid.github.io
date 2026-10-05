// P2-2a (contract §2.2, §4.2, §8.1 F-8): a page inlines a layout's global sheet only when its page module imports that
// layout. Astro bundles the CSS of every module a page imports, rendered or not, and a dynamic [variant] route is one
// module for both versions, so the per-version page module imports the layout and no shared view does.
// A sheet's "own" classes are the classes it defines that no other stylesheet in src/ names (other src/**/*.css files,
// <style> blocks of src/**/*.astro); they reach a page's inlined CSS only through that sheet.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
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
const pages = walk('dist')
  .filter((f) => f.endsWith('.html'))
  .map((f) => {
    const html = readFileSync(f, 'utf8');
    return { path: posix(relative('dist', f)), variant: html.match(/<html\b[^>]*\bdata-variant="([a-z]+)"/)?.[1] ?? null, css: styleText(html) };
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

test('data pages inline editorial.css (P2-2)', () => {
  const data = ofVariant('data');
  assert.ok(data.length > 0, 'no data page in dist');
  for (const p of data) {
    assert.deepEqual(ED_OWN.filter((c) => !has(p.css, c)), [], `${p.path}: editorial.css is not inlined`);
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
