// Pixel shares of a screenshot by palette class (a port of the game palette prototype's area.cjs): yellow is hue 42–64°,
// cyan 175–200° (both S > .45, V > .55); dark L < .16; light L > .85 with S < .12. Image boxes (character art, project
// thumbnails, figures) are content, not palette, and are left out.
import sharp from 'sharp';

export type Share = { dark: number; neutral: number; light: number; yellow: number; cyan: number };

function classOf(r: number, g: number, b: number): keyof Share {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), v = mx / 255, s = mx ? (mx - mn) / mx : 0;
  let h = 0;
  if (mx !== mn) {
    if (mx === r) h = 60 * (((g - b) / (mx - mn)) % 6);
    else if (mx === g) h = 60 * ((b - r) / (mx - mn) + 2);
    else h = 60 * ((r - g) / (mx - mn) + 4);
  }
  if (h < 0) h += 360;
  if (s > 0.45 && v > 0.55 && h >= 42 && h <= 64) return 'yellow';
  if (s > 0.45 && v > 0.55 && h >= 175 && h <= 200) return 'cyan';
  const l = (mx + mn) / 510;
  if (l < 0.16) return 'dark';
  if (l > 0.85 && s < 0.12) return 'light';
  return 'neutral';
}

/** Shares (0–1) of a PNG's pixels outside `exclude` boxes ([left, top, right, bottom] in image pixels). */
export async function areaShare(png: Buffer, exclude: number[][] = []): Promise<Share> {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const out: Share = { dark: 0, neutral: 0, light: 0, yellow: 0, cyan: 0 };
  let n = 0;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (exclude.some((b) => x >= b[0]! && x < b[2]! && y >= b[1]! && y < b[3]!)) continue;
      const i = (y * info.width + x) * info.channels;
      out[classOf(data[i]!, data[i + 1]!, data[i + 2]!)]++;
      n++;
    }
  }
  for (const k of Object.keys(out) as (keyof Share)[]) out[k] /= Math.max(1, n);
  return out;
}
