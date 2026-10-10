// Build-time font subsetting (batch 2): an Astro integration that, after `astro build`, reads the built pages,
// subsets the page fonts to the characters they use, writes the subsets to dist/_astro/ under a content hash
// and points every page at them. `astro dev` serves the placeholder URLs from the font packages instead.
//
//   sans    Pretendard Variable → "SB Sans", wght 400–900, every character of the site (scripts/fonts/glyphs.mjs),
//           as two files (core / Hangul, see buildFonts). OFL 1.1 with Reserved Font Name "Pretendard": a subset is
//           a Modified Version, so its name table is rewritten (family/full/PostScript/unique names, variations
//           prefix, instance PostScript names); the copyright (0), license (13) and license URL (14) records stay.
//   mono    JetBrains Mono, the fontsource latin file unmodified (only copied under a content hash).
//   serifKo Noto Serif KR (fontsource ships it in ~120 unicode-range slices) → the Hangul inside the paper sheet
//           of the pages that load it (the Korean paper page). The needed slices are subset and merged into one
//           file. OFL 1.1 without a Reserved Font Name (fontsource LICENSE: "Google Inc."; name ID 0: Adobe).
//   display Archivo (fontsource latin wdth file) → "SB Display": printable ASCII + ALWAYS_SYMBOLS, width pinned at
//           112 %, weight 700–900, for the general version's Latin display words and numerals (DS-1). OFL 1.1 without
//           a Reserved Font Name, so the name table is kept as is (copyright 0 and license URL 14; the source has no 13).
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import subsetFont from 'subset-font';
import { CASE_DISPLAY_FAMILY, CASE_SERIF_FAMILY, FONT_URL, HANGUL_UNICODE_RANGE, SANS_FAMILY, fontFaceRule } from '../../src/lib/fonts.ts';
import {
  ALWAYS_SYMBOLS,
  PRINTABLE_ASCII,
  caseSheets,
  charSet,
  clientStyles,
  clientScripts,
  htmlText,
  isHangul,
  isIgnorable,
  paperHangul,
  paperSheetHtml,
  DISPLAY_CHARACTERS,
  sansCharacters,
  scriptText,
  setText,
  shownText,
  sitePages,
} from './glyphs.mjs';
import { cmapCodePoints, fontTables, mergeGlyfSlices, renameSfnt } from './sfnt.mjs';

const require = createRequire(import.meta.url);
const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

export const SOURCES = {
  sans: require.resolve('pretendard/dist/web/variable/woff2/PretendardVariable.woff2'),
  mono: require.resolve('@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2'),
  serifKoDir: dirname(require.resolve('@fontsource-variable/noto-serif-kr/files/noto-serif-kr-0-wght-normal.woff2')),
  display: require.resolve('@fontsource-variable/archivo/files/archivo-latin-wdth-normal.woff2'),
  coverDisplay: require.resolve('@fontsource/anton/files/anton-latin-400-normal.woff2'),
  caseSerif: require.resolve('@fontsource-variable/lora/files/lora-latin-wght-normal.woff2'),
  caseSerifItalic: require.resolve('@fontsource-variable/lora/files/lora-latin-wght-italic.woff2'),
  caseDisplay: require.resolve('@fontsource-variable/playfair-display/files/playfair-display-latin-wght-normal.woff2'),
  caseUi: require.resolve('@fontsource-variable/open-sans/files/open-sans-latin-wght-normal.woff2'),
};

/**
 * The chooser covers' faces (MO-23): every printable ASCII character (the owner may still change the Latin labels, and
 * the foot line is uppercased by CSS) plus every non-Hangul character the pages that declare the face show. The mono
 * face is pinned to wght 600, the only weight the covers set it in.
 * @param {'coverMono' | 'coverDisplay'} face @param {string[]} htmls
 */
export async function subsetCover(face, htmls) {
  const chars = new Set([...PRINTABLE_ASCII, ...charSet(htmls.map((h) => shownText(h)))].filter((ch) => {
    const cp = /** @type {number} */ (ch.codePointAt(0));
    return !isHangul(cp) && !isIgnorable(ch) && cp >= 0x20;
  }));
  const source = readFileSync(face === 'coverMono' ? SOURCES.mono : SOURCES.coverDisplay);
  const data = await subsetFont(source, setText(chars), { targetFormat: 'woff2', ...(face === 'coverMono' ? { variationAxes: { wght: 600 } } : {}) });
  return { data, chars: chars.size };
}

