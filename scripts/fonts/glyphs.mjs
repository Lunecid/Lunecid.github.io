// Which characters the built site can put on screen, read from dist/ after `astro build`.
//
// Glyph source (batch 2): the built output, not src/. dist/**/*.html holds every server-rendered string — content
// collections, copy files, i18n labels, Markdown after smartypants (curly quotes, dashes), and the build-time GitHub
// data from src/data/generated/ as it was on the day of this build — plus every island's props (text the islands
// render only on the client, e.g. achievement toasts). Strings that exist only in client code (the ♪ / ↻ / × glyphs
// of the islands) are read from dist/_astro/*.js. Reading the output means nothing has to be listed by hand and the
// daily cron build, which re-fetches the GitHub data, always subsets for exactly what it ships.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/** Printable ASCII (U+0020–U+007E): always in the sans subset, whatever today's pages use. */
export const PRINTABLE_ASCII = String.fromCharCode(...Array.from({ length: 0x7f - 0x20 }, (_, i) => 0x20 + i));

/** Punctuation and symbols the site uses (or is likely to add), kept even when no page uses them today. */
export const ALWAYS_SYMBOLS = ' ·—–…‘’“”→←↑↓↗×©°₩▶◆›‹★♪↻≤≥•';

/** The characters of the display face (DS-1): Latin letters, numbers and the symbol list; Hangul inside a display
 * element is drawn by SB Sans through --font-ed-display. */
export const DISPLAY_CHARACTERS = PRINTABLE_ASCII + ALWAYS_SYMBOLS;

/** The Hangul blocks (Jamo, Compatibility Jamo, Jamo Extended-A/B, Syllables). */
export const HANGUL_RANGES = /** @type {const} */ ([
  [0x1100, 0x11ff],
  [0x3130, 0x318f],
  [0xa960, 0xa97f],
  [0xac00, 0xd7af],
  [0xd7b0, 0xd7ff],
]);

/** @param {number} cp */
export const isHangul = (cp) => HANGUL_RANGES.some(([lo, hi]) => cp >= lo && cp <= hi);

/**
 * Characters no text font is expected to draw: controls, invisible format characters, variation selectors and
 * emoji-presentation characters (🔒 is drawn by the system emoji font on purpose).
 * @param {string} ch
 */
export function isIgnorable(ch) {
  const cp = /** @type {number} */ (ch.codePointAt(0));
  if (cp < 0x20 || (cp >= 0x7f && cp <= 0x9f)) return true;
  if ((cp >= 0x200b && cp <= 0x200f) || (cp >= 0x2028 && cp <= 0x202e) || (cp >= 0x2060 && cp <= 0x206f)) return true;
  if ((cp >= 0xfe00 && cp <= 0xfe0f) || cp === 0xfeff || (cp >= 0xe0100 && cp <= 0xe01ef)) return true;
  return /\p{Emoji_Presentation}/u.test(ch);
}

const NAMED_ENTITIES = /** @type {Record<string, string>} */ ({
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', middot: '·', mdash: '—', ndash: '–',
  hellip: '…', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', rarr: '→', larr: '←', uarr: '↑', darr: '↓',
  times: '×', copy: '©', deg: '°', bull: '•', laquo: '«', raquo: '»', lsaquo: '‹', rsaquo: '›',
});

/** Decodes HTML character references (numeric, and the named ones Astro and Markdown emit). @param {string} s */
export function decodeEntities(s) {
  return s.replace(/&(#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (m, g) => {
    if (g[0] === '#') {
      const cp = g[1] === 'x' || g[1] === 'X' ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10);
      return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
    }
    return NAMED_ENTITIES[g] ?? m;
  });
}

/** Characters of the quoted strings in a stylesheet (`content: "→"`), CSS escapes decoded. @param {string} css */
export function cssStringText(css) {
  let out = '';
  for (const m of css.matchAll(/"((?:[^"\\]|\\[\s\S])*)"|'((?:[^'\\]|\\[\s\S])*)'/g)) {
    out += (m[1] ?? m[2]).replace(/\\([0-9a-fA-F]{1,6})\s?|\\([\s\S])/g, (_, hex, ch) =>
      hex ? String.fromCodePoint(parseInt(hex, 16)) : ch,
    );
  }
  return out;
}

/**
 * Every character of one built HTML page that can be rendered with the page's fonts: text, every attribute
 * value (alt, placeholder, data-* strings that scripts show, island props), inline script strings and
 * stylesheet strings. JSON-LD is skipped (it is never rendered).
 * @param {string} html
 */
export function htmlText(html) {
  let text = '';
  const rest = html
    .replace(/<script\b[^>]*type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (_, css) => {
      text += cssStringText(css);
      return ' ';
    })
    .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gi, (_, js) => {
      text += js;
      return ' ';
    });
  // Island props are HTML-escaped JSON: decoding twice also covers an entity inside a prop string.
  return text + decodeEntities(decodeEntities(rest));
}

/**
 * Only the text a page shows as it is served: text nodes and stylesheet strings (no attributes, no island props,
 * no script). Used to decide which Hangul the English pages show without JavaScript (the language switch "한국어").
 * @param {string} html
 */
