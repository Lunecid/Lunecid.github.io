import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';
import { subsetSerifKo } from '../../scripts/fonts/build.mjs';

/** The card's look (P2-12): game pages 'hud', general pages 'editorial', the chooser and the shared pages 'neutral'. */
export type OgTemplate = 'hud' | 'editorial' | 'neutral';

/**
 * A real artifact for the card (P2-36), framed in HUD brackets on the grid (under a heavy ink rule on the white cards):
 * the ID photo, a figure file (with a "FIG · LABEL" strip on HUD cards), the paper's title block (a white sheet: venue,
 * title, authors, affiliation), for a project without a figure the same metadata plate as its cartridge (ID, period,
 * tag), or, on the chooser card, the two versions side by side (P2-12, spec §6). Paths are absolute file paths.
 */
export type OgArtifact =
  | { kind: 'photo'; path: string }
  | { kind: 'figure'; path: string; label: string }
  | { kind: 'paper'; venue: string; title: string; authors: string; affiliation?: string }
  | { kind: 'plate'; id: string; period: string; tag?: string }
  | { kind: 'versions'; game: { mode: string; title: string }; data: { kicker: string; title: string } };

/** One OG card. Titles never name a game trademark (buildOgMap enforces it); the paper artifact may (it is the paper). */
export interface OgInput {
  template: OgTemplate;
  eyebrow: string;
  title: string;
  subtitle?: string;
  artifact?: OgArtifact;
}

type OgFont = { name: string; data: Buffer; weight: 400 | 700; style: 'normal' };
type El = { type: string; props: Record<string, unknown> };

const require = createRequire(import.meta.url);
// Static OTFs (satori needs TTF/OTF/WOFF, not woff2). Read at build time only; never shipped to dist.
const fontPath = (weight: 'Regular' | 'Bold'): string =>
  require.resolve(`pretendard/dist/public/static/Pretendard-${weight}.otf`);

// satori cannot read CSS variables, so the card colours are literals: the one accepted exception to "no colour
// literals outside tokens.css". Each equals the tokens.css value named in tests/unit/og.test.ts, which fails when either
// side drifts.
export const OG_COLORS = {
  // the game cards and the chooser card's game half: the game palette v4 (the --gp-* values the game pages use)
  bg: '#0B0B0C', // --gp-k0
  panel: '#141416', // --gp-k1
  text: '#E6E6E1', // --gp-t1
  strong: '#F4F4F0', // --gp-t0
  accent: '#FFE600', // --gp-y
  muted: '#A3A39C', // --gp-t2
  grid: 'rgba(255, 255, 255, .03)', // --gp-grid
  line: '#707078', // --gp-ln
  paper: '#FFFFFF', // --paper-bg
  paperInk: '#141414', // --paper-ink
  paperMuted: '#4A4A4A', // --paper-muted
  edBg: '#FFFFFF', // --ed-bg
  edInk: '#141414', // --ed-ink
  edMuted: '#6B6B6B', // --ed-muted
  edRule: '#E5E5E5', // --ed-rule
  edAccent: '#1E3A8A', // --ed-accent
} as const;

let fontsPromise: Promise<OgFont[]> | null = null;
/** Cached across every getStaticPaths() entry of one build. */
function loadFonts(): Promise<OgFont[]> {
  fontsPromise ??= Promise.all([
    readFile(fontPath('Regular')).then((data): OgFont => ({ name: 'Pretendard', data, weight: 400, style: 'normal' })),
    readFile(fontPath('Bold')).then((data): OgFont => ({ name: 'Pretendard', data, weight: 700, style: 'normal' })),
  ]);
  return fontsPromise;
}

/** The family name satori knows the serif instance by. */
const OG_SERIF = 'SB Serif OG';
const serifFonts = new Map<string, Promise<Buffer | null>>();
/**
 * A static wght-700 Noto Serif KR instance holding exactly the characters of `text` (spec §8: satori reads neither
 * WOFF2 nor variable fonts, so the build subsets an SFNT per card with scripts/fonts/build.mjs; no new dependency).
 * null when none of the characters is in Noto Serif KR.
 */
