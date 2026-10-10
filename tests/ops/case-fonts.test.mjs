// CS-8 guard: the case-study overlay's fonts in the built site. Run after `npm run build`: npm run test:ops.
// The lazy overlay stylesheet declares the five case faces with hashed subset files (no placeholder left anywhere); each
// subset covers the characters of the overlay's sheets that its source font has (the Korean serif and the site's SB Sans
// cover every Hangul of the Korean sheet); the subsets of Lora and Playfair Display are renamed (Reserved Font Names);
// and the fonts a language's sheet loads stay within 250 KB.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { PRINTABLE_ASCII, isHangul } from '../../scripts/fonts/glyphs.mjs';
import { cmapCodePoints, parseName, woff2Tables } from '../../scripts/fonts/sfnt.mjs';

const DIST = process.env.DIST_DIR ?? 'dist';
const require = createRequire(import.meta.url);
const BUDGET = 250 * 1024;
const FAMILIES = { serif: 'SB Case Serif', display: 'SB Case Display', ui: 'SB Case UI', serifKo: 'SB Case Serif KR' };

const astro = join(DIST, '_astro');
const overlayCss = () => {
  const files = readdirSync(astro).filter((f) => /^overlay\..+\.css$/.test(f));
  assert.equal(files.length, 1, `one overlay stylesheet in ${astro}: ${files.join(', ')}`);
  return readFileSync(join(astro, files[0]), 'utf8');
};
/** @param {string} css */
const faces = (css) => [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => {
  const decl = (/** @type {string} */ name) => new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`).exec(m[1])?.[1].trim();
  return {
    family: (decl('font-family') ?? '').replace(/^["']|["']$/g, ''),
    style: decl('font-style') ?? 'normal',
    url: /url\(\s*["']?([^"')]+)["']?\s*\)/.exec(decl('src') ?? '')?.[1] ?? '',
  };
});
/** @param {string} url */
const fileOf = (url) => join(DIST, ...url.split('/').filter(Boolean));
/** @param {string} url */
const cmapOf = (url) => cmapCodePoints(/** @type {Buffer} */ (woff2Tables(readFileSync(fileOf(url))).get('cmap')));
/** @param {string} file */
const sourceCmap = (file) => cmapCodePoints(/** @type {Buffer} */ (woff2Tables(readFileSync(require.resolve(file))).get('cmap')));

/** The characters a sheet shows: its markup's text, the chart words, the pipeline lines and the runtime strings. */
function sheetText(/** @type {'ko' | 'en'} */ lang) {
  const data = JSON.parse(readFileSync(join(DIST, 'case/cog-2026-engagement', `${lang}.json`), 'utf8'));
  const text = (/** @type {string} */ html) => new JSDOM(`<body>${html}</body>`).window.document.body.textContent ?? '';
  const words = (/** @type {unknown} */ v) => (typeof v === 'string' ? [v] : Array.isArray(v) ? v.flatMap(words) : v && typeof v === 'object' ? Object.values(v).flatMap(words) : []);
  return [text(data.html), ...words(data.labels), ...data.say.map(text), ...words(data.strings)].join('');
}

test('the overlay stylesheet declares the five case faces with hashed files; no placeholder is left', () => {
  const css = overlayCss();
  const declared = faces(css).filter((f) => f.family.startsWith('SB Case'));
  assert.deepEqual(declared.map((f) => `${f.family}/${f.style}`), ['SB Case Serif/normal', 'SB Case Serif/italic', 'SB Case Display/normal', 'SB Case UI/normal', 'SB Case Serif KR/normal']);
  for (const f of declared) {
    assert.match(f.url, /^\/_astro\/sb-case-[a-z-]+\.[\w]+\.woff2$/, f.family);
    assert.ok(existsSync(fileOf(f.url)), f.url);
  }
  for (const file of readdirSync(astro).filter((f) => /\.(css|js)$/.test(f))) assert.ok(!readFileSync(join(astro, file), 'utf8').includes('/_fonts/sb-case-'), `${file} still has a case placeholder`);
});

test('each case face covers the characters of the sheets that its source font has; the Korean serif and SB Sans cover the Korean sheet\'s Hangul', () => {
  const declared = Object.fromEntries(faces(overlayCss()).map((f) => [`${f.family}/${f.style}`, f.url]));
  const latin = [...new Set(PRINTABLE_ASCII + sheetText('ko') + sheetText('en'))].filter((ch) => !isHangul(/** @type {number} */ (ch.codePointAt(0))) && ch.trim() !== '');
  const sources = {
    [`${FAMILIES.serif}/normal`]: '@fontsource-variable/lora/files/lora-latin-wght-normal.woff2',
    [`${FAMILIES.serif}/italic`]: '@fontsource-variable/lora/files/lora-latin-wght-italic.woff2',
    [`${FAMILIES.display}/normal`]: '@fontsource-variable/playfair-display/files/playfair-display-latin-wght-normal.woff2',
    [`${FAMILIES.ui}/normal`]: '@fontsource-variable/open-sans/files/open-sans-latin-wght-normal.woff2',
  };
  for (const [face, source] of Object.entries(sources)) {
    const src = sourceCmap(source);
    const sub = cmapOf(declared[face]);
    const missing = latin.filter((ch) => src.has(/** @type {number} */ (ch.codePointAt(0))) && !sub.has(/** @type {number} */ (ch.codePointAt(0))));
    assert.deepEqual(missing, [], face);
  }
  const hangul = [...new Set(sheetText('ko'))].filter((ch) => isHangul(/** @type {number} */ (ch.codePointAt(0))));
  assert.ok(hangul.length > 200, `${hangul.length} Hangul in the Korean sheet`);
  const serifKo = cmapOf(declared[`${FAMILIES.serifKo}/normal`]);
  assert.deepEqual(hangul.filter((ch) => !serifKo.has(/** @type {number} */ (ch.codePointAt(0)))), [], 'SB Case Serif KR');
  // the site's sans (the files the Korean pages declare) draws the Hangul of the UI text
  const page = readFileSync(join(DIST, 'game/research/cog-2026-engagement/index.html'), 'utf8');
  const sansFiles = [...page.matchAll(/@font-face\{font-family:"SB Sans"[^}]*src:url\(([^)]+)\)/g)].map((m) => m[1]);
  assert.equal(sansFiles.length, 3, 'the Korean page declares the shared SB Sans Hangul file, its own Hangul file and the core file');
  const sans = new Set(sansFiles.flatMap((url) => [...cmapOf(url)]));
  assert.deepEqual(hangul.filter((ch) => !sans.has(/** @type {number} */ (ch.codePointAt(0)))), [], 'SB Sans Hangul');
});

test('Lora and Playfair Display subsets are renamed (OFL Reserved Font Names); the source names stay only in the copyright and licence records', () => {
  const declared = faces(overlayCss()).filter((x) => x.family === FAMILIES.serif || x.family === FAMILIES.display);
  assert.equal(declared.length, 3, 'two Lora faces and the Playfair face');
  for (const f of declared) {
    const records = parseName(/** @type {Buffer} */ (woff2Tables(readFileSync(fileOf(f.url))).get('name')));
    for (const r of records.filter((x) => [1, 3, 4, 6, 16, 17, 25].includes(x.nameID) || x.nameID >= 256)) {
      assert.doesNotMatch(r.value, /Lora|Playfair/, `${f.url} name ID ${r.nameID}: ${r.value}`);
    }
    assert.ok(records.some((x) => x.nameID === 0), `${f.url} keeps its copyright record`);
  }
});

test('the fonts each language\'s sheet loads stay within 250 KB', () => {
  const declared = faces(overlayCss()).filter((f) => f.family.startsWith('SB Case'));
  assert.equal(declared.length, 5);
  const bytes = (/** @type {string} */ family) => declared.filter((f) => f.family === family).reduce((n, f) => n + readFileSync(fileOf(f.url)).length, 0);
  const en = bytes(FAMILIES.serif) + bytes(FAMILIES.display) + bytes(FAMILIES.ui);
  const ko = en + bytes(FAMILIES.serifKo);
  console.log(`case fonts: en ${(en / 1024).toFixed(1)} KB, ko ${(ko / 1024).toFixed(1)} KB`);
  assert.ok(en <= BUDGET, `en ${en} B`);
  assert.ok(ko <= BUDGET, `ko ${ko} B`);
});