export function shownText(html) {
  let text = '';
  const rest = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (_, css) => {
      text += cssStringText(css);
      return ' ';
    })
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]*>/g, ' ');
  return text + decodeEntities(rest);
}

/**
 * The part of a page inside `<article class="paper" …>…</article>` (the paper sheet set in serif).
 * @param {string} html
 */
export function paperSheetHtml(html) {
  const start = html.search(/<article\b[^>]*class="paper[\s"]/);
  if (start < 0) return '';
  const end = html.indexOf('</article>', start);
  return end < 0 ? '' : html.slice(start, end);
}

/** @param {string} dir @returns {string[]} */
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
}

/**
 * Built pages that use the site layout (BaseLayout): every HTML file except the /print/ PDF sources, which use
 * PrintLayout and the static "Pretendard Print" family.
 * @param {string} distDir
 * @returns {{ file: string; route: string }[]}
 */
export function sitePages(distDir) {
  return walk(distDir)
    .filter((f) => f.endsWith('.html'))
    .map((file) => ({ file, route: '/' + relative(distDir, file).split(sep).join('/').replace(/index\.html$/, '') }))
    .filter((p) => !p.route.startsWith('/print/'))
    .sort((a, b) => a.route.localeCompare(b.route));
}

/** Client JS bundles. @param {string} distDir */
export function clientScripts(distDir) {
  const astro = join(distDir, '_astro');
  return walk(astro).filter((f) => f.endsWith('.js'));
}

/** Linked stylesheets (the data pages' shared data-site sheet). @param {string} distDir */
export function clientStyles(distDir) {
  return walk(join(distDir, '_astro')).filter((f) => f.endsWith('.css'));
}

/**
 * Non-ASCII characters of a client bundle. Vite writes non-ASCII string literals as UTF-8, so every character
 * an island can render from its own code appears literally; taking every non-ASCII character of the file
 * (rather than parsing string literals) can only add a few glyphs, never miss one.
 * @param {string} js
 */
export function scriptText(js) {
  return [...js].filter((ch) => ch.charCodeAt(0) >= 0x80).join('');
}

/** @param {Iterable<string>} texts @returns {Set<string>} */
export function charSet(texts) {
  const set = new Set();
  for (const text of texts) for (const ch of text) if (!isIgnorable(ch)) set.add(ch);
  return set;
}

/**
 * The case-study overlay's sheets (dist/case/<id>/<lang>.json, src/pages/case/[slug]/[lang].json.ts): JSON, so neither a
 * page nor a client bundle, yet their text is drawn with the page's SB Sans (Hangul UI text) and the case faces.
 * @param {string} distDir
 * @returns {{ file: string; lang: string; text: string }[]}
 */
export function caseSheets(distDir) {
  const dir = join(distDir, 'case');
  let files = [];
  try {
    files = walk(dir).filter((f) => f.endsWith('.json'));
  } catch {
    return [];
  }
  return files.map((file) => ({ file, lang: file.replace(/^.*[\\/]/, '').replace(/\.json$/, ''), text: caseSheetText(readFileSync(file, 'utf8')) }));
}

/** Every string a case sheet can show: its markup's text and attributes, the chart words, the runtime strings. @param {string} json */
export function caseSheetText(json) {
  /** @param {unknown} v @returns {string[]} */
  const strings = (v) => (typeof v === 'string' ? [v] : Array.isArray(v) ? v.flatMap(strings) : v && typeof v === 'object' ? Object.values(v).flatMap(strings) : []);
  return strings(JSON.parse(json)).map((s) => htmlText(s)).join('\n');
}

/**
 * The characters the sans face must cover: printable ASCII, the fixed symbol list, every site page, every
 * client bundle, the strings of every linked stylesheet and the Hangul of the case overlay's sheets.
 * @param {string} distDir
 */
export function sansCharacters(distDir) {
  return charSet([
    PRINTABLE_ASCII,
    ALWAYS_SYMBOLS,
    // the sheets' Hangul only: their Latin text has its own faces (SB Case *); SB Sans draws the Hangul of the UI text
    ...caseSheets(distDir).map((s) => [...s.text].filter((ch) => isHangul(/** @type {number} */ (ch.codePointAt(0)))).join('')),
    ...sitePages(distDir).map((p) => htmlText(readFileSync(p.file, 'utf8'))),
    ...clientScripts(distDir).map((f) => scriptText(readFileSync(f, 'utf8'))),
    ...clientStyles(distDir).map((f) => cssStringText(readFileSync(f, 'utf8'))),
  ]);
}

/**
 * Hangul inside the paper sheet of the given pages: what the Korean serif must cover.
 * @param {string[]} files
 */
export function paperHangul(files) {
  const set = charSet(files.map((f) => htmlText(paperSheetHtml(readFileSync(f, 'utf8')))));
  return new Set([...set].filter((ch) => isHangul(/** @type {number} */ (ch.codePointAt(0)))));
}

/** Sorted string of a character set. @param {Set<string>} set */
export const setText = (set) => [...set].sort((a, b) => /** @type {number} */ (a.codePointAt(0)) - /** @type {number} */ (b.codePointAt(0))).join('');

