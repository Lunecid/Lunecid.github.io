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
import { PRINTABLE_ASCII, isHangul } from '../../scripts/fonts/glyphs.mjs';
import { cmapCodePoints, parseName, woff2Tables } from '../../scripts/fonts/sfnt.mjs';
import { COVER_BANNER_FAMILY, COVER_DISPLAY_FAMILY, COVER_MONO_FAMILY, DISPLAY_FAMILY, SANS_FAMILY, SERIF_KO_FAMILY } from '../../src/lib/fonts.ts';

const DIST = process.env.DIST_DIR ?? 'dist';

/** @param {string} dir @returns {string[]} */
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));

function builtPages() {
  assert.ok(existsSync(join(DIST, 'index.html')), `${DIST}/index.html missing: run npm run build first`);
  return walk(DIST)
    .filter((f) => f.endsWith('.html'))
    .map((file) => ({ file, route: '/' + relative(DIST, file).split(sep).join('/').replace(/index\.html$/, '') }))
    .filter((p) => !p.route.startsWith('/print/')) // PDF sources: PrintLayout and the static "Pretendard Print" family
    .filter((p) => !/data-legacy-redirect|data-utility-page/.test(readFileSync(p.file, 'utf8'))); // P1-13: redirect stubs, AL-16: utility pages carry no page fonts
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
};
const SOURCE_NAME = { [SANS_FAMILY]: 'Pretendard Variable', [SERIF_KO_FAMILY]: 'Noto Serif KR' };

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

/** Text of the stylesheets a page links (the data pages' shared data-site sheet), CSS escapes decoded. @param {string} html */
function linkedStyleText(html) {
  return [...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="(\/_astro\/[^"]+\.css)"/g)]
    .map((m) => readFileSync(join(DIST, ...m[1].split('/').filter(Boolean)), 'utf8'))
    .join('')
    .replace(/\\([0-9a-fA-F]{1,6})\s?/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)));
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
  const display = [...doc.querySelectorAll('[data-display]')];
  if (display.length > 0 && !faces.some((f) => f.family === DISPLAY_FAMILY)) problems.push(`[data-display] text but no @font-face for "${DISPLAY_FAMILY}"`);
  if (faces.some((f) => f.family === DISPLAY_FAMILY)) {
    // DS-1: the Latin display face draws [data-display] text; Hangul inside it falls to SB Sans through
    // --font-ed-display (checked above with the rest of the page). Anything else must be in the display subset.
    const latin = display
      .map((el) => [...(el.textContent ?? '')].filter((ch) => !isHangul(/** @type {number} */ (ch.codePointAt(0))) && ch.trim() !== '').join(''))
      .join('');
    const missing = uncoveredBy(latin, faces, DISPLAY_FAMILY);
    if (missing.length > 0) problems.push(`"${DISPLAY_FAMILY}" lacks ${describe(missing)} (a [data-display] element shows it)`);
  }
  if (/\/_fonts\//.test(html)) problems.push('an unresolved /_fonts/ placeholder is left in the page');
  return { problems, warnings };
}