/** OpenType features the pages can trigger (kerning, ligatures, marks, tabular figures, Hangul jamo). */
const SANS_FEATURES = ['kern', 'liga', 'calt', 'ccmp', 'locl', 'mark', 'mkmk', 'tnum', 'case', 'ljmo', 'vjmo', 'tjmo'];
/** Name records kept in the sans subset: harfbuzz keeps only IDs 0–6 (and the fvar/STAT ones) unless told. */
const SANS_NAME_IDS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 25];

/** The subset's own names (OFL: a Modified Version must not use the Reserved Font Name "Pretendard"). */
export const SANS_NAMES = {
  family: SANS_FAMILY,
  postscript: SANS_FAMILY.replace(/\s+/g, ''),
  description:
    'Subset of Pretendard Variable 1.309 (Kil Hyung-jin, SIL Open Font License 1.1) made for lunecid.github.io: ' +
    'only the characters the site uses, weight axis 400-900. Renamed because "Pretendard" is a Reserved Font Name.',
};

/**
 * New value of a Pretendard name record, or the old one. IDs 1/3/4/6/16/17/25 and the named-instance
 * PostScript names (IDs ≥ 256) must not present "Pretendard" as the font's name.
 * @param {import('./sfnt.mjs').NameRecord} r
 */
export function renameSansRecord(r) {
  switch (r.nameID) {
    case 1: // family
    case 4: // full name
    case 16: // typographic family
      return SANS_NAMES.family;
    case 3: // unique id: "1.309;CTUS;PretendardVariable"
      return `${r.value.split(';')[0]};${SANS_NAMES.postscript}-Regular;lunecid.github.io`;
    case 6: // PostScript name
      return `${SANS_NAMES.postscript}-Regular`;
    case 25: // variations PostScript name prefix
      return SANS_NAMES.postscript;
    default:
      return r.nameID >= 256 ? r.value.replace(/PretendardVariable|Pretendard/g, SANS_NAMES.postscript) : r.value;
  }
}

/** @param {string} text */
export async function subsetSans(text) {
  const source = readFileSync(SOURCES.sans);
  const sfnt = await subsetFont(source, text, {
    targetFormat: 'sfnt',
    variationAxes: { wght: { min: 400, max: 900 } },
    keepFeatures: SANS_FEATURES,
    preserveNameIds: SANS_NAME_IDS,
  });
  const renamed = renameSfnt(sfnt, renameSansRecord, [
    { platformID: 3, encodingID: 1, languageID: 0x409, nameID: 10, value: SANS_NAMES.description },
  ]);
  // A second harfbuzz pass that keeps every glyph only re-encodes the renamed font as WOFF2.
  return subsetFont(renamed, null, { keepAllGlyphs: true, targetFormat: 'woff2', preserveNameIds: SANS_NAME_IDS });
}

/** The chooser printout's banner face: uppercase Latin, digits, space and full stop (the banner words are Latin and
 *  uppercased by CSS; the contents numbers are digits). */
export const COVER_BANNER_CHARACTERS = ' .0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * The chooser printout's banner face (MO-29): Archivo as the display face, pinned to wdth 112 and wght 900 (the banner
 * is 900; the contents numbers ask for 800 and take the same file), over COVER_BANNER_CHARACTERS only.
 */
export async function subsetCoverBanner() {
  return subsetFont(readFileSync(SOURCES.display), COVER_BANNER_CHARACTERS, {
    targetFormat: 'woff2',
    variationAxes: { wdth: 112, wght: 900 },
    keepFeatures: ['kern', 'tnum', 'lnum'],
    preserveNameIds: [0, 1, 2, 3, 4, 5, 6, 13, 14],
  });
}

/** Features the display words and numerals can trigger. */
const DISPLAY_FEATURES = ['kern', 'liga', 'tnum', 'case', 'lnum'];

/**
 * The display face: Archivo with the width axis pinned at 112 % and the weight axis cut to 700–900, over printable
 * ASCII and the symbol list (a fixed set: the display words are Latin, so the file does not depend on the pages).
 * @param {string} [text]
 */
export async function subsetDisplay(text = DISPLAY_CHARACTERS) {
  return subsetFont(readFileSync(SOURCES.display), text, {
    targetFormat: 'woff2',
    variationAxes: { wdth: 112, wght: { min: 700, max: 900 } },
    keepFeatures: DISPLAY_FEATURES,
    preserveNameIds: [0, 1, 2, 3, 4, 5, 6, 13, 14],
  });
}

