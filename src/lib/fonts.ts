// Web fonts (batch 2). The page fonts are subset at build time to the characters the built site uses
// (scripts/fonts/build.mjs, run by `astro build`): no committed font binary can go stale.
//
// The layouts reference each face by a placeholder URL below. `astro build` writes the subset to
// dist/_astro/<name>.<content hash>.woff2 and replaces the placeholder rule in every built page; `astro dev`
// serves the placeholder URLs from the font packages (scripts/fonts/build.mjs, devFont).

/** Body/heading face: a subset of Pretendard Variable (OFL 1.1, Reserved Font Name "Pretendard"), so renamed. */
export const SANS_FAMILY = 'SB Sans';
/** HUD labels and numbers: JetBrains Mono, the fontsource latin file served unmodified (OFL 1.1). */
export const MONO_FAMILY = 'JetBrains Mono Variable';
/** The Korean text of the paper page: a subset of Noto Serif KR (OFL 1.1, no Reserved Font Name). */
export const SERIF_KO_FAMILY = 'SB Serif KR';
/** The general version's Korean headings (P2-3): a static wght-700 subset of Noto Serif KR over the Hangul inside
 * [data-serif]; separate from the paper's variable "SB Serif KR". Declared by DataLayout, never preloaded (§9). */
export const SERIF_KO_HEAD_FAMILY = 'SB Serif KR Head';

/** Latin display face of the general version: a subset of Archivo (OFL 1.1, Omnibus-Type; no Reserved Font Name —
 *  its LICENSE and name ID 0 declare none), width axis pinned at 112 %, weight 700–900. Data pages only. */
export const DISPLAY_FAMILY = 'SB Display';

/** The chooser covers (MO-23): JetBrains Mono pinned to wght 600 and Anton, each subset to the characters the chooser
 * pages show (plus printable ASCII), declared only by ChooserView (swap, not preloaded). OFL 1.1, no Reserved Font
 * Name; renamed families so they never stand in for the site-wide faces. */
export const COVER_MONO_FAMILY = 'SB Cover Mono';
export const COVER_DISPLAY_FAMILY = 'SB Cover Display';

export type FontFace = 'sans' | 'mono' | 'serifKo' | 'serifKoHead' | 'display' | 'coverMono' | 'coverDisplay';

/** Placeholder URL per face (replaced by the hashed file in dist). */
export const FONT_URL: Record<FontFace, string> = {
  sans: '/_fonts/sb-sans.woff2',
  mono: '/_fonts/jetbrains-mono.woff2',
  serifKo: '/_fonts/sb-serif-kr.woff2',
  serifKoHead: '/_fonts/sb-serif-kr-head.woff2',
  display: '/_fonts/sb-display.woff2',
  coverMono: '/_fonts/sb-cover-mono.woff2',
  coverDisplay: '/_fonts/sb-cover-display.woff2',
};

/** The Hangul blocks (Jamo, Compatibility Jamo, Jamo Extended-A, Syllables, Jamo Extended-B). */
export const HANGUL_UNICODE_RANGE = 'U+1100-11FF,U+3130-318F,U+A960-A97F,U+AC00-D7FF';

const DESCRIPTORS: Record<FontFace, string> = {
  sans: `font-family:"${SANS_FAMILY}";font-style:normal;font-weight:400 900;font-display:swap`,
  mono: `font-family:"${MONO_FAMILY}";font-style:normal;font-weight:100 800;font-display:swap`,
  serifKo: `font-family:"${SERIF_KO_FAMILY}";font-style:normal;font-weight:200 900;font-display:swap`,
  serifKoHead: `font-family:"${SERIF_KO_HEAD_FAMILY}";font-style:normal;font-weight:700;font-display:swap`,
  display: `font-family:"${DISPLAY_FAMILY}";font-style:normal;font-weight:700 900;font-stretch:112%;font-display:swap`,
  coverMono: `font-family:"${COVER_MONO_FAMILY}";font-style:normal;font-weight:600;font-display:swap`,
  coverDisplay: `font-family:"${COVER_DISPLAY_FAMILY}";font-style:normal;font-weight:400;font-display:swap`,
};

/** The Korean serifs draw Hangul only, so Latin text keeps its Times face. */
const DEFAULT_RANGE: Partial<Record<FontFace, string>> = { serifKo: HANGUL_UNICODE_RANGE, serifKoHead: HANGUL_UNICODE_RANGE };

/** One @font-face rule; by default for the face's placeholder URL. */
export function fontFaceRule(face: FontFace, url: string = FONT_URL[face], unicodeRange: string | undefined = DEFAULT_RANGE[face]): string {
  return `@font-face{${DESCRIPTORS[face]};src:url(${url}) format("woff2")${unicodeRange ? `;unicode-range:${unicodeRange}` : ''}}`;
}

/**
 * The placeholder @font-face rules for the given faces (inlined into <head> with <style is:inline>). `display`
 * replaces font-display: swap — 'optional' for a preloaded face that must never swap in after the first render.
 */
export function fontFaceCss(faces: readonly FontFace[], display?: 'optional'): string {
  const css = faces.map((face) => fontFaceRule(face)).join('');
  return display ? css.replaceAll('font-display:swap', `font-display:${display}`) : css;
}