test('every character a built page can render is in the subset font file that page loads', () => {
  const scripts = clientScriptText();
  /** @type {string[]} */
  const failures = [];
  for (const p of builtPages()) {
    const html = readFileSync(p.file, 'utf8');
    const { problems, warnings } = checkPage(html, scripts + linkedStyleText(html));
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

// MO-29 (named): the Korean heading face ("SB Serif KR Head", P2-3) left the site once no page declared it (data pages
// in DS-1, the chooser in MO-23); its build entry, instance test and [data-serif] self-test went with it. This guard stays.
test('no page declares or preloads the removed Korean heading face, and dist ships no file of it', () => {
  /** @type {string[]} */
  const wrong = [];
  for (const p of builtPages()) {
    const html = readFileSync(p.file, 'utf8');
    if (fontFaces(new JSDOM(html).window.document).some((f) => f.family === 'SB Serif KR Head')) wrong.push(`${p.route}: declares it`);
    if (/sb-serif-kr-head/.test(html)) wrong.push(`${p.route}: names its file`);
  }
  assert.deepEqual(wrong, []);
  assert.equal(walk(join(DIST, '_astro')).filter((f) => /[\\/]sb-serif-kr-head\./.test(f)).length, 0);
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

test('DS-1: data pages declare and preload the display face; no game or neutral page declares it', () => {
  /** @type {string[]} */
  const wrong = [];
  let data = 0;
  for (const p of builtPages()) {
    const html = readFileSync(p.file, 'utf8');
    const face = fontFaces(new JSDOM(html).window.document).filter((f) => f.family === DISPLAY_FAMILY);
    const isData = /^\/(en\/)?data\//.test(p.route);
    const preloads = [...html.matchAll(/<link rel="preload" href="([^"]+)"[^>]*as="font"/g)].map((m) => m[1]);
    if (isData) {
      data++;
      if (face.length !== 1) wrong.push(`${p.route}: ${face.length} display faces`);
      else if (!preloads.includes(face[0].url)) wrong.push(`${p.route}: the display face ${face[0].url} is not preloaded`);
      if (!/\/_astro\/sb-display\.[\w-]+\.woff2$/.test(face[0]?.url ?? '')) wrong.push(`${p.route}: display url ${face[0]?.url}`);
    } else {
      if (face.length > 0) wrong.push(`${p.route}: declares the display face`);
      if (preloads.some((u) => /sb-display/.test(u))) wrong.push(`${p.route}: preloads the display face`);
    }
  }
  assert.equal(data, 16, 'the 16 general-version pages');
  assert.deepEqual(wrong, []);
});

test('DS-1: every character inside an element whose computed family starts with SB Display is in the display subset or is Hangul (drawn by SB Sans)', () => {
  // Static form: [data-display] marks the elements set in --font-ed-display (editorial.css); checkPage checks their
  // non-Hangul characters against the page's display file. Self-test on /data/: a planted Latin word passes, a
  // character the subset lacks fails named, Hangul inside the element is left to SB Sans.
  const html = readFileSync(join(DIST, 'data', 'index.html'), 'utf8');
  const plant = (/** @type {string} */ text) => checkPage(html.replace('</main>', `<p data-display>${text}</p></main>`), '');
  assert.deepEqual(plant('DATA ANALYST 2026 · RECORDS &amp; CV').problems, []);
  assert.deepEqual(plant('2027년 2월').problems, []);
  // a probe the page's sans files draw (so only the display check can fail) that the display subset lacks
  const faces = fontFaces(new JSDOM(html).window.document);
  const display = fontCmap(/** @type {string} */ (faces.find((f) => f.family === DISPLAY_FAMILY)?.url));
  const sans = faces.filter((f) => f.family === SANS_FAMILY).flatMap((f) => [...fontCmap(f.url)]);
  const cp = sans.filter((c) => c > 0x7f && !isHangul(c) && !display.has(c) && !ignorable(String.fromCodePoint(c))).sort((a, b) => a - b)[0];
  assert.ok(cp !== undefined, 'a probe character');
  const probe = String.fromCodePoint(cp);
  const bug = plant(`DATA${probe}`);
  assert.equal(bug.problems.length, 1, bug.problems.join('\n'));
  assert.ok(bug.problems[0].startsWith(`"${DISPLAY_FAMILY}" lacks ${probe} (U+`), bug.problems[0]);
  // a page that shows [data-display] text must declare the face
  const game = readFileSync(join(DIST, 'game', 'index.html'), 'utf8');
  assert.match(checkPage(game.replace('</main>', '<p data-display>DATA</p></main>'), '').problems.join('\n'), /no @font-face for "SB Display"/);
});

test('DS-1: the display subset is one Archivo file with its copyright and licence URL, width pinned, weight 700–900', () => {
  const files = walk(join(DIST, '_astro')).filter((f) => /[\\/]sb-display\.[\w-]+\.woff2$/.test(f));
  assert.equal(files.length, 1);
  const tables = woff2Tables(readFileSync(files[0]));
  const fvar = tables.get('fvar');
  assert.ok(fvar, 'fvar');
  const v = new DataView(fvar.buffer, fvar.byteOffset, fvar.byteLength);
  assert.equal(v.getUint16(8), 1, 'one axis left');
  const at = v.getUint16(4);
  assert.equal(fvar.subarray(at, at + 4).toString('latin1'), 'wght');
  assert.deepEqual([v.getInt32(at + 4) / 65536, v.getInt32(at + 12) / 65536], [700, 900]);
  const records = parseName(/** @type {Buffer} */ (tables.get('name')));
  assert.match(records.find((r) => r.nameID === 0)?.value ?? '', /The Archivo Project Authors/);
  assert.match(records.find((r) => r.nameID === 14)?.value ?? '', /scripts\.sil\.org\/OFL|openfontlicense/i);
  assert.ok(readFileSync(files[0]).length < 24 * 1024, `display subset ${readFileSync(files[0]).length} B`);
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

/** Code points of a cover face's source file (JetBrains Mono latin, Anton latin). @param {string} family */
function coverSource(family) {
  const req = createRequire(import.meta.url);
  const file = family === COVER_MONO_FAMILY ? req.resolve('@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2') : req.resolve('@fontsource/anton/files/anton-latin-400-normal.woff2');
  const cmap = woff2Tables(readFileSync(file)).get('cmap');
  assert.ok(cmap);
  return cmapCodePoints(cmap);
}

test('MO-23: only the chooser declares the cover faces; each subset draws printable ASCII and every non-Hangul character the chooser shows; neither is preloaded', () => {
  /** @type {string[]} */
  const wrong = [];
  let chooserPages = 0;
  for (const p of builtPages()) {
    const html = readFileSync(p.file, 'utf8');
    const doc = new JSDOM(html).window.document;
    const faces = fontFaces(doc).filter((f) => f.family === COVER_MONO_FAMILY || f.family === COVER_DISPLAY_FAMILY);
    const chooser = p.route === '/' || p.route === '/en/';
    if (!chooser) {
      if (faces.length > 0) wrong.push(`${p.route}: declares a cover face`);
      continue;
    }
    chooserPages += 1;
    if (faces.length !== 2) wrong.push(`${p.route}: ${faces.length} cover faces`);
    if (/<link rel="preload"[^>]*sb-cover/.test(html)) wrong.push(`${p.route}: preloads a cover face`);
    const shown = [...new Set((doc.body.textContent ?? '') + PRINTABLE_ASCII)].filter((ch) => !ignorable(ch) && !isHangul(/** @type {number} */ (ch.codePointAt(0))) && ch !== '\n' && ch !== '\t');
    for (const f of faces) {
      const cmap = fontCmap(f.url);
      const source = coverSource(f.family);
      // a character the source font lacks (→, ↗) is drawn by the next font of the stack, as everywhere else
      const lacking = shown.filter((ch) => ch !== ' ' && source.has(/** @type {number} */ (ch.codePointAt(0))) && !cmap.has(/** @type {number} */ (ch.codePointAt(0))));
      if (lacking.length > 0) wrong.push(`${p.route}: "${f.family}" lacks ${lacking.join('')}`);
    }
  }
  assert.equal(chooserPages, 2);
  assert.deepEqual(wrong, []);
});

test('MO-29: the chooser printout\'s banner face draws every banner and contents-number character, only the chooser declares it, never preloaded', () => {
  /** @type {string[]} */
  const wrong = [];
  for (const p of builtPages()) {
    const html = readFileSync(p.file, 'utf8');
    const doc = new JSDOM(html).window.document;
    const faces = fontFaces(doc);
    const banner = faces.filter((f) => f.family === COVER_BANNER_FAMILY);
    const chooser = p.route === '/' || p.route === '/en/';
    if (!chooser) {
      if (banner.length > 0) wrong.push(`${p.route}: declares the banner face`);
      continue;
    }
    if (banner.length !== 1) wrong.push(`${p.route}: ${banner.length} banner faces`);
    if (/<link rel="preload"[^>]*sb-cover-banner/.test(html)) wrong.push(`${p.route}: preloads the banner face`);
    // the banner is uppercased by CSS: check the uppercase forms of the banner and the printout's contents numbers
    const text = [...doc.querySelectorAll('.file--data .pr__disp, .file--data .toc__n')].map((el) => (el.textContent ?? '').toUpperCase()).join('');
    if (text.trim() === '') wrong.push(`${p.route}: no banner text`);
    const missing = uncoveredBy(text, faces, COVER_BANNER_FAMILY);
    if (missing.length > 0) wrong.push(`${p.route}: "${COVER_BANNER_FAMILY}" lacks ${describe(missing)}`);
  }
  assert.deepEqual(wrong, []);
});
