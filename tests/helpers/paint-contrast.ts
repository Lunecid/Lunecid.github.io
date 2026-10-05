// Text-on-paint contrast from pixels (a port of the v5 prototype's check-v5.cjs paintSample): for each text-bearing
// element inside a [data-paint-text] host, screenshot its box, screenshot it again with that element's text made
// transparent, take the pixels that changed (the glyphs and their antialiasing), grow them by 2 CSS px, and compare the
// text colour with the lightest and the darkest paint pixel under them (from the text-free shot). The analytic bound
// (scripts/paint/paint.mjs worstContrast) is the formula; this is what the browser actually paints, at this width and
// device pixel ratio, over the committed raster tiles and the frayed edge.
import type { Page } from '@playwright/test';
import sharp from 'sharp';

export interface PaintSample {
  /** host selector path + the text, for the report */
  label: string;
  /** contrast of the text colour against the lightest / darkest paint pixel under the grown glyph mask */
  atLightest: number;
  atDarkest: number;
  /** pixels under the mask */
  pixels: number;
  /** the host's (or its painted pseudo-element's) background image */
  paint: string;
}

const lin = (v: number): number => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
const lum = (r: number, g: number, b: number): number => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a: number, b: number): number => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

async function raw(png: Buffer): Promise<{ data: Buffer; width: number; height: number }> {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/** Marks every visible element inside a [data-paint-text] host that owns a non-blank text node; returns their count. */
async function markTextOwners(page: Page): Promise<number> {
  return page.evaluate(() => {
    let n = 0;
    for (const host of document.querySelectorAll<HTMLElement>('[data-paint-text]')) {
      const owners = new Set<HTMLElement>();
      const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
      for (let t = walker.nextNode(); t; t = walker.nextNode()) if ((t.textContent ?? '').trim()) owners.add(t.parentElement!);
      for (const el of owners) {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        if (r.width < 1 || r.height < 1 || s.visibility === 'hidden' || s.display === 'none') continue;
        el.dataset.pcIdx = String(n++);
      }
    }
    return n;
  });
}

/** Every text-on-paint sample of the page as it is now (scroll position, viewport and DPR as the caller set them). */
export async function paintSamples(page: Page): Promise<PaintSample[]> {
  const count = await markTextOwners(page);
  const dpr = await page.evaluate(() => window.devicePixelRatio);
  const out: PaintSample[] = [];
  for (let i = 0; i < count; i++) {
    const el = page.locator(`[data-pc-idx="${i}"]`);
    // the text's own box (a tall table cell's glyphs sit at its top), centred in the viewport clear of the sticky nav;
    // the clip is in viewport coordinates
    await el.evaluate((node) => {
      const range = document.createRange();
      range.selectNodeContents(node);
      const r = range.getBoundingClientRect();
      window.scrollBy(0, r.top + r.height / 2 - window.innerHeight / 2);
    });
    await page.waitForTimeout(50);
    const info = await el.evaluate((node) => {
      const host = node.closest<HTMLElement>('[data-paint-text]')!;
      const paints = [host, ...host.querySelectorAll<HTMLElement>('*')].flatMap((e) => [getComputedStyle(e).backgroundImage, getComputedStyle(e, '::before').backgroundImage, getComputedStyle(e, '::after').backgroundImage]);
      const range = document.createRange();
      range.selectNodeContents(node);
      const r = range.getBoundingClientRect();
      return {
        color: getComputedStyle(node).color,
        text: (node.textContent ?? '').trim().slice(0, 24),
        host: `${host.tagName.toLowerCase()}.${[...host.classList].join('.')}`,
        paint: paints.find((p) => p.includes('paint-')) ?? paints.find((p) => p !== 'none') ?? 'none',
        box: { x: r.x, y: r.y, width: r.width, height: r.height },
      };
    });
    // grow the clip by 4 CSS px so the 2 px dilation never runs off the shot
    const clip = { x: Math.max(0, info.box.x - 4), y: Math.max(0, info.box.y - 4), width: info.box.width + 8, height: info.box.height + 8 };
    const withText = await raw(await page.screenshot({ clip, animations: 'disabled' }));
    await el.evaluate((node) => node.style.setProperty('color', 'transparent', 'important'));
    const without = await raw(await page.screenshot({ clip, animations: 'disabled' }));
    await el.evaluate((node) => node.style.removeProperty('color'));
    const { width, height } = without;
    const changed = new Uint8Array(width * height);
    for (let p = 0; p < width * height; p++) {
      const o = p * 3;
      if (withText.data[o] !== without.data[o] || withText.data[o + 1] !== without.data[o + 1] || withText.data[o + 2] !== without.data[o + 2]) changed[p] = 1;
    }
    const grow = Math.round(2 * dpr);
    let lightest = -1;
    let darkest = 2;
    let pixels = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let near = false;
        for (let dy = -grow; dy <= grow && !near; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= height) continue;
          for (let dx = -grow; dx <= grow; dx++) {
            const xx = x + dx;
            if (xx >= 0 && xx < width && changed[yy * width + xx]) {
              near = true;
              break;
            }
          }
        }
        if (!near) continue;
        const o = (y * width + x) * 3;
        const l = lum(without.data[o]!, without.data[o + 1]!, without.data[o + 2]!);
        pixels++;
        if (l > lightest) lightest = l;
        if (l < darkest) darkest = l;
      }
    }
    const [r, g, b] = (info.color.match(/[\d.]+/g) ?? ['0', '0', '0']).map(Number) as [number, number, number];
    const text = lum(r, g, b);
    out.push({ label: `${info.host} "${info.text}"`, atLightest: pixels ? ratio(text, lightest) : Infinity, atDarkest: pixels ? ratio(text, darkest) : Infinity, pixels, paint: info.paint });
  }
  await page.evaluate(() => document.querySelectorAll('[data-pc-idx]').forEach((e) => e.removeAttribute('data-pc-idx')));
  return out;
}