export function ogSerifFont(text: string): Promise<Buffer | null> {
  let font = serifFonts.get(text);
  if (!font) {
    font = subsetSerifKo(text, { format: 'sfnt', wght: 700, latin: true }).then((result) => result.data);
    serifFonts.set(text, font);
  }
  return font;
}

const h = (type: string, style: Record<string, unknown>, children?: unknown, extra: Record<string, unknown> = {}): El => ({
  type,
  props: { style, children, ...extra },
});

/**
 * A card text's words, split at spaces (final fix 2 item 22). The subtitle is laid out one flex item per word, so a line
 * breaks only between words: satori's keep-all breaking split a sentence's closing period from its last word and set
 * it alone on a line ("…conditions suggest" / "."). Punctuation stays on its word, as do Korean particles.
 */
export function ogWords(text: string): string[] {
  return text.split(/\s+/).filter((word) => word !== '');
}

/** A text run that wraps only between words (ogWords); `space` is the gap a space would leave at the run's size. */
function wordRun(text: string, style: Record<string, unknown>, space: number): El {
  const words = ogWords(text);
  return h('div', { display: 'flex', flexWrap: 'wrap', ...style }, words.map((word, i) => h('span', { marginRight: i < words.length - 1 ? space : 0 }, word)));
}

/** An image file as a JPEG data URI at exactly width × height (cover for the photo, contain on white for figures). */
async function imageData(path: string, width: number, height: number, fit: 'cover' | 'contain'): Promise<string> {
  const buf = await sharp(path)
    .resize({ width, height, fit, position: 'centre', background: OG_COLORS.paper })
    .flatten({ background: OG_COLORS.paper })
    .jpeg({ quality: 84, mozjpeg: true })
    .toBuffer();
  return `data:image/jpeg;base64,${buf.toString('base64')}`;
}

/** The two yellow corner marks of a HUD bracket frame (hud.css .bracket), as absolutely placed children. */
function corners(size = 26): El[] {
  const mark = (pos: Record<string, unknown>, sides: Record<string, unknown>): El =>
    h('div', { position: 'absolute', width: size, height: size, ...pos, ...sides });
  return [
    mark({ left: -2, top: -2 }, { borderLeft: `3px solid ${OG_COLORS.accent}`, borderTop: `3px solid ${OG_COLORS.accent}` }),
    mark({ right: -2, bottom: -2 }, { borderRight: `3px solid ${OG_COLORS.accent}`, borderBottom: `3px solid ${OG_COLORS.accent}` }),
  ];
}

/** The chooser card's artifact: the two versions side by side, the game half on the HUD grid, the general half white. */
function versionsBox(artifact: Extract<OgArtifact, { kind: 'versions' }>): El {
  const half = (style: Record<string, unknown>, children: unknown[]): El =>
    h('div', { display: 'flex', flexDirection: 'column', justifyContent: 'center', width: 250, height: 300, padding: '0 26px', ...style }, children);
  return h('div', { display: 'flex', width: 502, border: `1px solid ${OG_COLORS.edRule}` }, [
    half(
      {
        backgroundColor: OG_COLORS.bg,
        backgroundImage: `linear-gradient(${OG_COLORS.grid} 1px, transparent 1px), linear-gradient(90deg, ${OG_COLORS.grid} 1px, transparent 1px)`,
        backgroundSize: '32px 32px',
      },
      [
        h('div', { display: 'flex', fontSize: 18, fontWeight: 700, letterSpacing: 2, color: OG_COLORS.muted }, artifact.game.mode),
        h('div', { display: 'flex', marginTop: 14, fontSize: 30, fontWeight: 700, lineHeight: 1.25, color: OG_COLORS.strong, wordBreak: 'keep-all' }, artifact.game.title),
        h('div', { display: 'flex', width: 44, height: 4, marginTop: 18, backgroundColor: OG_COLORS.accent }),
      ],
    ),
    half({ backgroundColor: OG_COLORS.edBg }, [
      h('div', { display: 'flex', fontSize: 18, color: OG_COLORS.edMuted }, artifact.data.kicker),
      h('div', { display: 'flex', marginTop: 14, fontFamily: OG_SERIF, fontSize: 32, fontWeight: 700, lineHeight: 1.25, color: OG_COLORS.edInk, wordBreak: 'keep-all' }, artifact.data.title),
      h('div', { display: 'flex', width: 44, height: 3, marginTop: 18, backgroundColor: OG_COLORS.edInk }),
    ]),
  ]);
}

