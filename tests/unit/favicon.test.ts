import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { faviconPng, icoFromPngs } from '../../src/lib/favicon';

// Final fix 2 item 21: raster icons built from public/favicon.svg.
describe('site icons', () => {
  it('the apple-touch-icon is a full, opaque 180px square; the favicon PNGs keep the rounded corners transparent', async () => {
    const apple = await faviconPng(180, { square: true });
    const meta = await sharp(apple).metadata();
    expect([meta.width, meta.height]).toEqual([180, 180]);
    expect((await sharp(apple).stats()).isOpaque).toBe(true);
    const small = await faviconPng(32);
    expect((await sharp(small).metadata()).width).toBe(32);
    const { data } = await sharp(small).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(data[3], 'top-left corner pixel is transparent').toBe(0);
    // the mark itself is drawn (named change GP-10, GP-OQ8: lime → the game palette's yellow #FFE600 on black)
    const px = [...Array(data.length / 4).keys()].map((i) => [data[i * 4]!, data[i * 4 + 1]!, data[i * 4 + 2]!, data[i * 4 + 3]!]);
    expect(px.some(([r, g, b, a]) => a! > 200 && r! > 235 && g! > 210 && b! < 60), 'yellow pixels exist').toBe(true);
    expect(px.some(([r, g, b, a]) => a! > 200 && r! < 215 && r! > 170 && g! > 220 && b! < 110), 'no lime pixels').toBe(false);
  }, 30_000);

  it('the same pixels on every run (no system font is involved)', async () => {
    expect((await faviconPng(32)).equals(await faviconPng(32))).toBe(true);
  }, 30_000);

  it('icoFromPngs writes an ICONDIR with one PNG entry per size', async () => {
    const pngs = [{ size: 16, png: await faviconPng(16) }, { size: 32, png: await faviconPng(32) }];
    const ico = icoFromPngs(pngs);
    expect([ico.readUInt16LE(0), ico.readUInt16LE(2), ico.readUInt16LE(4)]).toEqual([0, 1, 2]);
    let offset = 6 + 16 * 2;
    pngs.forEach(({ size, png }, i) => {
      const entry = 6 + 16 * i;
      expect(ico.readUInt8(entry)).toBe(size);
      expect(ico.readUInt8(entry + 1)).toBe(size);
      expect(ico.readUInt32LE(entry + 8)).toBe(png.length);
      expect(ico.readUInt32LE(entry + 12)).toBe(offset);
      expect(ico.subarray(offset, offset + 8).toString('latin1')).toBe('\x89PNG\r\n\x1a\n');
      offset += png.length;
    });
    expect(ico.length).toBe(offset);
  }, 30_000);
});

describe('GP-10: the icon in the game palette', () => {
  it('public/favicon.svg is yellow --gp-y on the page black --gp-k0', async () => {
    const { readFileSync } = await import('node:fs');
    const svg = readFileSync(new URL('../../public/favicon.svg', import.meta.url), 'utf8');
    const tokens = readFileSync(new URL('../../src/styles/game-tokens.css', import.meta.url), 'utf8');
    const token = (name: string) => new RegExp(`${name}:\\s*(#[0-9A-F]{6})`).exec(tokens)?.[1];
    expect(new Set(svg.match(/#[0-9A-F]{6}/gi))).toEqual(new Set([token('--gp-k0'), token('--gp-y')]));
  });
});
