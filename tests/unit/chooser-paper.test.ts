// The chooser printout's art paper (scripts/paint/paper.mjs): its formation is a pre-rendered WebP tile (an image the
// browser decodes, not SVG noise rasterised on the main thread and painted late), its tooth stays the prototype's SVG
// as a mask (never an LCP candidate). The sources are the approved prototype's bytes (owner-assets
// chooser-v6.4/chooser-opening.v64.html).
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FORMATION_SVG, PAPER, PAPER_TILE_PX, TOOTH_SVG, paperTileFile } from '../../scripts/paint/paper.mjs';
import { uri } from '../../scripts/paint/paint.mjs';

const sha = (s: string): string => createHash('sha256').update(s).digest('hex');
const hex = (h: string): number[] => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lum = (rgb: number[]): number => {
  const [r, g, b] = rgb.map((c) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const contrast = (a: number[], b: number[]): number => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
};

describe('chooser art paper (scripts/paint/paper.mjs)', () => {
  it('the tooth and formation sources are the prototype’s bytes (sha256 of the data: URI)', () => {
    expect(sha(uri(TOOTH_SVG)), '--tooth').toBe('ec91e6165d9d8b8e987aca0225669f0c9430d4f83382191b09720673dd93080b');
    expect(sha(uri(FORMATION_SVG)), '--formation').toBe('109fa429e35e11c706f4417c4156cdeabc3339c044dec4b6a5db7e5d8782f896');
    expect(PAPER).toBe('#FBFAF6');
    expect(readFileSync('src/styles/tokens.css', 'utf8')).toMatch(new RegExp(`--pr-paper: ${PAPER};`));
  });

  it('the formation tile is an opaque WebP of the tile size, small (it is the paper’s own background)', async () => {
    const { default: sharp } = await import('sharp');
    const file = paperTileFile();
    expect(file.replace(/\\/g, '/')).toMatch(/src\/styles\/paint\/paper-formation\.webp$/);
    expect(existsSync(file)).toBe(true);
    const meta = await sharp(file).metadata();
    expect([meta.format, meta.width, meta.height, meta.hasAlpha]).toEqual(['webp', PAPER_TILE_PX, PAPER_TILE_PX, false]);
    expect(readFileSync(file).length).toBeLessThanOrEqual(1500);
  });

  it('from its pixels: the tile’s mean is the paper colour (each channel within 2), and the printout ink reads on its darkest pixel', async () => {
    const { default: sharp } = await import('sharp');
    const { data, info } = await sharp(paperTileFile()).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const sum = [0, 0, 0];
    let darkest = [255, 255, 255];
    for (let i = 0; i < data.length; i += 3) {
      const px = [data[i]!, data[i + 1]!, data[i + 2]!];
      px.forEach((c, k) => (sum[k]! += c));
      if (lum(px) < lum(darkest)) darkest = px;
    }
    const mean = sum.map((s) => s / (info.width * info.height));
    hex(PAPER).forEach((c, k) => expect(Math.abs(mean[k]! - c), `channel ${k}`).toBeLessThanOrEqual(2));
    const tokens = readFileSync('src/styles/tokens.css', 'utf8');
    expect(tokens).toMatch(/--pr-ink: var\(--ed-ink\);/);
    const ink = /--ed-ink: (#[0-9A-Fa-f]{6});/.exec(tokens)?.[1];
    expect(ink).toBeDefined();
    expect(contrast(hex(ink!), darkest)).toBeGreaterThanOrEqual(7);
  });
});
