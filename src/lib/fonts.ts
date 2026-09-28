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

export type FontFace = 'sans' | 'mono' | 'serifKo';

/** Placeholder URL per face (replaced by the hashed file in dist). */
export const FONT_URL: Record<FontFace, string> = {
  sans: '/_fonts/sb-sans.woff2',
  mono: '/_fonts/jetbrains-mono.woff2',
  serifKo: '/_fonts/sb-serif-kr.woff2',
};

/** The Hangul blocks (Jamo, Compatibility Jamo, Jamo Extended-A, Syllables, Jamo Extended-B). */
export const HANGUL_UNICODE_RANGE = 'U+1100-11FF,U+3130-318F,U+A960-A97F,U+AC00-D7FF';

const DESCRIPTORS: Record<FontFace, string> = {
  sans: `font-family:"${SANS_FAMILY}";font-style:normal;font-weight:400 900;font-display:swap`,
  mono: `font-family:"${MONO_FAMILY}";font-style:normal;font-weight:100 800;font-display:swap`,
  serifKo: `font-family:"${SERIF_KO_FAMILY}";font-style:normal;font-weight:200 900;font-display:swap`,
};

/** The Korean serif draws Hangul only, so Latin text on the paper keeps its Times face. */
const DEFAULT_RANGE: Partial<Record<FontFace, string>> = { serifKo: HANGUL_UNICODE_RANGE };

/** One @font-face rule; by default for the face's placeholder URL. */
export function fontFaceRule(face: FontFace, url: string = FONT_URL[face], unicodeRange: string | undefined = DEFAULT_RANGE[face]): string {
  return `@font-face{${DESCRIPTORS[face]};src:url(${url}) format("woff2")${unicodeRange ? `;unicode-range:${unicodeRange}` : ''}}`;
}

/** The placeholder @font-face rules for the given faces (inlined into <head> with <style is:inline>). */
export function fontFaceCss(faces: readonly FontFace[]): string {
  return faces.map((face) => fontFaceRule(face)).join('');
}
