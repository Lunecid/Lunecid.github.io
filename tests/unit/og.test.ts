import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { OG_COLORS, ogWords, renderOgPng, type OgArtifact } from '../../src/lib/og';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const file = (rel: string): string => fileURLToPath(new URL(`../../${rel}`, import.meta.url));

/** Which tokens.css custom property each OG colour mirrors. */
const TOKEN_OF = {
  bg: '--hud-bg',
  panel: '--hud-panel',
  text: '--hud-text',
  strong: '--hud-strong',
  accent: '--accent',
  muted: '--hud-muted',
  grid: '--grid-line',
  line: '--hud-line',
  paper: '--paper-bg',
  paperInk: '--paper-ink',
  paperMuted: '--paper-muted',
} as const satisfies Record<keyof typeof OG_COLORS, string>;

const squash = (v: string): string => v.replace(/\s+/g, '').toUpperCase();

describe('renderOgPng', () => {
  it('renderOgPng returns a 1200×630 PNG', async () => {
    const png = await renderOgPng({
      eyebrow: 'RESEARCH',
      title: '교전 결과 예측 사례 연구',
      subtitle: 'IEEE CoG 2026 구두 발표 논문의 사례 연구',
    });
    expect([...png.subarray(0, 8)]).toEqual(PNG_SIGNATURE);
    expect(png.subarray(12, 16).toString('latin1')).toBe('IHDR');
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
  }, 30_000);

  it('renders without a subtitle and different text gives a different image', async () => {
    const a = await renderOgPng({ eyebrow: 'PORTFOLIO', title: 'Seongeun Baek' });
    const b = await renderOgPng({ eyebrow: 'PORTFOLIO', title: '백성은' });
    expect(a.readUInt32BE(16)).toBe(1200);
    expect(a.readUInt32BE(20)).toBe(630);
    expect(Buffer.compare(a, b)).not.toBe(0);
  }, 30_000);

  // P2-36: a real artifact in a bracket frame on the grid, every card under 300 KB.
  const ARTIFACTS: Record<string, OgArtifact> = {
    photo: { kind: 'photo', path: file('src/assets/photo/photo-id.webp') },
    figure: { kind: 'figure', path: file('src/assets/projects/school-zone-blindspots/risk-heatmap.webp'), label: 'RISK HEATMAP' },
    paper: { kind: 'paper', venue: '2026 IEEE Conference on Games (CoG)', title: 'Kill-Conditioned Engagement Outcome Prediction', authors: 'Seongeun Baek, Joonho Kwon', affiliation: 'Pusan National University, South Korea' },
    plate: { kind: 'plate', id: 'KBO-ATTENDANCE', period: '2025.03 – 2025.06', tag: '통계' },
  };
  it.each(Object.entries(ARTIFACTS))('%s artifact: 1200×630, drawn in the right half, under 300 KB', async (_kind, artifact) => {
    const plain = await renderOgPng({ eyebrow: 'RECORDS', title: '기록 · 백성은', subtitle: '학력, 수상, 기술' });
    const png = await renderOgPng({ eyebrow: 'RECORDS', title: '기록 · 백성은', subtitle: '학력, 수상, 기술', artifact });
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
    expect(png.length, `${png.length} bytes`).toBeLessThan(300 * 1024);
    // the artifact is drawn in the right half: a good share of its pixels differ from the text-only card
    const rightHalf = (buf: Buffer) => sharp(buf).extract({ left: 700, top: 60, width: 440, height: 510 }).removeAlpha().raw().toBuffer();
    const [a, b] = await Promise.all([rightHalf(png), rightHalf(plain)]);
    let changed = 0;
    for (let i = 0; i < a.length; i += 3) if (Math.abs(a[i]! - b[i]!) + Math.abs(a[i + 1]! - b[i + 1]!) + Math.abs(a[i + 2]! - b[i + 2]!) > 30) changed += 1;
    expect(changed / (a.length / 3)).toBeGreaterThan(0.08);
  }, 30_000);

  it('OG colour literals equal their tokens.css values and og.ts has no other colour literal', () => {
    const tokens = readFileSync(new URL('../../src/styles/tokens.css', import.meta.url), 'utf8');
    for (const [key, name] of Object.entries(TOKEN_OF) as [keyof typeof TOKEN_OF, string][]) {
      const value = new RegExp(`(?<![\\w-])${name}:\\s*([^;]+);`).exec(tokens)?.[1];
      expect(value, `${name} is defined in tokens.css`).toBeDefined();
      expect(squash(OG_COLORS[key]), `OG_COLORS.${key} = tokens.css ${name}`).toBe(squash(value!));
    }
    const source = readFileSync(new URL('../../src/lib/og.ts', import.meta.url), 'utf8');
    const literals = [...new Set((source.match(/#[0-9A-Fa-f]{3,8}\b|rgba?\([^)]*\)/g) ?? []).map(squash))].sort();
    expect(literals, 'every colour literal in og.ts is one of OG_COLORS').toEqual([...new Set(Object.values(OG_COLORS).map(squash))].sort());
  });
});

describe('ogWords (final fix 2 item 22)', () => {
  it('splits at spaces only, so closing punctuation and Korean particles stay on their word', () => {
    expect(ogWords('…to find those earning less than their conditions suggest.').at(-1)).toBe('suggest.');
    expect(ogWords('사진 업로드·점수 랭킹 Django 웹 서비스 구현을 맡았습니다.').at(-1)).toBe('맡았습니다.');
    expect(ogWords('  two   spaces\n and a line break ')).toEqual(['two', 'spaces', 'and', 'a', 'line', 'break']);
  });
});
