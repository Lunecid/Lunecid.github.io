// The game cover's display words ("GAME DATA / ANALYST") stay inside the dark plate within its yellow outline at every
// width and on tall screens (owner report 2026-10-06: on a ~455 px wide tablet in portrait the last T of ANALYST
// crossed the plate's stepped lower edge). The plate is the cover's ::after (chooser.css .cv::after): grid rows 1-2
// (the series line and the words) widened by its margins and clipped to a polygon with a chamfered top-right corner
// (--pc) and a lower edge raised by --ps right of 58 %. Each glyph's ink box (from its origin and the baseline, by the
// display face's own metrics) must lie inside that polygon.
import type { Page } from '@playwright/test';
import { test, expect } from './helpers';

const VIEWPORTS = [[320, 640], [360, 780], [390, 844], [412, 915], [455, 1000], [540, 960], [600, 1024], [768, 1024], [820, 1180], [1280, 800]] as const;

type Miss = { glyph: string; box: number[]; corner: string };

/** Glyph ink boxes of the display words that fall outside the plate's inner polygon (empty when they all fit). */
function misses(page: Page): Promise<{ misses: Miss[]; glyphs: number; plate: number[] }> {
  return page.evaluate(() => {
    const cv = document.querySelector<HTMLElement>('.file--game .cv')!;
    const head = cv.querySelector<HTMLElement>('.cv__head')!.getBoundingClientRect();
    const disp = cv.querySelector<HTMLElement>('.disp')!;
    const d = disp.getBoundingClientRect();
    const after = getComputedStyle(cv, '::after');
    const px = (v: string) => parseFloat(v) || 0;
    const left = d.left + px(after.marginLeft);
    const right = d.right - px(after.marginRight);
    const top = head.top + px(after.marginTop);
    const bottom = d.bottom - px(after.marginBottom);
    const W = right - left;
    const H = bottom - top;
    const pc = px(after.getPropertyValue('--pc'));
    const ps = px(after.getPropertyValue('--ps'));
    // inside the polygon (0,0) (W-pc,0) (W,pc) (W,H-ps) (.58W,H-ps) (.58W-ps,H) (0,H), local coordinates
    const inside = (x: number, y: number): boolean => {
      const e = 0.5; // half a pixel of rounding
      if (x < -e || y < -e || x > W + e || y > H + e) return false;
      if (x - (W - pc) > y + e) return false; // the chamfer
      if (y > H - ps + e && x > 0.58 * W - (y - (H - ps)) + e) return false; // the step (its 45° flank)
      return true;
    };
    const cs = getComputedStyle(disp);
    const ctx = document.createElement('canvas').getContext('2d')!;
    ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const out: Miss[] = [];
    let glyphs = 0;
    for (const word of disp.querySelectorAll<HTMLElement>('.disp__blk, .disp__w')) {
      const text = word.firstChild as Text;
      // the baseline: a zero-size inline-block sits on it
      const probe = document.createElement('span');
      probe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
      word.append(probe);
      const baseline = probe.getBoundingClientRect().top;
      probe.remove();
      for (let i = 0; i < text.length; i++) {
        const ch = text.data[i]!;
        if (!ch.trim()) continue;
        const range = document.createRange();
        range.setStart(text, i);
        range.setEnd(text, i + 1);
        const r = range.getBoundingClientRect();
        const m = ctx.measureText(ch);
        // the ink: from the glyph's origin (the range's left edge) and the baseline, by the face's own metrics
        const box = [r.left - m.actualBoundingBoxLeft, baseline - m.actualBoundingBoxAscent, r.left + m.actualBoundingBoxRight, baseline + m.actualBoundingBoxDescent];
        glyphs++;
        const corners: [string, number, number][] = [['top-left', box[0]!, box[1]!], ['top-right', box[2]!, box[1]!], ['bottom-left', box[0]!, box[3]!], ['bottom-right', box[2]!, box[3]!]];
        for (const [corner, x, y] of corners) {
          if (!inside(x - left, y - top)) {
            out.push({ glyph: ch, box: box.map((v) => Math.round(v)), corner });
            break;
          }
        }
      }
    }
    return { misses: out, glyphs, plate: [left, top, right, bottom, pc, ps].map((v) => Math.round(v)) };
  });
}

for (const lang of ['ko', 'en'] as const) {
  for (const [w, h] of VIEWPORTS) {
    test(`the cover's display words fit inside the plate (${lang}, ${w}×${h}): after the opening and with ?choose`, async ({ browser }) => {
      for (const route of [lang === 'en' ? '/en/' : '/', lang === 'en' ? '/en/?choose' : '/?choose']) {
        const context = await browser.newContext({ viewport: { width: w, height: h } });
        const page = await context.newPage();
        await page.goto(route);
        await page.evaluate(() => document.fonts.ready);
        await page.waitForFunction(() => !document.documentElement.hasAttribute('data-intro') && document.fonts.check('400 40px "SB Cover Display"'));
        const r = await misses(page);
        expect(r.glyphs, `${route} glyphs measured`).toBeGreaterThanOrEqual(15);
        expect(r.misses, `${route} plate ${JSON.stringify(r.plate)}`).toEqual([]);
        await context.close();
      }
    });
  }
}

// the same in whatever face the browser shows: without the display face (still loading, or blocked) the fallback
// (Impact / Arial Narrow Bold / sans-serif) is far wider than Anton, so the words are fitted by measuring them
for (const [w, h] of [[320, 640], [390, 844], [455, 1000], [768, 1024], [1280, 800]] as const) {
  test(`without the display face (fallback), the cover's display words still fit inside the plate (${w}×${h})`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: w, height: h } });
    await context.route(/sb-cover-display/, (r) => r.abort());
    const page = await context.newPage();
    await page.goto('/?choose', { waitUntil: 'networkidle' });
    expect(await page.evaluate(() => document.fonts.check('400 40px "SB Cover Display"'))).toBe(false);
    await expect.poll(async () => (await misses(page)).misses, { message: 'fallback face fits' }).toEqual([]);
    await context.close();
  });
}