async function artifactBox(artifact: OgArtifact): Promise<El> {
  const frame = (width: number, children: unknown[], extra: Record<string, unknown> = {}): El =>
    h('div', { position: 'relative', display: 'flex', flexDirection: 'column', width, border: `1px solid ${OG_COLORS.line}`, ...extra }, [...children, ...corners()]);
  switch (artifact.kind) {
    case 'photo': {
      const src = await imageData(artifact.path, 318, 424, 'cover');
      return frame(320, [h('img', { width: 318, height: 424 }, undefined, { src, width: 318, height: 424 })]);
    }
    case 'figure': {
      const src = await imageData(artifact.path, 500, 300, 'contain');
      return frame(522, [
        h('div', { display: 'flex', padding: 10, backgroundColor: OG_COLORS.paper }, [h('img', { width: 500, height: 300 }, undefined, { src, width: 500, height: 300 })]),
        h('div', { display: 'flex', padding: '10px 14px', backgroundColor: OG_COLORS.panel, borderTop: `1px solid ${OG_COLORS.line}`, fontSize: 20, fontWeight: 700, letterSpacing: 3, color: OG_COLORS.muted }, [
          h('span', { color: OG_COLORS.text }, 'FIG'),
          h('span', { marginLeft: 10 }, `· ${artifact.label}`),
        ]),
      ]);
    }
    case 'paper':
      return frame(
        470,
        [
          h('div', { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '36px 34px 40px', backgroundColor: OG_COLORS.paper, color: OG_COLORS.paperInk }, [
            h('div', { display: 'flex', fontSize: 17, color: OG_COLORS.paperMuted, textAlign: 'center' }, artifact.venue),
            h('div', { display: 'flex', marginTop: 20, fontSize: 30, fontWeight: 700, lineHeight: 1.25, textAlign: 'center', justifyContent: 'center' }, artifact.title),
            h('div', { display: 'flex', marginTop: 22, fontSize: 21, textAlign: 'center' }, artifact.authors),
            artifact.affiliation
              ? h('div', { display: 'flex', marginTop: 6, fontSize: 18, color: OG_COLORS.paperMuted, textAlign: 'center' }, artifact.affiliation)
              : h('div', { display: 'flex' }, ''),
            h('div', { display: 'flex', width: 120, height: 1, marginTop: 26, backgroundColor: OG_COLORS.paperMuted }),
            h('div', { display: 'flex', marginTop: 14, fontSize: 18, fontWeight: 700, fontStyle: 'normal' }, 'Abstract'),
          ]),
        ],
      );
    case 'plate':
      return frame(
        460,
        [
          h('div', { display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: 250, padding: '34px 34px 30px', backgroundColor: OG_COLORS.panel }, [
            h('div', { display: 'flex', fontSize: 34, fontWeight: 700, letterSpacing: 2, color: OG_COLORS.strong }, artifact.id),
            h('div', { display: 'flex', flexDirection: 'column' }, [
              h('div', { display: 'flex', fontSize: 24, color: OG_COLORS.muted }, artifact.period),
              artifact.tag
                ? h('div', { display: 'flex', alignItems: 'center', marginTop: 8, fontSize: 24, fontWeight: 700, color: OG_COLORS.text }, [
                    h('div', { display: 'flex', width: 12, height: 12, marginRight: 12, border: `2px solid ${OG_COLORS.accent}` }),
                    h('span', {}, artifact.tag),
                  ])
                : h('div', { display: 'flex' }, ''),
            ]),
          ]),
        ],
      );
    case 'versions':
      return versionsBox(artifact);
  }
}

