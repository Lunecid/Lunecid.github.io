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
//   serifKoHead  Noto Serif KR, static wght 700 → the Hangul inside [data-serif] on the general version's pages (P2-3).
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import subsetFont from 'subset-font';
import { FONT_URL, HANGUL_UNICODE_RANGE, SANS_FAMILY, fontFaceRule } from '../../src/lib/fonts.ts';
import {
  charSet,
  clientScripts,
  htmlText,
  isHangul,
  isIgnorable,
  paperHangul,
  paperSheetHtml,
  sansCharacters,
  scriptText,
  serifHeadHangul,
  serifHeadHtml,
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
};

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
 *   version's heading face (P2-3) and the OG title instance (P2-12);
 * - format 'sfnt': a TrueType file (satori reads TTF/OTF/WOFF, not WOFF2);
 * - latin: every printable character of `text`, not only Hangul (the OG title instance).
 * @param {string} text
 * @param {{ format?: 'woff2' | 'sfnt'; wght?: number; latin?: boolean }} [options]
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

/** @param {string} ch */
const hexCode = (ch) => `U+${ch.codePointAt(0)?.toString(16).toUpperCase().padStart(4, '0')}`;
/** "漢 (U+6F22) 字 (U+5B57)" @param {Iterable<string>} chars */
export const describeChars = (chars) => [...chars].map((ch) => `${ch} (${hexCode(ch)})`).join(' ');

/** Everything outside the Hangul blocks of HANGUL_UNICODE_RANGE. */
const NON_HANGUL_RANGE = 'U+0-10FF,U+1200-312F,U+3190-A95F,U+A980-ABFF,U+D800-10FFFF';

/** @param {Buffer} data */
const contentHash = (data) => createHash('sha256').update(data).digest('base64url').slice(0, 10).replace(/[-_]/g, 'x');

/**
 * @typedef {{ face: keyof typeof FONT_URL; url: string; bytes: number; chars: number; pages: number }} FontResult
 */

/** A font preload tag as Astro renders it. @param {string} url */
const preloadTag = (url) => `<link rel="preload" href="${url}" as="font" type="font/woff2" crossorigin>`;

/**
 * Subsets every face the built pages reference, writes dist/_astro/<name>.<hash>.woff2, and rewrites the pages:
 * placeholder URLs → hashed files, the sans placeholder rule → the two sans rules, the sans preload → the core
 * preload (+ the Hangul preload on Korean pages). Throws when a page still references a placeholder afterwards.
 *
 * The sans face ships as two files (measured: English pages 0.92 → 0.95 on mobile Lighthouse, Korean pages
 * unchanged): "core" = Latin, symbols and every Hangul syllable some English page shows as text (the "한국어"
 * language switch, the Korean GitHub descriptions on /en/projects/), and "ko" = the rest of the Hangul. The ko
 * rule is declared first, so the core rule (declared last) wins for the Hangul both claim and no English page
 * needs the ko file. JetBrains Mono ships unmodified (fontsource latin file, hashed copy): subsetting it saved
 * 9 KB and measured no difference.
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
  /** @param {keyof typeof FONT_URL} face @param {string} name @param {Buffer} data @param {number} chars */
  const write = (face, name, data, chars) => {
    const url = `/_astro/${name}.${contentHash(data)}.woff2`;
    writeFileSync(join(distDir, ...url.split('/').filter(Boolean)), data);
    results.push({ face, url, bytes: data.length, chars, pages: pages.filter((p) => p.html.includes(FONT_URL[face])).length });
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
  replace.set(
    fontFaceRule('sans'),
    (koUrl ? fontFaceRule('sans', koUrl, HANGUL_UNICODE_RANGE) : '') + fontFaceRule('sans', coreUrl, coreRange.join(',')),
  );

  // ── mono ──
  if (pages.some((p) => p.html.includes(FONT_URL.mono))) {
    const mono = await step('reading the JetBrains Mono file', () => readFileSync(SOURCES.mono));
    replace.set(FONT_URL.mono, write('mono', 'jetbrains-mono', mono, 0));
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
      replace.set(fontFaceRule('serifKo'), '');
      warn(`font-subsets: no Noto Serif KR subset was built (none of the paper's Hangul is in the font); ${serifPages.map((p) => p.route).join(', ')} fall back to the system serif`);
    }
  }

  // ── Korean heading serif (general version, P2-3): one static wght-700 file for the Hangul inside [data-serif] of the
  //    pages that declare it; never preloaded (font-display: swap). English pages declare it but never download it. ──
  const headPages = pages.filter((p) => p.html.includes(FONT_URL.serifKoHead));
  if (headPages.length > 0) {
    const head = await step('collecting the Hangul of the [data-serif] headings', () => serifHeadHangul(headPages.map((p) => p.file)));
    const { data, missing } = await step(`building the Noto Serif KR heading instance (${head.size} characters)`, () => subsetSerifKo(setText(head), { wght: 700 }));
    if (missing.length > 0) {
      warnLacking('Noto Serif KR', new Set(missing), headPages.map((p) => ({ label: p.route, text: htmlText(serifHeadHtml(p.html)) })));
    }
    if (data) replace.set(FONT_URL.serifKoHead, write('serifKoHead', 'sb-serif-kr-head', data, head.size - missing.length));
    else replace.set(fontFaceRule('serifKoHead'), ''); // no Hangul heading at all: the Times stack and the system serif draw them
  }

  // ── pages ──
  for (const page of pages) {
    await step(`rewriting ${page.route}`, () => {
      let html = page.html;
      for (const [from, to] of replace) html = html.split(from).join(to);
      const korean = /<html[^>]*\slang="ko"/.test(html);
      html = html.split(preloadTag(FONT_URL.sans)).join(preloadTag(coreUrl) + (korean && koUrl ? preloadTag(koUrl) : ''));
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
/** @type {Promise<Buffer | null> | null} */
let devSerifHead = null;

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
  if (url === FONT_URL.mono) return readFileSync(SOURCES.mono);
  if (url === FONT_URL.serifKo) return (devSerif ??= subsetSerifKo(sourceHangul()).then((r) => r.data));
  if (url === FONT_URL.serifKoHead) return (devSerifHead ??= subsetSerifKo(sourceHangul(), { wght: 700 }).then((r) => r.data));
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