/** @type {Map<string, Set<number>> | null} */
let serifSliceCmaps = null;
/** The fontsource latin slice: the OG title instance takes Latin from it when no numbered slice has the character. */
const SERIF_LATIN_SLICE = 'noto-serif-kr-latin-wght-normal.woff2';
/** Code points per fontsource slice file (numbered slices in name order, then the latin slice), read from each cmap. */
function serifSlices() {
  if (!serifSliceCmaps) {
    serifSliceCmaps = new Map();
    const names = readdirSync(SOURCES.serifKoDir).filter((f) => /^noto-serif-kr-\d+-wght-normal\.woff2$/.test(f)).sort();
    for (const name of [...names, SERIF_LATIN_SLICE]) {
      const cmap = fontTables(readFileSync(join(SOURCES.serifKoDir, name))).get('cmap');
      if (cmap) serifSliceCmaps.set(name, cmapCodePoints(cmap));
    }
  }
  return serifSliceCmaps;
}

/** Tables the slices carry that one merged, horizontal file does not need. */
const SERIF_DROP = ['GSUB', 'GPOS', 'GDEF', 'BASE', 'HVAR', 'VVAR', 'MVAR', 'vhea', 'vmtx', 'VORG'];

/**
 * One font with the given characters from Noto Serif KR: subset each slice that has some of them, merge the slices,
 * then let harfbuzz re-encode the merged font. Characters Noto Serif KR does not have (archaic jamo, say) are returned
 * in `missing` instead of failing the build. `data` is null when none of the characters exists in the font.
 * - default: variable WOFF2 over the Hangul of `text` (the paper page's "SB Serif KR", unchanged since batch 2);
 * - wght: the weight axis pinned to that value in every slice (a static instance, no fvar/gvar): 700 for the general
 *   version's heading face (P2-3) and the OG title instance (P2-12); or cut to a { min, max } range (the case overlay's
 *   Korean serif, 400–700);
 * - format 'sfnt': a TrueType file (satori reads TTF/OTF/WOFF, not WOFF2);
 * - latin: every printable character of `text`, not only Hangul (the OG title instance).
 * @param {string} text
 * @param {{ format?: 'woff2' | 'sfnt'; wght?: number | { min: number; max: number }; latin?: boolean }} [options]
 * @returns {Promise<{ data: Buffer | null; missing: string[] }>}
 */
export async function subsetSerifKo(text, { format = 'woff2', wght, latin = false } = {}) {
  const wanted = [...new Set(text)].filter((ch) => {
    const cp = /** @type {number} */ (ch.codePointAt(0));
    return isHangul(cp) || (latin && cp >= 0x20 && !isIgnorable(ch));
  });
  /** @type {Map<string, string>} */
  const bySlice = new Map();
  /** @type {string[]} */
  const missing = [];
  for (const ch of wanted) {
    const cp = /** @type {number} */ (ch.codePointAt(0));
    const slice = [...serifSlices()].find(([name, cps]) => (latin || name !== SERIF_LATIN_SLICE) && cps.has(cp))?.[0];
    if (!slice) missing.push(ch);
    else bySlice.set(slice, (bySlice.get(slice) ?? '') + ch);
  }
  if (bySlice.size === 0) return { data: null, missing };
  const pin = wght === undefined ? {} : { variationAxes: { wght } };
  const slices = [];
  for (const [name, chars] of bySlice) {
    const source = readFileSync(join(SOURCES.serifKoDir, name));
    try {
      slices.push(await subsetFont(source, chars, { targetFormat: 'sfnt', dropTables: SERIF_DROP, noLayoutClosure: true, keepFeatures: [], preserveNameIds: [0, 13, 14], ...pin }));
    } catch (error) {
      throw new Error(`subsetting the Noto Serif KR slice ${name} to "${chars}" failed: ${errorMessage(error)}`, { cause: error });
    }
  }
  let merged;
  try {
    merged = mergeGlyfSlices(slices);
  } catch (error) {
    throw new Error(`merging ${slices.length} Noto Serif KR slices failed: ${errorMessage(error)}`, { cause: error });
  }
  const kept = [...bySlice.values()].join('');
  const data = await subsetFont(merged, kept, {
    targetFormat: format,
    dropTables: SERIF_DROP,
    noLayoutClosure: true,
    keepFeatures: [],
    preserveNameIds: [0, 13, 14],
  });
  return { data, missing };
}

/** @param {unknown} error */
const errorMessage = (error) => (error instanceof Error ? error.message : String(error));

/** Code points a source font file (WOFF2) maps. @param {string} file */
export function sourceCodePoints(file) {
  const cmap = fontTables(readFileSync(file)).get('cmap');
  if (!cmap) throw new Error(`${file} has no cmap table`);
  return cmapCodePoints(cmap);
}