/** Artifacts on the white cards (editorial and neutral): a heavy ink rule on top instead of the HUD bracket frame. */
async function lightArtifact(artifact: OgArtifact): Promise<El> {
  const frame = (width: number, children: unknown[]): El =>
    h('div', { display: 'flex', flexDirection: 'column', width, paddingTop: 12, borderTop: `3px solid ${OG_COLORS.edInk}` }, children);
  switch (artifact.kind) {
    case 'photo': {
      const src = await imageData(artifact.path, 318, 424, 'cover');
      return frame(318, [h('img', { width: 318, height: 424 }, undefined, { src, width: 318, height: 424 })]);
    }
    case 'figure': {
      const src = await imageData(artifact.path, 500, 300, 'contain');
      return frame(500, [h('img', { width: 500, height: 300 }, undefined, { src, width: 500, height: 300 })]);
    }
    case 'paper':
      return frame(470, [
        h('div', { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 34px 36px', border: `1px solid ${OG_COLORS.edRule}`, backgroundColor: OG_COLORS.paper, color: OG_COLORS.paperInk }, [
          h('div', { display: 'flex', fontSize: 17, color: OG_COLORS.paperMuted, textAlign: 'center' }, artifact.venue),
          h('div', { display: 'flex', marginTop: 20, fontSize: 30, fontWeight: 700, lineHeight: 1.25, textAlign: 'center', justifyContent: 'center' }, artifact.title),
          h('div', { display: 'flex', marginTop: 22, fontSize: 21, textAlign: 'center' }, artifact.authors),
          artifact.affiliation
            ? h('div', { display: 'flex', marginTop: 6, fontSize: 18, color: OG_COLORS.paperMuted, textAlign: 'center' }, artifact.affiliation)
            : h('div', { display: 'flex' }, ''),
        ]),
      ]);
    case 'plate':
      return frame(460, [
        h('div', { display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: 250, padding: '34px 34px 30px', backgroundColor: OG_COLORS.edInk }, [
          h('div', { display: 'flex', fontSize: 34, fontWeight: 700, letterSpacing: 2, color: OG_COLORS.edBg }, artifact.id),
          h('div', { display: 'flex', flexDirection: 'column' }, [
            h('div', { display: 'flex', fontSize: 24, color: OG_COLORS.edRule }, artifact.period),
            artifact.tag ? h('div', { display: 'flex', marginTop: 8, fontSize: 24, fontWeight: 700, color: OG_COLORS.edBg }, artifact.tag) : h('div', { display: 'flex' }, ''),
          ]),
        ]),
      ]);
    case 'versions':
      return versionsBox(artifact);
  }
}

/**
 * The HUD card (P2-36, unchanged by P2-12): the grid, the "[ ■ ] EYEBROW" caption, the title and subtitle on the left,
 * the artifact in a bracket frame on the right. Every div with more than one child uses display:flex (satori rule).
 */
async function hudTree({ eyebrow, title, subtitle, artifact }: OgInput): Promise<El> {
  const side = artifact ? await artifactBox(artifact) : null;
  const text = h('div', { display: 'flex', flexDirection: 'column', justifyContent: 'space-between', flex: 1, minWidth: 0, height: '100%', paddingRight: side ? 44 : 0 }, [
    h('div', { display: 'flex', alignItems: 'center', fontSize: 26, fontWeight: 700, color: OG_COLORS.accent, letterSpacing: 3 }, [
      h('span', { color: OG_COLORS.muted }, '['),
      h('div', { display: 'flex', width: 15, height: 15, margin: '0 10px', backgroundColor: OG_COLORS.accent }),
      h('span', { color: OG_COLORS.muted, marginRight: 14 }, ']'),
      h('span', {}, eyebrow),
    ]),
    h('div', { display: 'flex', flexDirection: 'column' }, [
      h('div', { display: 'flex', fontSize: side ? 54 : 64, fontWeight: 700, lineHeight: 1.18, color: OG_COLORS.strong, wordBreak: 'keep-all', lineClamp: 3 }, title),
      subtitle
        ? wordRun(subtitle, { fontSize: 26, fontWeight: 400, lineHeight: 1.45, color: OG_COLORS.muted, marginTop: 20 }, 7)
        : h('div', { display: 'flex' }, ''),
    ]),
    h('div', { display: 'flex', flexDirection: 'column', fontSize: 24, color: OG_COLORS.muted }, [
      h('div', { display: 'flex', color: OG_COLORS.text }, '백성은 · Seongeun Baek'),
      h('div', { display: 'flex', marginTop: 4 }, 'lunecid.github.io'),
    ]),
  ]);
  const tree = h(
    'div',
    {
      width: '100%', height: '100%', display: 'flex', alignItems: 'center', padding: '60px 72px',
      backgroundColor: OG_COLORS.bg,
      backgroundImage: `linear-gradient(${OG_COLORS.grid} 1px, transparent 1px), linear-gradient(90deg, ${OG_COLORS.grid} 1px, transparent 1px)`,
      backgroundSize: '32px 32px',
      color: OG_COLORS.text, fontFamily: 'Pretendard',
    },
    side ? [text, side] : [text],
  );
  return tree;
}

