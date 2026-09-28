import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';

/**
 * A real artifact for the card (P2-36), framed in HUD brackets on the grid: the ID photo, a figure file (with a
 * "FIG · LABEL" strip), the paper's title block (a white sheet: venue, title, authors, affiliation), or, for a project
 * without a figure, the same metadata plate as its cartridge (ID, period, tag). Paths are absolute file paths.
 */
export type OgArtifact =
  | { kind: 'photo'; path: string }
  | { kind: 'figure'; path: string; label: string }
  | { kind: 'paper'; venue: string; title: string; authors: string; affiliation?: string }
  | { kind: 'plate'; id: string; period: string; tag?: string };

/** One OG card. Titles never name a game trademark (buildOgMap enforces it); the paper artifact may (it is the paper). */
export interface OgInput {
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
  bg: '#0B0D11', // --hud-bg
  panel: '#15181F', // --hud-panel
  text: '#E8EAED', // --hud-text
  strong: '#FFFFFF', // --hud-strong
  accent: '#C8F03C', // --accent
  muted: '#8B93A1', // --hud-muted
  grid: 'rgba(255, 255, 255, .035)', // --grid-line
  line: 'rgba(200, 240, 60, .24)', // --hud-line
  paper: '#FFFFFF', // --paper-bg
  paperInk: '#141414', // --paper-ink
  paperMuted: '#4A4A4A', // --paper-muted
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

/** The two lime corner marks of a HUD bracket frame (hud.css .bracket), as absolutely placed children. */
function corners(size = 26): El[] {
  const mark = (pos: Record<string, unknown>, sides: Record<string, unknown>): El =>
    h('div', { position: 'absolute', width: size, height: size, ...pos, ...sides });
  return [
    mark({ left: -2, top: -2 }, { borderLeft: `3px solid ${OG_COLORS.accent}`, borderTop: `3px solid ${OG_COLORS.accent}` }),
    mark({ right: -2, bottom: -2 }, { borderRight: `3px solid ${OG_COLORS.accent}`, borderBottom: `3px solid ${OG_COLORS.accent}` }),
  ];
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
  }
}

/**
 * 1200×630 PNG: satori (object vnodes, no JSX) → SVG → resvg, then a lossless re-encode (P2-36 keeps each card under
 * 300 KB). The HUD grid, the "[ ■ ] EYEBROW" caption, the title and subtitle on the left, the artifact in a bracket
 * frame on the right. Every div with more than one child uses display:flex (satori rule).
 */
export async function renderOgPng({ eyebrow, title, subtitle, artifact }: OgInput): Promise<Buffer> {
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
  const svg = await satori(tree as unknown as Parameters<typeof satori>[0], { width: 1200, height: 630, fonts: await loadFonts() });
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng();
  return sharp(png).png({ compressionLevel: 9, adaptiveFiltering: true, palette: false }).toBuffer();
}