// ── the case-study overlay's faces (CS-8) ──

/** OpenType features the case sheets can trigger (lining and tabular figures, kerning, ligatures, marks). */
const CASE_FEATURES = ['kern', 'liga', 'calt', 'ccmp', 'locl', 'mark', 'mkmk', 'lnum', 'tnum', 'case'];
const CASE_NAME_IDS = [0, 1, 2, 3, 4, 5, 6, 13, 14, 16, 17, 25];

/**
 * A name-record rewrite for a subset of a font whose name is reserved (OFL 1.1 Reserved Font Name: Lora, Playfair
 * Display): family/full/unique/PostScript names, the variations prefix and the instance PostScript names take the
 * renamed family; the copyright (0), licence (13) and licence URL (14) records stay.
 * @param {string} family @param {RegExp} reserved
 * @returns {(r: import('./sfnt.mjs').NameRecord) => string}
 */
export function renameReserved(family, reserved) {
  const ps = family.replace(/\s+/g, '');
  return (r) => {
    switch (r.nameID) {
      case 1:
      case 16:
        return family;
      case 4:
        return /italic/i.test(r.value) ? `${family} Italic` : family;
      case 3:
        return `${r.value.split(';')[0]};${ps};lunecid.github.io`;
      case 6:
        return /italic/i.test(r.value) ? `${ps}-Italic` : `${ps}-Regular`;
      case 25:
        return ps;
      default:
        return r.nameID >= 256 || r.nameID === 17 ? r.value.replace(reserved, ps) : r.value;
    }
  };
}

/**
 * One Latin case face over `text`: Lora (upright 400–700, italic 400) and Playfair Display (600) renamed, Open Sans
 * (400–700) as is.
 * @param {'caseSerif' | 'caseSerifItalic' | 'caseDisplay' | 'caseUi'} face @param {string} text
 */
export async function subsetCaseLatin(face, text) {
  const axes = { caseSerif: { wght: { min: 400, max: 700 } }, caseSerifItalic: { wght: 400 }, caseDisplay: { wght: 600 }, caseUi: { wght: { min: 400, max: 700 } } }[face];
  const sfnt = await subsetFont(readFileSync(SOURCES[face]), text, { targetFormat: 'sfnt', variationAxes: axes, keepFeatures: CASE_FEATURES, preserveNameIds: CASE_NAME_IDS });
  const rename = face === 'caseDisplay' ? renameReserved(CASE_DISPLAY_FAMILY, /Playfair ?Display|Playfair/g) : face === 'caseUi' ? null : renameReserved(CASE_SERIF_FAMILY, /Lora/g);
  const renamed = rename ? renameSfnt(sfnt, rename) : sfnt;
  return subsetFont(renamed, null, { keepAllGlyphs: true, targetFormat: 'woff2', preserveNameIds: CASE_NAME_IDS });
}

/** The Latin (non-Hangul) characters the case faces must draw: printable ASCII, the symbol list and every sheet. @param {string[]} texts */
export function caseLatinCharacters(texts) {
  return setText(new Set([...charSet([PRINTABLE_ASCII, ALWAYS_SYMBOLS, ...texts])].filter((ch) => !isHangul(/** @type {number} */ (ch.codePointAt(0))))));
}

/** @param {string} ch */
const hexCode = (ch) => `U+${ch.codePointAt(0)?.toString(16).toUpperCase().padStart(4, '0')}`;
/** "漢 (U+6F22) 字 (U+5B57)" @param {Iterable<string>} chars */
export const describeChars = (chars) => [...chars].map((ch) => `${ch} (${hexCode(ch)})`).join(' ');

/** Everything outside the Hangul blocks of HANGUL_UNICODE_RANGE. */
const NON_HANGUL_RANGE = 'U+0-10FF,U+1200-312F,U+3190-A95F,U+A980-ABFF,U+D800-10FFFF';

/** @param {Buffer} data */
const contentHash = (data) => createHash('sha256').update(data).digest('base64url').slice(0, 10).replace(/[-_]/g, 'x');

/**
 * Korean pages that keep the shared Hangul file instead of one of their own: the chooser, whose HTML is within
 * ~100 B of its first-flight budget (B.3, chooser-budget.test.ts) — a page file's unicode-range would not fit — and
 * which measures 0.97 on mobile Lighthouse with the shared file.
 */
const SHARED_HANGUL_ROUTES = new Set(['/']);