/** The white card (editorial, neutral): the eyebrow, the title — in the serif instance on the editorial card — the
 * subtitle and the site line on the left, the artifact on the right. Every div with more than one child is a flexbox. */
async function lightTree({ template, eyebrow, title, subtitle, artifact }: OgInput): Promise<El> {
  const side = artifact ? await lightArtifact(artifact) : null;
  // P2-12 review: satori ignores lineClamp on a flex box, so a long title beside an artifact steps down a size instead
  // of running into the eyebrow; the ' · ' separator never ends a line.
  const titleSize = side ? ([...title].length > 36 ? 44 : 56) : 66;
  const titleText = title.replace(/ · /g, '\u00A0· ');
  const text = h('div', { display: 'flex', flexDirection: 'column', justifyContent: 'space-between', flex: 1, minWidth: 0, height: '100%', paddingRight: side ? 44 : 0 }, [
    h('div', { display: 'flex', fontSize: 24, color: OG_COLORS.edMuted }, eyebrow),
    h('div', { display: 'flex', flexDirection: 'column' }, [
      h('div', { display: 'flex', fontFamily: template === 'editorial' ? OG_SERIF : 'Pretendard', fontSize: titleSize, fontWeight: 700, lineHeight: 1.2, color: OG_COLORS.edInk, wordBreak: 'keep-all' }, titleText),
      subtitle ? wordRun(subtitle, { fontSize: 26, fontWeight: 400, lineHeight: 1.45, color: OG_COLORS.edMuted, marginTop: 20 }, 7) : h('div', { display: 'flex' }, ''),
    ]),
    h('div', { display: 'flex', flexDirection: 'column', fontSize: 24, color: OG_COLORS.edMuted }, [
      h('div', { display: 'flex', color: OG_COLORS.edInk }, '백성은 · Seongeun Baek'),
      h('div', { display: 'flex', marginTop: 4, color: OG_COLORS.edAccent }, 'lunecid.github.io'),
    ]),
  ]);
  return h('div', { width: '100%', height: '100%', display: 'flex', alignItems: 'center', padding: '60px 72px', backgroundColor: OG_COLORS.edBg, color: OG_COLORS.edInk, fontFamily: 'Pretendard' }, side ? [text, side] : [text]);
}

/**
 * 1200×630 PNG: satori (object vnodes, no JSX) → SVG → resvg, then a lossless re-encode (every card under 300 KB). HUD
 * cards: the grid, the "[ ■ ] EYEBROW" caption and a bracket-framed artifact. Editorial and neutral cards: white, the
 * artifact under a heavy ink rule; the editorial title and the chooser's general-half title use the serif instance.
 */
export async function renderOgPng(input: OgInput): Promise<Buffer> {
  const tree = input.template === 'hud' ? await hudTree(input) : await lightTree(input);
  const fonts: OgFont[] = [...(await loadFonts())];
  const serifText = (input.template === 'editorial' ? input.title : '') + (input.artifact?.kind === 'versions' ? input.artifact.data.title : '');
  if (serifText !== '') {
    const serif = await ogSerifFont(serifText);
    if (serif) fonts.push({ name: OG_SERIF, data: serif, weight: 700, style: 'normal' });
  }
  const svg = await satori(tree as unknown as Parameters<typeof satori>[0], { width: 1200, height: 630, fonts });
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng();
  return sharp(png).png({ compressionLevel: 9, adaptiveFiltering: true, palette: false }).toBuffer();
}
