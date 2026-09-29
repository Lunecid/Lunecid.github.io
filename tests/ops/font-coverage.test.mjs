// Batch 2 guard: every character the built site can render with its web fonts is in the subset file that page
// actually loads. Run after `npm run build`: npm run test:ops.
//
// It re-reads the output independently of the build step (scripts/fonts/build.mjs): each page is parsed with jsdom,
// its @font-face rules are read from the page itself, and each rule's font file is read from dist/ — the real
// file's cmap, not a list of characters. A character is checked against the face that would draw it (the last
// declared face of the family whose unicode-range covers it). The paper sheet's Hangul is checked against the
// Korean serif on the pages that declare it. Characters no text font is expected to draw (controls, invisible
// format characters, emoji such as 🔒) are left out. A missing character fails the test only when the source font
// (Pretendard Variable, Noto Serif KR) has it; one the source font lacks is printed as a warning (fix round 1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, sep } from 'node:path';
import { JSDOM } from 'jsdom';
import { isHangul } from '../../scripts/fonts/glyphs.mjs';
import { cmapCodePoints, parseName, woff2Tables } from '../../scripts/fonts/sfnt.mjs';
import { SANS_FAMILY, SERIF_KO_FAMILY, SERIF_KO_HEAD_FAMILY } from '../../src/lib/fonts.ts';

const DIST = process.env.DIST_DIR ?? 'dist';

/** @param {string} dir @returns {string[]} */
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));

function builtPages() {
  assert.ok(existsSync(join(DIST, 'index.html')), `${DIST}/index.html missing: run npm run build first`);
  return walk(DIST)
    .filter((f) => f.endsWith('.html'))
    .map((file) => ({ file, route: '/' + relative(DIST, file).split(sep).join('/').replace(/index\.html$/, '') }))
    .filter((p) => !p.route.startsWith('/print/')) // PDF sources: PrintLayout and the static "Pretendard Print" family
    .filter((p) => !readFileSync(p.file, 'utf8').includes('data-legacy-redirect')); // P1-13: redirect stubs carry no page fonts
}

/** Controls, invisible format characters, variation selectors and emoji-presentation characters. @param {string} ch */
function ignorable(ch) {
  const cp = /** @type {number} */ (ch.codePointAt(0));
  return (
    cp < 0x20 || (cp >= 0x7f && cp <= 0x9f) || (cp >= 0x200b && cp <= 0x200f) || (cp >= 0x2028 && cp <= 0x202e) ||
    (cp >= 0x2060 && cp <= 0x206f) || (cp >= 0xfe00 && cp <= 0xfe0f) || cp === 0xfeff || /\p{Emoji_Presentation}/u.test(ch)
  );
}

/** Parses "U+AC00-D7FF,U+1100-11FF" (absent = everything). @param {string | undefined} value */
function unicodeRange(value) {
  if (!value) return () => true;
  const ranges = value.split(',').map((part) => {
    const [lo, hi = lo] = part.trim().replace(/^U\+/i, '').split('-');
    return [parseInt(lo, 16), parseInt(hi, 16)];
  });
  return (/** @type {number} */ cp) => ranges.some(([lo, hi]) => cp >= lo && cp <= hi);
}

/** @type {Map<string, Set<number>>} */
const cmapCache = new Map();
/** Code points of a font file served at `url` from dist. @param {string} url */
function fontCmap(url) {
  if (!cmapCache.has(url)) {
    const file = join(DIST, ...url.split('/').filter(Boolean));
    assert.ok(existsSync(file), `font file ${url} is not in ${DIST}`);
    const cmap = woff2Tables(readFileSync(file)).get('cmap');
    assert.ok(cmap, `${url} has no cmap table`);
    cmapCache.set(url, cmapCodePoints(cmap));
  }
  return /** @type {Set<number>} */ (cmapCache.get(url));
}

/**
 * The @font-face rules a page declares in its own <style> elements.
 * @param {Document} doc
 * @returns {{ family: string; url: string; covers: (cp: number) => boolean }[]}
 */