/** "U+AC00-AC02,U+B098" for a set of characters, consecutive code points merged. @param {Set<string>} chars */
export function codePointRange(chars) {
  const cps = [...chars].map((ch) => /** @type {number} */ (ch.codePointAt(0))).sort((a, b) => a - b);
  const hex = (/** @type {number} */ cp) => cp.toString(16).toUpperCase();
  /** @type {string[]} */
  const out = [];
  for (let i = 0; i < cps.length; ) {
    let j = i;
    while (j + 1 < cps.length && cps[j + 1] === cps[j] + 1) j += 1;
    out.push(i === j ? `U+${hex(cps[i])}` : `U+${hex(cps[i])}-${hex(cps[j])}`);
    i = j + 1;
  }
  return out.join(',');
}

/**
 * @typedef {{ face: keyof typeof FONT_URL; url: string; bytes: number; chars: number; pages: number }} FontResult
 */

/** A font preload tag as Astro renders it. @param {string} url */
const preloadTag = (url) => `<link rel="preload" href="${url}" as="font" type="font/woff2" crossorigin>`;

/**
 * Subsets every face the built pages reference, writes dist/_astro/<name>.<hash>.woff2, and rewrites the pages:
 * placeholder URLs → hashed files, the sans placeholder rule → the sans rules, the sans preload → the core
 * preload (+ the Hangul preload on Korean pages). Throws when a page still references a placeholder afterwards.
 *
 * The sans face ships as two shared files (measured: English pages 0.92 → 0.95 on mobile Lighthouse, Korean pages
 * unchanged): "core" = Latin, symbols and every Hangul syllable some English page shows as text (the "한국어"
 * language switch, the Korean GitHub descriptions on /en/projects/), and "ko" = the rest of the Hangul. The ko
 * rule is declared first, so the core rule (declared last) wins for the Hangul both claim and no English page
 * needs the ko file. JetBrains Mono ships unmodified (fontsource latin file, hashed copy): subsetting it saved
 * 9 KB and measured no difference.
 *
 * Each Korean page (but the chooser, SHARED_HANGUL_ROUTES) also gets a Hangul file of its own (2026-10-10): the ko
 * Hangul its HTML can put on screen (text, attributes, island props, inline scripts), declared between the shared ko
 * rule and the core rule with exactly those code points as its unicode-range, and preloaded instead of the shared
 * ko file. The ko file holds every Hangul syllable of the site (the Player Log shows 302 of 708: 40 KB of 91 KB),
 * and on the simulated mobile network of Lighthouse it was the longest download before the first paint: with the
 * page files the Player Log measured 0.94–0.98 (was 0.92–0.93; CI had failed it at 0.89) and /game/ 0.98–0.99. The
 * shared ko rule stays: it draws what only client code shows (an island's own strings, the case sheets' UI text) and
 * is fetched only then. Pages with the same Hangul share one file.
 *
 * Characters a source font does not have (a CJK ideograph in a fetched GitHub description, archaic jamo) are not
 * an error: they cannot be in any subset, the browser draws them with the next font of the stack, and the daily
 * cron build must not fail on third-party text. They are reported through `warn` with the pages that show them.
 * Every other failure is thrown as "font-subsets: <step>: <cause>".
 * @param {string} distDir
 * @param {{ warn?: (message: string) => void }} [options]
 * @returns {Promise<FontResult[]>}
 */
