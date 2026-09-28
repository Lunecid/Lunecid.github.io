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
    // the mark itself is drawn: lime (#C8F03C) pixels exist
    const lime = [...Array(data.length / 4).keys()].some((i) => data[i * 4] > 170 && data[i * 4 + 1] > 200 && data[i * 4 + 2] < 110);
    expect(lime).toBe(true);
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