function fontFaces(doc) {
  const css = [...doc.querySelectorAll('style')].map((s) => s.textContent ?? '').join('\n');
  return [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => {
    const decl = (/** @type {string} */ name) => new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`).exec(m[1])?.[1].trim();
    const family = (decl('font-family') ?? '').replace(/^["']|["']$/g, '');
    const url = /url\(\s*["']?([^"')]+)["']?\s*\)/.exec(decl('src') ?? '')?.[1] ?? '';
    return { family, url, covers: unicodeRange(decl('unicode-range')) };
  });
}

/** Every string a page can put on screen: text, attribute values, stylesheet strings, inline script text. @param {Element} root */
function renderableText(root) {
  const doc = root.ownerDocument;
  let text = root.textContent ?? '';
  for (const el of [root, ...root.querySelectorAll('*')]) {
    for (const attr of el.attributes) text += ` ${attr.value}`;
    if (el.localName === 'template') text += ` ${/** @type {HTMLTemplateElement} */ (el).content.textContent}`;
  }
  if (root === doc.documentElement) {
    for (const s of doc.querySelectorAll('script[type="application/ld+json"]')) text = text.replace(s.textContent ?? '', ' ');
    // stylesheet strings may spell characters as CSS escapes (content: "\2192")
    for (const s of doc.querySelectorAll('style')) {
      text += (s.textContent ?? '').replace(/\\([0-9a-fA-F]{1,6})\s?/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)));
    }
  }
  return text;
}

/**
 * Characters of `text` that the page's faces of `family` do not draw.
 * @param {string} text @param {ReturnType<typeof fontFaces>} faces @param {string} family
 */
function uncoveredBy(text, faces, family) {
  const own = faces.filter((f) => f.family === family).reverse(); // the last declared matching face wins
  /** @type {Set<string>} */
  const missing = new Set();
  for (const ch of new Set(text)) {
    if (ignorable(ch)) continue;
    const cp = /** @type {number} */ (ch.codePointAt(0));
    const face = own.find((f) => f.covers(cp));
    if (!face || !fontCmap(face.url).has(cp)) missing.add(ch);
  }
  return [...missing].sort();
}

// ── source fonts: a character missing from a subset is a pipeline bug only when the source font has it ──

const require = createRequire(import.meta.url);
/** @type {Map<string, Set<number>>} */
const sourceCache = new Map();
/** @param {string} key @param {() => Set<number>} load */
const cached = (key, load) => {
  if (!sourceCache.has(key)) sourceCache.set(key, load());
  return /** @type {Set<number>} */ (sourceCache.get(key));
};
/** @param {string} file */
const fileCmap = (file) => cmapCodePoints(/** @type {Buffer} */ (woff2Tables(readFileSync(file)).get('cmap')));
const notoSerifKr = () =>
  cached('serif', () => {
    const dir = dirname(require.resolve('@fontsource-variable/noto-serif-kr/files/noto-serif-kr-0-wght-normal.woff2'));
    /** @type {Set<number>} */
    const all = new Set();
    for (const f of readdirSync(dir).filter((f) => /^noto-serif-kr-\d+-wght-normal\.woff2$/.test(f))) for (const cp of fileCmap(join(dir, f))) all.add(cp);
    return all;
  });
/** Code points of the source of each subset family: Pretendard Variable, and every Noto Serif KR slice. */
const SOURCE = {
  [SANS_FAMILY]: () => cached('sans', () => fileCmap(require.resolve('pretendard/dist/web/variable/woff2/PretendardVariable.woff2'))),
  [SERIF_KO_FAMILY]: notoSerifKr,
  [SERIF_KO_HEAD_FAMILY]: notoSerifKr,
};
const SOURCE_NAME = { [SANS_FAMILY]: 'Pretendard Variable', [SERIF_KO_FAMILY]: 'Noto Serif KR', [SERIF_KO_HEAD_FAMILY]: 'Noto Serif KR' };

/** "똠 (U+B620)" @param {string[]} chars */
const describe = (chars) => chars.map((ch) => `${ch} (U+${ch.codePointAt(0)?.toString(16).toUpperCase().padStart(4, '0')})`).join(' ');

/**
 * Splits what `family` does not draw into problems (the source font has the glyph, so the subset should: a
 * pipeline bug) and warnings (the source font has none: third-party text such as a CJK ideograph in a fetched
 * GitHub description; a system font draws it, and the daily build must not fail on it).
 * @param {string} text @param {ReturnType<typeof fontFaces>} faces @param {string} family
 * @param {string[]} problems @param {string[]} warnings
 */
function check(text, faces, family, problems, warnings) {
  const missing = uncoveredBy(text, faces, family);
  if (missing.length === 0) return;
  const source = SOURCE[family]();
  const bug = missing.filter((ch) => source.has(/** @type {number} */ (ch.codePointAt(0))));
  const absent = missing.filter((ch) => !bug.includes(ch));
  if (bug.length > 0) problems.push(`"${family}" lacks ${describe(bug)}, which ${SOURCE_NAME[family]} has`);
  if (absent.length > 0) warnings.push(`${SOURCE_NAME[family]} has no glyph for ${describe(absent)}; a system font draws it`);
}

/** Non-ASCII characters of every client bundle (islands render these from their own code). */
function clientScriptText() {
  return walk(join(DIST, '_astro'))
    .filter((f) => f.endsWith('.js'))
    .map((f) => [...readFileSync(f, 'utf8')].filter((ch) => ch.charCodeAt(0) >= 0x80).join(''))
    .join('');
}

/**
 * Checks one page's HTML: the sans face must draw every renderable character (plus the client bundles'), the
 * Korean serif (where declared) every Hangul syllable of the paper sheet — each as far as its source font can.
 * @param {string} html @param {string} scriptText
 * @returns {{ problems: string[]; warnings: string[] }}
 */
export function checkPage(html, scriptText) {
  const doc = new JSDOM(html).window.document;
  const faces = fontFaces(doc);
  /** @type {string[]} */
  const problems = [];
  /** @type {string[]} */
  const warnings = [];
  if (!faces.some((f) => f.family === SANS_FAMILY)) problems.push(`no @font-face for "${SANS_FAMILY}"`);
  else check(renderableText(doc.documentElement) + scriptText, faces, SANS_FAMILY, problems, warnings);
  if (faces.some((f) => f.family === SERIF_KO_FAMILY)) {
    const sheet = doc.querySelector('article.paper');
    if (!sheet) problems.push(`"${SERIF_KO_FAMILY}" declared but the page has no paper sheet`);
    else {
      const hangul = [...renderableText(sheet)].filter((ch) => /\p{Script=Hangul}/u.test(ch)).join('');
      if (hangul.length === 0) problems.push(`"${SERIF_KO_FAMILY}" declared but the paper sheet has no Hangul`);
      check(hangul, faces, SERIF_KO_FAMILY, problems, warnings);
    }
  }
  if (faces.some((f) => f.family === SERIF_KO_HEAD_FAMILY)) {
    // P2-3: the heading face must draw every Hangul it is asked to draw: the text inside [data-serif], in the face's
    // own ranges (isHangul, as the build). Attribute values are not drawn in the face (a title shows in the system UI).
    const hangul = [...doc.querySelectorAll('[data-serif]')]
      .map((el) => [...(el.textContent ?? '')].filter((ch) => isHangul(/** @type {number} */ (ch.codePointAt(0)))).join(''))
      .join('');
    check(hangul, faces, SERIF_KO_HEAD_FAMILY, problems, warnings);
  }
  if (/\/_fonts\//.test(html)) problems.push('an unresolved /_fonts/ placeholder is left in the page');
  return { problems, warnings };
}

test('every character a built page can render is in the subset font file that page loads', () => {
  const scripts = clientScriptText();
  /** @type {string[]} */
  const failures = [];
  for (const p of builtPages()) {
    const { problems, warnings } = checkPage(readFileSync(p.file, 'utf8'), scripts);
    failures.push(...problems.map((msg) => `${p.route}: ${msg}`));
    for (const msg of warnings) console.warn(`warning: ${p.route}: ${msg}`);
  }
  assert.deepEqual(failures, []);
});

test('the Korean paper page loads the Korean serif and no other page does', () => {
  const withSerif = builtPages()
    .filter((p) => fontFaces(new JSDOM(readFileSync(p.file, 'utf8')).window.document).some((f) => f.family === SERIF_KO_FAMILY))
    .map((p) => p.route);
  assert.deepEqual(withSerif.sort(), ['/data/research/cog-2026-engagement/', '/game/research/cog-2026-engagement/']);
});

test('general-version pages declare the Korean heading face, no other page does, and no page preloads it (P2-3)', () => {
  /** @type {string[]} */
  const wrong = [];
  for (const p of builtPages()) {
    const html = readFileSync(p.file, 'utf8');
    const declares = fontFaces(new JSDOM(html).window.document).some((f) => f.family === SERIF_KO_HEAD_FAMILY);
    const general = /^\/(en\/)?data\//.test(p.route);
    if (declares !== general) wrong.push(`${p.route}: declares=${declares}`);
    if (/<link rel="preload"[^>]*sb-serif-kr-head/.test(html)) wrong.push(`${p.route}: preloads the heading face`);
  }
  assert.deepEqual(wrong, []);
});

test('the Korean heading face ships as one static file (no fvar), weight 700, with its license records', () => {
  const files = walk(join(DIST, '_astro')).filter((f) => /[\\/]sb-serif-kr-head\.[\w-]+\.woff2$/.test(f));
  assert.equal(files.length, 1);
  const tables = woff2Tables(readFileSync(files[0]));
  assert.equal(tables.has('fvar'), false);
  const os2 = tables.get('OS/2');
  assert.ok(os2, 'OS/2 table');
  assert.equal(new DataView(os2.buffer, os2.byteOffset, os2.byteLength).getUint16(4), 700, 'usWeightClass');
  const name = tables.get('name');
  assert.ok(name, 'name table');
  const records = parseName(name);
  // The fontsource source keeps the copyright (0) and the license URL (14) but no license text (13): both survive.
  assert.match(records.find((r) => r.nameID === 0)?.value ?? '', /Adobe/, 'copyright');
  assert.match(records.find((r) => r.nameID === 14)?.value ?? '', /openfontlicense\.org|scripts\.sil\.org/i, 'license URL');
});

test('self-test: the heading face fails on a [data-serif] Hangul it lacks, and only there', () => {
  const html = readFileSync(join(DIST, 'data', 'index.html'), 'utf8');
  const cmapOf = (/** @type {RegExp} */ re) => {
    const file = walk(join(DIST, '_astro')).find((f) => re.test(f));
    assert.ok(file, String(re));
    const cmap = woff2Tables(readFileSync(file)).get('cmap');
    assert.ok(cmap);
    return cmapCodePoints(cmap);
  };
  const sansKo = cmapOf(/[\\/]sb-sans-ko\.[\w-]+\.woff2$/);
  const head = cmapOf(/[\\/]sb-serif-kr-head\.[\w-]+\.woff2$/);
  // A syllable the sans subset draws (so only the heading check can fail) that the heading subset lacks.
  const cp = [...sansKo].filter((c) => c >= 0xac00 && c <= 0xd7a3 && !head.has(c) && SOURCE[SERIF_KO_HEAD_FAMILY]().has(c)).sort((a, b) => a - b)[0];
  assert.ok(cp !== undefined, 'a probe syllable');
  const probe = String.fromCodePoint(cp);
  const inHead = checkPage(html.replace('</main>', `<h2 data-serif>${probe}</h2></main>`), '');
  assert.deepEqual(inHead.problems.length, 1, inHead.problems.join('\n'));
  assert.match(inHead.problems[0] ?? '', new RegExp(`"${SERIF_KO_HEAD_FAMILY}" lacks ${probe}`));
  assert.deepEqual(checkPage(html.replace('</main>', `<h2>${probe}</h2></main>`), '').problems, []);
  // an attribute of a [data-serif] element is not drawn in the face
  assert.deepEqual(checkPage(html.replace('</main>', `<h2 data-serif title="${probe}">Data</h2></main>`), '').problems, []);
});

test('self-test: a character the source font has but the subset lacks fails, named', () => {
  const html = readFileSync(join(DIST, 'game', 'index.html'), 'utf8');
  const probe = '똠'; // U+B620: in Pretendard, used nowhere on the site
  const cmap = fontCmap(/** @type {string} */ (fontFaces(new JSDOM(html).window.document).find((f) => f.family === SANS_FAMILY)?.url));
  assert.equal(cmap.has(0xb620), false, 'the probe must not be in the subset');
  assert.equal(SOURCE[SANS_FAMILY]().has(0xb620), true, 'the probe must be in Pretendard');
  const planted = checkPage(html.replace('</main>', `<p>${probe}</p></main>`), '');
  assert.equal(planted.problems.length, 1);
  assert.match(planted.problems[0], /"SB Sans" lacks 똠 \(U\+B620\), which Pretendard Variable has/);
  assert.deepEqual(planted.warnings, []);
  // and from a client bundle, too
  assert.match(checkPage(html, probe).problems[0], /똠/);
});

test('self-test: a character the source font lacks only warns (third-party text never fails the build)', () => {
  const html = readFileSync(join(DIST, 'game', 'index.html'), 'utf8');
  const probe = '漢'; // U+6F22: a CJK ideograph, e.g. from a fetched GitHub description; Pretendard has none
  assert.equal(SOURCE[SANS_FAMILY]().has(0x6f22), false, 'the probe must not be in Pretendard');
  const planted = checkPage(html.replace('</main>', `<p>${probe}</p></main>`), '');
  assert.deepEqual(planted.problems, []);
  assert.equal(planted.warnings.length, 1);
  assert.match(planted.warnings[0], /Pretendard Variable has no glyph for 漢 \(U\+6F22\)/);
});

test('self-test: the Korean serif fails on a syllable Noto Serif KR has, warns on archaic jamo it lacks', () => {
  const html = readFileSync(join(DIST, 'game/research/cog-2026-engagement/index.html'), 'utf8');
  const inSheet = (/** @type {string} */ probe) => html.replace('</article>', `<p>${probe}</p></article>`);
  assert.equal(SOURCE[SERIF_KO_FAMILY]().has(0xb620), true);
  const bug = checkPage(inSheet('똠'), '');
  assert.ok(bug.problems.some((p) => /"SB Serif KR" lacks 똠 \(U\+B620\), which Noto Serif KR has/.test(p)), bug.problems.join('\n'));
  const jamo = 'ᄀ'; // U+1100 HANGUL CHOSEONG KIYEOK: neither Pretendard nor Noto Serif KR has it
  assert.equal(SOURCE[SERIF_KO_FAMILY]().has(0x1100), false);
  const absent = checkPage(inSheet(jamo), '');
  assert.deepEqual(absent.problems, []);
  assert.ok(absent.warnings.some((w) => /Noto Serif KR has no glyph for ᄀ \(U\+1100\)/.test(w)), absent.warnings.join('\n'));
});

// ── OFL: the Pretendard subset is a Modified Version and must not be published under the Reserved Font Name ──

test('the sans subsets do not present "Pretendard" as their name and keep the copyright and license records', () => {
  const files = walk(join(DIST, '_astro')).filter((f) => /[\\/]sb-sans(?:-ko)?\.[\w-]+\.woff2$/.test(f));
  assert.equal(files.length, 2, 'the core and the Hangul sans subset in dist/_astro');
  for (const file of files) {
    const name = woff2Tables(readFileSync(file)).get('name');
    assert.ok(name, `${file}: name table`);
    const records = parseName(name);
    const nameRecords = records.filter((r) => [1, 3, 4, 6, 16, 17, 25].includes(r.nameID) || r.nameID >= 256);
    assert.ok(nameRecords.some((r) => r.nameID === 1 && r.value === SANS_FAMILY), `${file}: name ID 1 is "${SANS_FAMILY}"`);
    assert.deepEqual(nameRecords.filter((r) => /pretendard/i.test(r.value)).map((r) => `${file}: ${r.nameID}: ${r.value}`), []);
    assert.match(records.find((r) => r.nameID === 0)?.value ?? '', /Kil Hyung-jin/, `${file}: copyright`);
    assert.match(records.find((r) => r.nameID === 13)?.value ?? '', /SIL Open Font License/, `${file}: license`);
    assert.match(records.find((r) => r.nameID === 14)?.value ?? '', /OFL/i, `${file}: license URL`);
  }
});