export async function buildFonts(distDir, { warn = (message) => console.warn(message) } = {}) {
  /** @template T @param {string} label @param {() => T | Promise<T>} fn @returns {Promise<T>} */
  const step = async (label, fn) => {
    try {
      return await fn();
    } catch (error) {
      throw new Error(`font-subsets: ${label}: ${errorMessage(error)}`, { cause: error });
    }
  };
  const pages = await step('reading the built pages', () => sitePages(distDir).map((p) => ({ ...p, html: readFileSync(p.file, 'utf8') })));
  /** @type {FontResult[]} */
  const results = [];
  /** @type {Map<string, string>} */
  const replace = new Map();
  /**
   * @param {keyof typeof FONT_URL} face @param {string} name @param {Buffer} data @param {number} chars
   * @param {number} [pageCount] the pages that load the file (default: every page that declares the face)
   */
  const write = (face, name, data, chars, pageCount = pages.filter((p) => p.html.includes(FONT_URL[face])).length) => {
    const url = `/_astro/${name}.${contentHash(data)}.woff2`;
    writeFileSync(join(distDir, ...url.split('/').filter(Boolean)), data);
    results.push({ face, url, bytes: data.length, chars, pages: pageCount });
    return url;
  };
  /**
   * Warns once per page (and once for the client bundles) about the characters of `lacking` it contains.
   * @param {string} font @param {Set<string>} lacking @param {{ label: string; text: string }[]} sources
   */
  const warnLacking = (font, lacking, sources) => {
    for (const { label, text } of sources) {
      const shown = [...new Set(text)].filter((ch) => lacking.has(ch));
      if (shown.length > 0) warn(`font-subsets: ${label}: ${font} has no glyph for ${describeChars(shown)}; a system font draws it`);
    }
  };

  // ── sans ──
  const sansSource = await step('reading the Pretendard Variable cmap', () => sourceCodePoints(SOURCES.sans));
  const all = await step('collecting the characters of the built pages', () => sansCharacters(distDir));
  const hasGlyph = (/** @type {string} */ ch) => sansSource.has(/** @type {number} */ (ch.codePointAt(0)));
  const lacking = new Set([...all].filter((ch) => !hasGlyph(ch)));
  if (lacking.size > 0) {
    warnLacking('Pretendard Variable', lacking, [
      ...pages.map((p) => ({ label: p.route, text: htmlText(p.html) })),
      { label: 'client bundles (dist/_astro/*.js)', text: clientScripts(distDir).map((f) => scriptText(readFileSync(f, 'utf8'))).join('') },
    ]);
  }
  const sans = new Set([...all].filter(hasGlyph));
  const hangul = (/** @type {string} */ ch) => isHangul(/** @type {number} */ (ch.codePointAt(0)));
  const shownEn = charSet(pages.filter((p) => p.route.startsWith('/en/')).map((p) => shownText(p.html)));
  const core = new Set([...sans].filter((ch) => !hangul(ch) || shownEn.has(ch)));
  const rest = new Set([...sans].filter((ch) => !core.has(ch)));
  const coreFont = await step(`subsetting Pretendard Variable (core, ${core.size} characters)`, () => subsetSans(setText(core)));
  const coreUrl = write('sans', 'sb-sans', coreFont, core.size);
  let koUrl = null;
  if (rest.size > 0) {
    const koFont = await step(`subsetting Pretendard Variable (Hangul, ${rest.size} characters)`, () => subsetSans(setText(rest)));
    koUrl = write('sans', 'sb-sans-ko', koFont, rest.size);
  }
  const coreRange = [NON_HANGUL_RANGE, ...[...core].filter(hangul).map((ch) => `U+${ch.codePointAt(0)?.toString(16).toUpperCase()}`)];
  const koRule = koUrl ? fontFaceRule('sans', koUrl, HANGUL_UNICODE_RANGE) : '';
  const coreRule = fontFaceRule('sans', coreUrl, coreRange.join(','));
  // each Korean page's own Hangul file (see above); route → its file and unicode-range
  /** @type {Map<string, { url: string; range: string }>} */
  const ownHangul = new Map();
  if (koUrl) {
    /** @type {Map<string, FontResult>} */
    const shared = new Map(); // a page file's characters → its result (pages with the same Hangul share the file)
    for (const page of pages) {
      if (SHARED_HANGUL_ROUTES.has(page.route) || !/<html[^>]*\slang="ko"/.test(page.html) || !page.html.includes(fontFaceRule('sans'))) continue;
      const own = new Set([...htmlText(page.html)].filter((ch) => rest.has(ch)));
      if (own.size === 0) continue;
      const text = setText(own);
      let result = shared.get(text);
      if (result) result.pages += 1;
      else {
        const data = await step(`subsetting Pretendard Variable (the Hangul of ${page.route}, ${own.size} characters)`, () => subsetSans(text));
        write('sans', 'sb-sans-ko-page', data, own.size, 1);
        result = /** @type {FontResult} */ (results.at(-1));
        shared.set(text, result);
      }
      ownHangul.set(page.route, { url: result.url, range: codePointRange(own) });
    }
  }

  // ── mono ──
  if (pages.some((p) => p.html.includes(FONT_URL.mono))) {
    const mono = await step('reading the JetBrains Mono file', () => readFileSync(SOURCES.mono));
    replace.set(FONT_URL.mono, write('mono', 'jetbrains-mono', mono, 0));
  }

  // ── the chooser covers' mono and display faces (MO-23): chooser pages only, never preloaded ──
  for (const face of /** @type {const} */ (['coverMono', 'coverDisplay'])) {
    const coverPages = pages.filter((p) => p.html.includes(FONT_URL[face]));
    if (coverPages.length === 0) continue;
    const { data, chars } = await step(`subsetting the chooser cover face ${face}`, () => subsetCover(face, coverPages.map((p) => p.html)));
    replace.set(FONT_URL[face], write(face, face === 'coverMono' ? 'sb-cover-mono' : 'sb-cover-display', data, chars));
  }

  // ── Korean serif ──
  const serifPages = pages.filter((p) => p.html.includes(FONT_URL.serifKo));
  if (serifPages.length > 0) {
    const serif = await step('collecting the Hangul of the paper sheets', () => paperHangul(serifPages.map((p) => p.file)));
    const { data, missing } = await step(`building the Noto Serif KR subset (${serif.size} characters)`, () => subsetSerifKo(setText(serif)));
    if (missing.length > 0) {
      warnLacking('Noto Serif KR', new Set(missing), serifPages.map((p) => ({ label: p.route, text: htmlText(paperSheetHtml(p.html)) })));
    }
    if (data) {
      replace.set(FONT_URL.serifKo, write('serifKo', 'sb-serif-kr', data, serif.size - missing.length));
    } else {
      // Nothing to subset: drop the rule, the stack after "SB Serif KR" draws the text.
      // (the general paper page declares the face font-display: optional and preloads it: both go too)
      replace.set(fontFaceRule('serifKo'), '');
      replace.set(fontFaceRule('serifKo').replace('font-display:swap', 'font-display:optional'), '');
      replace.set(preloadTag(FONT_URL.serifKo), '');
      warn(`font-subsets: no Noto Serif KR subset was built (none of the paper's Hangul is in the font); ${serifPages.map((p) => p.route).join(', ')} fall back to the system serif`);
    }
  }

  // ── the chooser printout's banner face (MO-29): one fixed subset, chooser pages only, never preloaded ──
  if (pages.some((p) => p.html.includes(FONT_URL.coverBanner))) {
    const banner = await step('subsetting Archivo (the chooser banner)', () => subsetCoverBanner());
    replace.set(FONT_URL.coverBanner, write('coverBanner', 'sb-cover-banner', banner, COVER_BANNER_CHARACTERS.length));
  }

  // ── Latin display face (general version, DS-1): one fixed subset, written only when some page declares it; its
  //    preload is rewritten with the URL below. ──
  if (pages.some((p) => p.html.includes(FONT_URL.display))) {
    const display = await step('subsetting Archivo (display)', () => subsetDisplay());
    replace.set(FONT_URL.display, write('display', 'sb-display', display, DISPLAY_CHARACTERS.length));
  }

  // ── the case-study overlay's faces (CS-8): declared only in the lazy overlay stylesheet (dist/_astro/overlay.*.css),
  //    subset to the overlay's sheets (dist/case/**); the stylesheets that declare them are rewritten here. ──
  const caseCss = await step('finding the case overlay stylesheet', () => clientStyles(distDir).filter((f) => readFileSync(f, 'utf8').includes(FONT_URL.caseSerif)));
  if (caseCss.length > 0) {
    const sheets = await step('reading the case sheets', () => caseSheets(distDir));
    if (sheets.length === 0) throw new Error('font-subsets: the case overlay stylesheet declares its faces but dist/case/ has no sheet');
    const latin = caseLatinCharacters(sheets.map((x) => x.text));
    /** @type {Map<string, string>} */
    const caseUrls = new Map();
    for (const face of /** @type {const} */ (['caseSerif', 'caseSerifItalic', 'caseDisplay', 'caseUi'])) {
      const data = await step(`subsetting the case face ${face}`, () => subsetCaseLatin(face, latin));
      caseUrls.set(FONT_URL[face], write(face, `sb-case-${face.replace(/^case/, '').replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`).replace(/^-/, '')}`, data, [...latin].length));
    }
    const hangul = setText(new Set([...sheets.filter((x) => x.lang === 'ko').map((x) => x.text).join('')].filter((ch) => isHangul(/** @type {number} */ (ch.codePointAt(0))))));
    const { data, missing } = await step(`building the case Korean serif (${hangul.length} characters)`, () => subsetSerifKo(hangul, { wght: { min: 400, max: 700 } }));
    if (missing.length > 0) warn(`font-subsets: the case sheets: Noto Serif KR has no glyph for ${describeChars(missing)}; a system font draws it`);
    if (!data) throw new Error('font-subsets: the case Korean serif has no glyph to subset');
    caseUrls.set(FONT_URL.caseSerifKo, write('caseSerifKo', 'sb-case-serif-kr', data, hangul.length - missing.length));
    for (const file of caseCss) {
      await step(`rewriting ${file}`, () => {
        let css = readFileSync(file, 'utf8');
        for (const [from, to] of caseUrls) css = css.split(from).join(to);
        if (css.includes('/_fonts/')) throw new Error(`${file} still references a /_fonts/ placeholder after the rewrite`);
        writeFileSync(file, css);
      });
    }
  }

  // ── pages ──
  for (const page of pages) {
    await step(`rewriting ${page.route}`, () => {
      let html = page.html;
      for (const [from, to] of replace) html = html.split(from).join(to);
      const own = ownHangul.get(page.route);
      html = html.split(fontFaceRule('sans')).join(koRule + (own ? fontFaceRule('sans', own.url, own.range) : '') + coreRule);
      const korean = /<html[^>]*\slang="ko"/.test(html);
      const hangulPreload = own ? preloadTag(own.url) : korean && koUrl ? preloadTag(koUrl) : '';
      html = html.split(preloadTag(FONT_URL.sans)).join(preloadTag(coreUrl) + hangulPreload);
      const left = Object.values(FONT_URL).filter((url) => html.includes(url));
      if (left.length > 0) {
        throw new Error(
          `the page still references ${left.join(', ')} after the rewrite: its font <style>/<link> no longer matches src/lib/fonts.ts (fontFaceRule, FONT_URL)`,
        );
      }
      if (html !== page.html) writeFileSync(page.file, html);
    });
  }
  return results;
}

// ── dev server ────────────────────────────────────────────────────────────────

/** @type {Promise<Buffer | null> | null} */
let devSerif = null;

/** Every Hangul syllable in src/ (a superset of what the paper page shows), for the dev-server serif. */
function sourceHangul() {
  /** @param {string} dir @returns {string[]} */
  const walk = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
  const files = walk(join(REPO_ROOT, 'src')).filter((f) => /\.(md|ya?ml|ts|tsx|astro|json)$/.test(f));
  return setText(new Set([...files.map((f) => readFileSync(f, 'utf8')).join('')].filter((ch) => isHangul(/** @type {number} */ (ch.codePointAt(0))))));
}

/**
 * The font file the dev server returns for a placeholder URL, or null. Sans and mono are the unmodified
 * source files (local development only, never published); the serif is merged once from src/'s Hangul.
 * @param {string} url
 * @returns {Promise<Buffer | null>}
 */
export async function devFont(url) {
  if (url === FONT_URL.sans) return readFileSync(SOURCES.sans);
  if (url === FONT_URL.mono || url === FONT_URL.coverMono) return readFileSync(SOURCES.mono);
  if (url === FONT_URL.coverDisplay) return readFileSync(SOURCES.coverDisplay);
  if (url === FONT_URL.serifKo) return (devSerif ??= subsetSerifKo(sourceHangul()).then((r) => r.data));
  if (url === FONT_URL.display) return subsetDisplay();
  if (url === FONT_URL.coverBanner) return subsetCoverBanner();
  for (const face of /** @type {const} */ (['caseSerif', 'caseSerifItalic', 'caseDisplay', 'caseUi'])) if (url === FONT_URL[face]) return readFileSync(SOURCES[face]);
  if (url === FONT_URL.caseSerifKo) return (devSerif ??= subsetSerifKo(sourceHangul()).then((r) => r.data));
  return null;
}

// ── Astro integration ─────────────────────────────────────────────────────────

/** @returns {import('astro').AstroIntegration} */
export function fontSubsets() {
  return {
    name: 'font-subsets',
    hooks: {
      'astro:server:setup': ({ server }) => {
        server.middlewares.use((req, res, next) => {
          const url = (req.url ?? '').split('?')[0];
          if (!url.startsWith('/_fonts/')) return next();
          devFont(url).then(
            (data) => {
              if (!data) return next();
              res.setHeader('Content-Type', 'font/woff2');
              res.setHeader('Cache-Control', 'no-cache');
              res.end(data);
            },
            (error) => next(error),
          );
        });
      },
      'astro:build:done': async ({ dir, logger }) => {
        const distDir = fileURLToPath(dir);
        if (!existsSync(join(distDir, '_astro'))) throw new Error(`font-subsets: ${join(distDir, '_astro')} is missing (nothing to subset into)`);
        for (const r of await buildFonts(distDir, { warn: (message) => logger.warn(message.replace(/^font-subsets: /, '')) })) {
          logger.info(`${r.url} ${(r.bytes / 1024).toFixed(1)} KiB, ${r.chars > 0 ? `${r.chars} characters` : 'unmodified'}, ${r.pages} pages`);
        }
      },
    },
  };
}
