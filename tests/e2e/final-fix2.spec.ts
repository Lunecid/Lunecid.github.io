// Final review fix 2 (design, performance and accessibility polish) in a real browser. Items covered elsewhere: 12
// (tests/unit/toolchain.test.ts), 14, 20, 21 (tests/ops/dist-assets.test.mjs), 15 (tests/react/BgmToggle.test.tsx),
// 17 (tests/e2e/nojs.spec.ts), 22 (tests/ops/og-images.test.mjs), 23 (tests/astro/AucOverallChart.test.ts).
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import sharp from 'sharp';
import { test, expect, horizontalOverflow, settle } from './helpers';

const ART = (id: string): boolean => existsSync(join(process.cwd(), 'src', 'assets', 'characters', `${id}.png`));
const HERO_ART = ART('remielle') && ART('eula');

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}
async function box(locator: Locator): Promise<Box> {
  const b = await locator.boundingBox();
  expect(b, 'element has a layout box').toBeTruthy();
  return b as Box;
}
async function open(page: Page, route: string, width: number, height = 900): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width, height });
  await page.goto(route, { waitUntil: 'networkidle' });
  await settle(page);
}

/** The candidate width the browser picked (from srcset) and the width the image is painted at (object-fit: cover). */
async function servedVsPainted(img: Locator): Promise<{ served: number; largest: number; painted: number; widths: number[] }> {
  return img.evaluate(async (el: HTMLImageElement) => {
    if (!el.complete) await new Promise((resolve) => el.addEventListener('load', resolve, { once: true }));
    const r = el.getBoundingClientRect();
    const aspect = Number(el.getAttribute('width')) / Number(el.getAttribute('height'));
    // F-039: <picture><source type=avif> means currentSrc is AVIF; prefer that source's srcset over the img fallback.
    const picture = el.closest('picture');
    const avif = picture?.querySelector('source[type="image/avif"]');
    const srcset = (avif?.getAttribute('srcset') || el.srcset || '').trim();
    const candidates = srcset.split(',').map((c) => c.trim().split(/\s+/)).map(([url, w]) => ({ url, w: parseInt(w ?? '0', 10) }));
    const current = new URL(el.currentSrc).pathname;
    const hit = candidates.find((c) => new URL(c.url, location.href).pathname === current);
    return { served: hit?.w ?? 0, largest: Math.max(...candidates.map((c) => c.w)), painted: Math.max(r.width, r.height * aspect), widths: candidates.map((c) => c.w) };
  });
}

/** True when a point `dy` px above and below (and `dx` px left and right) of the element's centre still hits it. */
async function hitArea(target: Locator, dy = 21, dx = 21): Promise<boolean> {
  return target.evaluate(
    (el, [ddy, ddx]) => {
      el.scrollIntoView({ block: 'center' }); // clear of the sticky nav
      const r = el.getBoundingClientRect();
      const [cx, cy] = [r.left + r.width / 2, r.top + r.height / 2];
      const hits = (x: number, y: number): boolean => {
        const top = document.elementFromPoint(x, y);
        return top !== null && (top === el || el.contains(top));
      };
      return hits(cx, cy - ddy) && hits(cx, cy + ddy) && hits(cx - ddx, cy) && hits(cx + ddx, cy);
    },
    [dy, dx] as const,
  );
}

test.describe('item 1: the character art fades out where it meets open background', () => {
  for (const width of [1440, 2560]) {
    test(`${width}px: the hero and MAIN MENU art end in a fade, not a straight cut, in both hero states`, async ({ page }) => {
      test.skip(!HERO_ART, 'needs both hero characters');
      await open(page, '/game/', width, 1300);
      const edgeOf = async (frame: Locator): Promise<number> => {
        // 2px strip just inside the frame's right edge (below the swap buttons, above the credit)
        const png = await frame.screenshot({ scale: 'css' });
        const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
        let max = 0;
        for (let y = 70; y < info.height - 120; y += 1) {
          for (let x = info.width - 3; x < info.width - 1; x += 1) {
            const i = (y * info.width + x) * 3;
            max = Math.max(max, Math.abs(data[i]! - 0x0b), Math.abs(data[i + 1]! - 0x0d), Math.abs(data[i + 2]! - 0x11));
          }
        }
        return max;
      };
      const hero = page.locator('.char-stage--hero .char-stage__frame');
      await expect(page.locator('.char-stage--hero')).toHaveAttribute('data-phase', 'shown', { timeout: 5000 });
      expect(await edgeOf(hero), 'Remielle: nothing drawn at the hero frame\'s right edge').toBeLessThan(14);
      const side = page.locator('.char-stage--side .char-stage__frame');
      await side.scrollIntoViewIfNeeded();
      await expect(page.locator('.char-stage--side')).toHaveAttribute('data-phase', 'shown', { timeout: 5000 });
      expect(await edgeOf(side), 'MAIN MENU art: nothing drawn at its right edge').toBeLessThan(14);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.locator('.char-stage__swap button').nth(1).click();
      await expect(page.locator('.char-stage--hero')).toHaveAttribute('data-phase', 'shown', { timeout: 5000 });
      expect(await edgeOf(hero), 'Eula: nothing drawn at the hero frame\'s right edge').toBeLessThan(14);
    });
  }
});

test.describe('item 1, round 3: masked art never exceeds its mask at device boundaries', () => {
  /**
   * Three captures at device resolution (shipped / img hidden / mask removed). Flags any boundary device
   * row/column where extra art (shipped − hidden) exceeds alpha × (unmasked − hidden). Scans the frame's own
   * edges, the section clip edge, and 2–6 device px inside each.
   */
  const TOL = 14;
  const ALPHA_SLACK = 0.35;
  const DESKTOP = [1068, 1152, 1200, 1280, 1366, 1440, 1707, 1920, 2560] as const;
  const DESKTOP_H: Record<number, number> = {
    1068: 800, 1152: 864, 1200: 800, 1280: 720, 1366: 768, 1440: 900, 1707: 960, 1920: 1080, 2560: 1440,
  };
  const TABLET_1_5 = [[900, 1200], [1000, 1000]] as const;

  async function scrollFrame(frame: Locator): Promise<void> {
    await frame.evaluate((el) => {
      const r = el.getBoundingClientRect();
      window.scrollTo({ top: window.scrollY + r.top + r.height / 2 - window.innerHeight / 2, left: 0, behavior: 'instant' as ScrollBehavior });
    });
    await frame.page().waitForTimeout(200);
  }

  async function visibleAndOwn(frame: Locator): Promise<{ visible: Box; own: Box; dpr: number }> {
    return frame.evaluate((el) => {
      const r = el.getBoundingClientRect();
      let left = r.left;
      let right = r.right;
      let top = r.top;
      let bottom = r.bottom;
      for (let node: Element | null = el.parentElement; node && node !== document.documentElement; node = node.parentElement) {
        const style = getComputedStyle(node);
        const clipX = /hidden|clip|scroll|auto/.test(style.overflowX);
        const clipY = /hidden|clip|scroll|auto/.test(style.overflowY);
        if (!clipX && !clipY) continue;
        const cr = node.getBoundingClientRect();
        if (clipX) {
          left = Math.max(left, cr.left);
          right = Math.min(right, cr.right);
        }
        if (clipY) {
          top = Math.max(top, cr.top);
          bottom = Math.min(bottom, cr.bottom);
        }
      }
      return {
        own: { x: r.left, y: r.top, width: r.width, height: r.height },
        visible: { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) },
        dpr: window.devicePixelRatio,
      };
    });
  }

  async function maskParams(frame: Locator): Promise<{
    kind: 'hero-mobile' | 'hero-tablet' | 'hero-desktop' | 'side' | 'fg-mobile' | 'fg-tablet' | 'fg-desktop' | 'none';
    w: number;
    h: number;
    W: number;
    creditGap: number;
  }> {
    return frame.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      const img = el.querySelector('img') as HTMLElement | null;
      const W = img ? img.getBoundingClientRect().width : r.width;
      const overhang = parseFloat(style.getPropertyValue('--overhang')) || 0;
      const creditGap = parseFloat(style.getPropertyValue('--credit-gap')) || 0;
      const insetL = parseFloat(style.getPropertyValue('--inset-l')) || 0;
      const insetR = parseFloat(style.getPropertyValue('--inset-r')) || 0;
      if (el.classList.contains('char-stage__frame')) {
        if (el.closest('.char-stage--side')) return { kind: 'side' as const, w: r.width, h: r.height, W, creditGap };
        if (overhang === 0 && creditGap === 0) return { kind: 'hero-mobile' as const, w: r.width, h: r.height, W, creditGap };
        if (overhang === 32) return { kind: 'hero-tablet' as const, w: r.width, h: r.height, W, creditGap };
        return { kind: 'hero-desktop' as const, w: r.width, h: r.height, W, creditGap };
      }
      if (el.classList.contains('fg__chr')) {
        if (overhang > 0) return { kind: 'fg-desktop' as const, w: r.width, h: r.height, W, creditGap };
        // Tablet showcase fades L/R (inset on both sides); phone only insets the bottom.
        if (insetL > 0 && insetR > 0) return { kind: 'fg-tablet' as const, w: r.width, h: r.height, W, creditGap };
        return { kind: 'fg-mobile' as const, w: r.width, h: r.height, W, creditGap };
      }
      return { kind: 'none' as const, w: r.width, h: r.height, W, creditGap };
    });
  }

  function maskAlpha(p: Awaited<ReturnType<typeof maskParams>>, x: number, y: number): number {
    const { kind, w, h, W, creditGap } = p;
    const fade = (t: number, a: number, b: number): number => (t <= a ? 0 : t >= b ? 1 : (t - a) / (b - a));
    const fadeOut = (t: number, a: number, b: number): number => (t <= a ? 1 : t >= b ? 0 : 1 - (t - a) / (b - a));
    const fromBottom = h - y;
    switch (kind) {
      case 'hero-mobile':
        return fade(fromBottom / Math.max(1e-6, h), 0, 0.16);
      case 'hero-tablet': {
        const left0 = 0.16 * W;
        const left1 = 0.34 * W;
        const right0 = w - 0.12 * W;
        const right1 = w - 4;
        // Right: opaque to right0, fade to 0 at right1, fully transparent from right1→w (4px tip like top).
        const ah =
          x <= left0 ? 0 : x < left1 ? fade(x, left0, left1) : x <= right0 ? 1 : x >= right1 ? 0 : fadeOut(x, right0, right1);
        let av = 1;
        if (fromBottom <= creditGap) av = 0;
        else if (fromBottom < creditGap + 110) av = (fromBottom - creditGap) / 110;
        else if (fromBottom >= h - 4) av = 0;
        else if (fromBottom >= h - 56) av = fadeOut(fromBottom, h - 56, h - 4);
        return ah * av;
      }
      case 'hero-desktop': {
        const left0 = 0.32 * W;
        const left1 = 0.5 * W;
        const right0 = w - 0.18 * W;
        const ah = x <= left0 ? 0 : x < left1 ? fade(x, left0, left1) : x <= right0 ? 1 : fadeOut(x, right0, w);
        let av = 1;
        if (fromBottom <= creditGap) av = 0;
        else if (fromBottom < creditGap + 110) av = (fromBottom - creditGap) / 110;
        else if (fromBottom >= h - 56) av = fadeOut(fromBottom, h - 56, h);
        return ah * av;
      }
      case 'side': {
        const left1 = 0.3 * W;
        const right0 = w - 0.2 * W;
        const ah = x <= 0 ? 0 : x < left1 ? fade(x, 0, left1) : x <= right0 ? 1 : fadeOut(x, right0, w);
        let av = 1;
        if (fromBottom / Math.max(1e-6, h) <= 0.22) av = fade(fromBottom / Math.max(1e-6, h), 0, 0.22);
        else if (fromBottom >= h - 32) av = fadeOut(fromBottom, h - 32, h);
        return ah * av;
      }
      case 'fg-mobile':
        return fade(fromBottom / Math.max(1e-6, h), 0, 0.16);
      case 'fg-tablet': {
        const ah =
          x <= 4
            ? 0
            : x / Math.max(1e-6, w) <= 0.14
              ? fade(x / Math.max(1e-6, w), 4 / Math.max(1e-6, w), 0.14)
              : x >= w - 4
                ? 0
                : x / Math.max(1e-6, w) >= 0.88
                  ? fadeOut(x / Math.max(1e-6, w), 0.88, (w - 4) / Math.max(1e-6, w))
                  : 1;
        let av = fromBottom >= h - 4 ? 0 : fade(fromBottom / Math.max(1e-6, h), 0, 0.16);
        if (fromBottom >= h - 40 && fromBottom < h - 4) av *= fadeOut(fromBottom, h - 40, h - 4);
        return ah * av;
      }
      case 'fg-desktop': {
        const ah = x <= 0.18 * W ? 0 : fade(x, 0.18 * W, 0.42 * W);
        const av = fade(fromBottom / Math.max(1e-6, h), 0, 0.12);
        return ah * av;
      }
      default:
        return 1;
    }
  }

  async function assertFrameMask(page: Page, frame: Locator, hideSel: string, label: string): Promise<void> {
    await scrollFrame(frame);
    const { visible, own, dpr } = await visibleAndOwn(frame);
    if (visible.width < 4 || visible.height < 4) return;
    const params = await maskParams(frame);

    const padCss = 8;
    const clip = {
      x: Math.max(0, visible.x - padCss),
      y: Math.max(0, visible.y - padCss),
      width: Math.min(page.viewportSize()!.width - Math.max(0, visible.x - padCss), visible.width + padCss * 2),
      height: Math.min(page.viewportSize()!.height - Math.max(0, visible.y - padCss), visible.height + padCss * 2),
    };
    const raw = async (): Promise<{ data: Buffer; width: number; height: number }> => {
      const { data, info } = await sharp(await page.screenshot({ clip, scale: 'device' }))
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      return { data: data as Buffer, width: info.width, height: info.height };
    };

    const shipped = await raw();
    const hide = await page.addStyleTag({ content: `${hideSel} { visibility: hidden !important; }` });
    const hidden = await raw();
    await hide.evaluate((el) => (el as Element).remove());
    await frame.evaluate((el) => {
      (el as HTMLElement).style.setProperty('mask-image', 'none', 'important');
      (el as HTMLElement).style.setProperty('-webkit-mask-image', 'none', 'important');
    });
    const unmasked = await raw();
    await frame.evaluate((el) => {
      (el as HTMLElement).style.removeProperty('mask-image');
      (el as HTMLElement).style.removeProperty('-webkit-mask-image');
    });

    const channels = shipped.data.length / (shipped.width * shipped.height);
    const diff = (a: Buffer, b: Buffer, i: number): number => {
      let m = 0;
      for (let c = 0; c < 3; c += 1) m = Math.max(m, Math.abs(a[i + c]! - b[i + c]!));
      return m;
    };

    const vL = Math.round((visible.x - clip.x) * dpr);
    const vT = Math.round((visible.y - clip.y) * dpr);
    const vR = Math.round((visible.x + visible.width - clip.x) * dpr) - 1;
    const vB = Math.round((visible.y + visible.height - clip.y) * dpr) - 1;
    const oL = Math.round((own.x - clip.x) * dpr);
    const oT = Math.round((own.y - clip.y) * dpr);
    const oR = Math.round((own.x + own.width - clip.x) * dpr) - 1;
    const oB = Math.round((own.y + own.height - clip.y) * dpr) - 1;

    const edges: { name: string; xs: number[]; ys: number[]; horiz: boolean }[] = [];
    const pushVert = (name: string, x: number, inward: 1 | -1) => {
      const xs = [x];
      for (let k = 2; k <= 6; k += 1) xs.push(x + inward * k);
      edges.push({ name, xs: xs.filter((v) => v >= 0 && v < shipped.width), ys: [], horiz: false });
    };
    const pushHoriz = (name: string, y: number, inward: 1 | -1) => {
      const ys = [y];
      for (let k = 2; k <= 6; k += 1) ys.push(y + inward * k);
      edges.push({ name, xs: [], ys: ys.filter((v) => v >= 0 && v < shipped.height), horiz: true });
    };
    pushVert(`${label} visible-right`, vR, -1);
    pushVert(`${label} visible-left`, vL, 1);
    pushHoriz(`${label} visible-top`, vT, 1);
    pushHoriz(`${label} visible-bottom`, vB, -1);
    if (Math.abs(oR - vR) > 1) pushVert(`${label} own-right`, oR, -1);
    if (Math.abs(oL - vL) > 1) pushVert(`${label} own-left`, oL, 1);
    if (Math.abs(oT - vT) > 1) pushHoriz(`${label} own-top`, oT, 1);
    if (Math.abs(oB - vB) > 1) pushHoriz(`${label} own-bottom`, oB, -1);

    const midPad = Math.round(40 * dpr);
    for (const edge of edges) {
      let worst = 0;
      let worstAt = '';
      if (!edge.horiz) {
        for (const x of edge.xs) {
          for (let y = vT + midPad; y <= vB - midPad; y += Math.max(1, Math.round(dpr))) {
            const i = (y * shipped.width + x) * channels;
            const art = diff(shipped.data, hidden.data, i);
            const full = diff(unmasked.data, hidden.data, i);
            if (full < 10) continue;
            const cssX = clip.x + x / dpr - own.x;
            const cssY = clip.y + y / dpr - own.y;
            const a = maskAlpha(params, cssX, cssY);
            const allowed = a * full + TOL + ALPHA_SLACK * full;
            const excess = art - allowed;
            if (excess > worst) {
              worst = excess;
              worstAt = `${edge.name}@${x},${y} art=${art.toFixed(1)} full=${full.toFixed(1)} a=${a.toFixed(2)} allowed=${allowed.toFixed(1)}`;
            }
          }
        }
      } else {
        for (const y of edge.ys) {
          for (let x = vL + midPad; x <= vR - midPad; x += Math.max(1, Math.round(dpr))) {
            const i = (y * shipped.width + x) * channels;
            const art = diff(shipped.data, hidden.data, i);
            const full = diff(unmasked.data, hidden.data, i);
            if (full < 10) continue;
            const cssX = clip.x + x / dpr - own.x;
            const cssY = clip.y + y / dpr - own.y;
            const a = maskAlpha(params, cssX, cssY);
            const allowed = a * full + TOL + ALPHA_SLACK * full;
            const excess = art - allowed;
            if (excess > worst) {
              worst = excess;
              worstAt = `${edge.name}@${x},${y} art=${art.toFixed(1)} full=${full.toFixed(1)} a=${a.toFixed(2)} allowed=${allowed.toFixed(1)}`;
            }
          }
        }
      }
      expect(worst, worstAt || edge.name).toBeLessThanOrEqual(0);
    }
  }

  async function assertHomeArt(page: Page, width: number, height: number): Promise<void> {
    await open(page, '/game/', width, height);
    await expect(page.locator('.char-stage--hero')).toHaveAttribute('data-phase', 'shown', { timeout: 5000 });
    await page.locator('.char-stage--hero .char-stage__img').evaluate(async (el: HTMLImageElement) => {
      if (!el.complete) await new Promise((resolve) => el.addEventListener('load', resolve, { once: true }));
    });
    await page.waitForTimeout(300);
    const hero = page.locator('.char-stage--hero .char-stage__frame');
    await assertFrameMask(page, hero, '.char-stage--hero .char-stage__img', 'hero Remielle');
    if (width >= 734) {
      const side = page.locator('.char-stage--side .char-stage__frame');
      await expect(page.locator('.char-stage--side')).toHaveAttribute('data-phase', 'shown', { timeout: 5000 });
      await assertFrameMask(page, side, '.char-stage--side .char-stage__img', 'MAIN MENU');
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.locator('.char-stage__swap button').nth(1).click();
    await expect(page.locator('.char-stage--hero')).toHaveAttribute('data-phase', 'shown', { timeout: 5000 });
    await assertFrameMask(page, hero, '.char-stage--hero .char-stage__img', 'hero Eula');
    if (width >= 734) {
      const side = page.locator('.char-stage--side .char-stage__frame');
      await expect(page.locator('.char-stage--side')).toHaveAttribute('data-phase', 'shown', { timeout: 5000 });
      await assertFrameMask(page, side, '.char-stage--side .char-stage__img', 'MAIN MENU after swap');
    }
  }

  async function assertShowcase(page: Page, width: number, height: number): Promise<void> {
    await open(page, '/game/player-log/', width, height);
    await page.locator('section.fg').evaluate((el) => {
      const r = el.getBoundingClientRect();
      window.scrollTo({ top: window.scrollY + r.top + r.height / 2 - window.innerHeight / 2, left: 0, behavior: 'instant' as ScrollBehavior });
    });
    await expect(page.locator('.fg__chr img')).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(1000);
    await assertFrameMask(page, page.locator('.fg__chr'), '.fg__chr img', 'showcase');
  }

  for (const dpr of [1.25, 1.5] as const) {
    for (const width of DESKTOP) {
      const height = DESKTOP_H[width] ?? 900;
      test.describe(`${width}x${height} @ DPR ${dpr}`, () => {
        test.use({ deviceScaleFactor: dpr });
        test('hero, MAIN MENU (both art states) and showcase stay within the mask', async ({ page }) => {
          test.setTimeout(120_000);
          test.skip(!HERO_ART, 'needs both hero characters');
          await assertHomeArt(page, width, height);
          await assertShowcase(page, width, height);
        });
      });
    }
  }
  for (const dpr of [1, 1.75, 2] as const) {
    test.describe(`1440x900 @ DPR ${dpr}`, () => {
      test.use({ deviceScaleFactor: dpr });
      test('hero, MAIN MENU (both art states) and showcase stay within the mask', async ({ page }) => {
        test.setTimeout(120_000);
        test.skip(!HERO_ART, 'needs both hero characters');
        await assertHomeArt(page, 1440, 900);
        await assertShowcase(page, 1440, 900);
      });
    });
  }
  for (const [width, height] of TABLET_1_5) {
    test.describe(`tablet ${width}x${height} @ DPR 1.5`, () => {
      test.use({ deviceScaleFactor: 1.5 });
      test('hero, MAIN MENU and showcase stay within the mask', async ({ page }) => {
        test.setTimeout(120_000);
        test.skip(!HERO_ART, 'needs both hero characters');
        await assertHomeArt(page, width, height);
        await assertShowcase(page, width, height);
      });
    });
  }
  test.describe('375x812 @ DPR 3', () => {
    test.use({ deviceScaleFactor: 3 });
    test('hero stays within the mask', async ({ page }) => {
      test.setTimeout(90_000);
      test.skip(!HERO_ART, 'needs both hero characters');
      await assertHomeArt(page, 375, 812);
    });
  });
});

test.describe('item 1, straight-cut guard: art is faded at the visible right boundary', () => {
  async function edgeStripLuma(
    page: Page,
    clipSel: string,
    edge: 'right' | 'left' | 'top',
  ): Promise<number> {
    // 2px strip just inside the clip edge; luminance vs the band background (#0b0d11).
    const tip = await page.locator(clipSel).evaluate((el, which) => {
      const r = el.getBoundingClientRect();
      if (which === 'right') {
        return { x: Math.max(0, r.right - 2), y: r.top + 70, width: 2, height: Math.max(40, r.height - 190) };
      }
      if (which === 'left') {
        return { x: Math.max(0, r.left), y: r.top + 70, width: 2, height: Math.max(40, r.height - 190) };
      }
      // Keep clear of the left/right fades and the top-right swap controls.
      return {
        x: r.left + Math.max(40, r.width * 0.34),
        y: Math.max(0, r.top),
        width: Math.max(40, r.width * 0.4),
        height: 2,
      };
    }, edge);
    if (tip.width < 1 || tip.height < 1) return 0;
    const png = await page.screenshot({ clip: tip, scale: 'css' });
    const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    let max = 0;
    for (let y = 0; y < info.height; y += 1) {
      for (let x = 0; x < info.width; x += 1) {
        const i = (y * info.width + x) * 3;
        max = Math.max(max, Math.abs(data[i]! - 0x0b), Math.abs(data[i + 1]! - 0x0d), Math.abs(data[i + 2]! - 0x11));
      }
    }
    return max;
  }

  /** Top band sits under the nav/grid; compare shipped vs art-hidden so a non-#0b0d11 wash is not a false fail. */
  async function edgeStripArtDelta(page: Page, clipSel: string, hideSel: string, edge: 'top' | 'left' | 'right'): Promise<number> {
    const tip = await page.locator(clipSel).evaluate((el, which) => {
      const r = el.getBoundingClientRect();
      if (which === 'right') {
        return { x: Math.max(0, r.right - 2), y: r.top + 70, width: 2, height: Math.max(40, r.height - 190) };
      }
      if (which === 'left') {
        return { x: Math.max(0, r.left), y: r.top + 70, width: 2, height: Math.max(40, r.height - 190) };
      }
      return {
        x: r.left + Math.max(40, r.width * 0.34),
        y: Math.max(0, r.top),
        width: Math.max(40, r.width * 0.4),
        height: 2,
      };
    }, edge);
    if (tip.width < 1 || tip.height < 1) return 0;
    const raw = async () => {
      const { data } = await sharp(await page.screenshot({ clip: tip, scale: 'css' }))
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      return data as Buffer;
    };
    const withArt = await raw();
    const hide = await page.addStyleTag({ content: `${hideSel} { visibility: hidden !important; }` });
    const without = await raw();
    await hide.evaluate((el) => (el as Element).remove());
    let max = 0;
    for (let i = 0; i < withArt.length; i += 3) {
      max = Math.max(
        max,
        Math.abs(withArt[i]! - without[i]!),
        Math.abs(withArt[i + 1]! - without[i + 1]!),
        Math.abs(withArt[i + 2]! - without[i + 2]!),
      );
    }
    return max;
  }

  for (const dpr of [1, 1.5] as const) {
    for (const [width, height] of [[1280, 720], [1440, 900], [1920, 1080], [2560, 1440]] as const) {
      test.describe(`${width}x${height} @ DPR ${dpr}`, () => {
        test.use({ deviceScaleFactor: dpr });
        test('hero and MAIN MENU right edge is faded', async ({ page }) => {
          test.skip(!HERO_ART, 'needs both hero characters');
          await open(page, '/game/', width, height);
          await expect(page.locator('.char-stage--hero')).toHaveAttribute('data-phase', 'shown', { timeout: 5000 });
          expect(await edgeStripLuma(page, '.char-stage--hero .char-stage__clip', 'right'), 'hero').toBeLessThanOrEqual(14);
          const side = page.locator('.char-stage--side .char-stage__frame');
          await side.evaluate((el) => {
            const r = el.getBoundingClientRect();
            window.scrollTo({ top: window.scrollY + r.top + r.height / 2 - window.innerHeight / 2, left: 0, behavior: 'instant' as ScrollBehavior });
          });
          await expect(page.locator('.char-stage--side')).toHaveAttribute('data-phase', 'shown', { timeout: 5000 });
          expect(await edgeStripLuma(page, '.char-stage--side .char-stage__clip', 'right'), 'MAIN MENU').toBeLessThanOrEqual(14);
        });
      });
    }
  }

  for (const dpr of [1, 1.5] as const) {
    for (const [width, height] of [[768, 1024], [820, 1180], [900, 1200], [1024, 768]] as const) {
      test.describe(`tablet ${width}x${height} @ DPR ${dpr}`, () => {
        test.use({ deviceScaleFactor: dpr });
        test('hero top (Eula) and showcase L/R/top stay faded', async ({ page }) => {
          test.setTimeout(90_000);
          test.skip(!HERO_ART, 'needs both hero characters');
          await open(page, '/game/', width, height);
          await expect(page.locator('.char-stage--hero')).toHaveAttribute('data-phase', 'shown', { timeout: 5000 });
          await page.locator('.char-stage__swap button').nth(1).click();
          await expect(page.locator('.char-stage--hero')).toHaveAttribute('data-phase', 'shown', { timeout: 5000 });
          await expect.poll(() => page.locator('.char-stage--hero .char-stage__img').evaluate((img: HTMLImageElement) => img.currentSrc || img.src)).toContain('/eula.');
          await page.waitForTimeout(300);
          expect(
            await edgeStripArtDelta(page, '.char-stage--hero .char-stage__clip', '.char-stage--hero .char-stage__img', 'top'),
            'hero Eula top',
          ).toBeLessThanOrEqual(14);

          await open(page, '/game/player-log/', width, height);
          await page.locator('section.fg').scrollIntoViewIfNeeded();
          await expect(page.locator('.fg__chr img')).toBeVisible({ timeout: 15_000 });
          await page.waitForTimeout(400);
          for (const edge of ['left', 'right', 'top'] as const) {
            expect(
              await edgeStripArtDelta(page, '.fg__chr-clip', '.fg__chr img', edge),
              `showcase tab0 ${edge}`,
            ).toBeLessThanOrEqual(14);
          }
          await page.locator('.fg__tab').nth(1).click();
          await expect(page.locator('.fg__chr img')).toBeVisible({ timeout: 15_000 });
          await page.waitForTimeout(400);
          for (const edge of ['left', 'right', 'top'] as const) {
            expect(
              await edgeStripArtDelta(page, '.fg__chr-clip', '.fg__chr img', edge),
              `showcase tab1 ${edge}`,
            ).toBeLessThanOrEqual(14);
          }
        });
      });
    }
  }

  // Final fix 4 art tip: tablet hero right fade needs a 4px fully-transparent tip (like the top edge) so the
  // 2px clip stays empty. Inject the pre-fix horizontal mask (ends at transparent 100%, no tip) to prove HEAD
  // would fail (luma >14), then assert the shipped CSS keeps the strip ≤14 for both art states.
  const HEAD_TABLET_HERO_H_MASK =
    'linear-gradient(90deg, transparent 0, transparent calc(0.16 * var(--W)), #000 calc(0.34 * var(--W)), #000 calc(100% - 0.12 * var(--W)), transparent 100%)';
  const TABLET_HERO_V_MASK =
    'linear-gradient(0deg, transparent 0, transparent var(--credit-gap), #000 calc(var(--credit-gap) + 110px), #000 calc(100% - 56px), transparent calc(100% - 4px), transparent 100%)';
  const headTabletHeroMaskCss = `@media (min-width: 734px) and (max-width: 1067.98px) {
    .char-stage--hero .char-stage__frame {
      -webkit-mask-image: ${HEAD_TABLET_HERO_H_MASK}, ${TABLET_HERO_V_MASK} !important;
      mask-image: ${HEAD_TABLET_HERO_H_MASK}, ${TABLET_HERO_V_MASK} !important;
    }
  }`;

  for (const dpr of [1, 1.5] as const) {
    for (const [width, height] of [[734, 1000], [768, 1024], [820, 1180]] as const) {
      test.describe(`tablet hero right ${width}x${height} @ DPR ${dpr}`, () => {
        test.use({ deviceScaleFactor: dpr });
        test('hero right edge is faded (Remielle + Eula); HEAD mask leaves art', async ({ page }) => {
          test.setTimeout(90_000);
          test.skip(!HERO_ART, 'needs both hero characters');
          await open(page, '/game/', width, height);
          await expect(page.locator('.char-stage--hero')).toHaveAttribute('data-phase', 'shown', { timeout: 5000 });
          await page.locator('.char-stage--hero .char-stage__img').evaluate(async (el: HTMLImageElement) => {
            if (!el.complete) await new Promise((resolve) => el.addEventListener('load', resolve, { once: true }));
          });
          await page.waitForTimeout(300);
          const clipSel = '.char-stage--hero .char-stage__clip';

          const headRemielle = await page.addStyleTag({ content: headTabletHeroMaskCss });
          expect(await edgeStripLuma(page, clipSel, 'right'), 'Remielle with HEAD mask').toBeGreaterThan(14);
          await headRemielle.evaluate((el) => (el as Element).remove());
          expect(await edgeStripLuma(page, clipSel, 'right'), 'Remielle').toBeLessThanOrEqual(14);

          await page.locator('.char-stage__swap button').nth(1).click();
          await expect(page.locator('.char-stage--hero')).toHaveAttribute('data-phase', 'shown', { timeout: 5000 });
          await expect
            .poll(() => page.locator('.char-stage--hero .char-stage__img').evaluate((img: HTMLImageElement) => img.currentSrc || img.src))
            .toContain('/eula.');
          await page.waitForTimeout(300);

          const headEula = await page.addStyleTag({ content: headTabletHeroMaskCss });
          expect(await edgeStripLuma(page, clipSel, 'right'), 'Eula with HEAD mask').toBeGreaterThan(14);
          await headEula.evaluate((el) => (el as Element).remove());
          expect(await edgeStripLuma(page, clipSel, 'right'), 'Eula').toBeLessThanOrEqual(14);
        });
      });
    }
  }
});

test.describe('item 1, img-box sanity: painted width matches the designed frame', () => {
  const VIEWPORTS = [
    [375, 812], [734, 1000], [768, 1024], [820, 1180], [900, 1200],
    [1024, 768], [1067, 900], [1068, 800], [1440, 900], [1920, 1080],
  ] as const;

  async function imgVsFrame(
    page: Page,
    frameSel: string,
    imgSel: string,
  ): Promise<{ imgW: number; designedW: number; imgCx: number; frameL: number; frameR: number }> {
    return page.evaluate(([fSel, iSel]) => {
      const frame = document.querySelector(fSel) as HTMLElement;
      const img = document.querySelector(iSel) as HTMLElement;
      const fr = frame.getBoundingClientRect();
      const ir = img.getBoundingClientRect();
      const w = window.innerWidth;
      let designedW = fr.width;
      // cqw uses the container's content box (= clientWidth), not the border-box from getBoundingClientRect.
      if (frame.classList.contains('char-stage__frame') && w >= 1068) {
        const stage = frame.closest('.char-stage') as HTMLElement;
        const cq = stage?.clientWidth ?? fr.width;
        if (frame.closest('.char-stage--hero')) {
          designedW = Math.min(w >= 1800 ? 960 : w >= 1600 ? 900 : 780, cq * 0.66);
        } else if (frame.closest('.char-stage--side')) {
          designedW = Math.min(w >= 1600 ? 600 : 520, cq * 0.42);
        }
      } else if (frame.classList.contains('char-stage__frame') && w >= 734) {
        const stage = frame.closest('.char-stage') as HTMLElement;
        const cq = stage?.clientWidth ?? fr.width;
        if (frame.closest('.char-stage--hero')) designedW = cq * 0.58;
        else if (frame.closest('.char-stage--side')) designedW = Math.min(520, cq * 0.42);
      } else if (frame.classList.contains('fg__chr') && w >= 1068) {
        const cq = (frame.closest('.fg') as HTMLElement)?.clientWidth ?? fr.width;
        designedW = Math.min(760, cq * 0.58);
      }
      // showcase <1068 and phones: designed = frame width
      return {
        imgW: ir.width,
        designedW,
        imgCx: ir.left + ir.width / 2,
        frameL: fr.left,
        frameR: fr.right,
      };
    }, [frameSel, imgSel] as const);
  }

  for (const [width, height] of VIEWPORTS) {
    test(`${width}x${height}: hero/side/showcase img width and centre`, async ({ page }) => {
      test.setTimeout(90_000);
      test.skip(!HERO_ART, 'needs both hero characters');
      await open(page, '/game/', width, height);
      await expect(page.locator('.char-stage--hero')).toHaveAttribute('data-phase', 'shown', { timeout: 5000 });
      const hero = await imgVsFrame(page, '.char-stage--hero .char-stage__frame', '.char-stage--hero .char-stage__img');
      expect(Math.abs(hero.imgW - hero.designedW), `hero imgW=${hero.imgW} designed=${hero.designedW}`).toBeLessThanOrEqual(1);
      expect(hero.imgCx, 'hero img centre inside frame').toBeGreaterThanOrEqual(hero.frameL - 0.5);
      expect(hero.imgCx, 'hero img centre inside frame').toBeLessThanOrEqual(hero.frameR + 0.5);

      if (width >= 734) {
        const sideFrame = page.locator('.char-stage--side .char-stage__frame');
        await sideFrame.evaluate((el) => {
          const r = el.getBoundingClientRect();
          window.scrollTo({ top: window.scrollY + r.top + r.height / 2 - window.innerHeight / 2, left: 0, behavior: 'instant' as ScrollBehavior });
        });
        await expect(page.locator('.char-stage--side')).toHaveAttribute('data-phase', 'shown', { timeout: 5000 });
        const side = await imgVsFrame(page, '.char-stage--side .char-stage__frame', '.char-stage--side .char-stage__img');
        expect(Math.abs(side.imgW - side.designedW), `side imgW=${side.imgW} designed=${side.designedW}`).toBeLessThanOrEqual(1);
        expect(side.imgCx).toBeGreaterThanOrEqual(side.frameL - 0.5);
        expect(side.imgCx).toBeLessThanOrEqual(side.frameR + 0.5);
      }

      await open(page, '/game/player-log/', width, height);
      await page.locator('section.fg').scrollIntoViewIfNeeded();
      await expect(page.locator('.fg__chr img')).toBeVisible({ timeout: 15_000 });
      for (const tab of [0, 1] as const) {
        if (tab === 1) {
          await page.locator('.fg__tab').nth(1).click();
          await expect(page.locator('.fg__chr img')).toBeVisible({ timeout: 15_000 });
          await page.waitForTimeout(300);
        }
        const fg = await imgVsFrame(page, '.fg__chr', '.fg__chr img');
        expect(Math.abs(fg.imgW - fg.designedW), `showcase tab${tab} @${width}: imgW=${fg.imgW} designed=${fg.designedW}`).toBeLessThanOrEqual(1);
        expect(fg.imgCx, `showcase tab${tab} centre`).toBeGreaterThanOrEqual(fg.frameL - 0.5);
        expect(fg.imgCx, `showcase tab${tab} centre`).toBeLessThanOrEqual(fg.frameR + 0.5);
        if (width === 768 || width === 1024) {
          // eslint-disable-next-line no-console
          console.log(`img-box showcase tab${tab} @${width}x${height}: imgW=${fg.imgW.toFixed(1)} designed=${fg.designedW.toFixed(1)} frame=${(fg.frameR - fg.frameL).toFixed(1)}`);
        }
      }
    });
  }
});

test.describe('item 1, composition: tablet showcase art fills the frame', () => {
  const SHOT_DIR = join(process.cwd(), '.superpowers', 'sdd', '2026-09-25-portfolio-site', 'r7-shots');

  async function paintedCoverage(page: Page): Promise<number> {
    const frame = page.locator('.fg__chr');
    await frame.evaluate((el) => {
      const r = el.getBoundingClientRect();
      window.scrollTo({ top: window.scrollY + r.top + r.height / 2 - window.innerHeight / 2, left: 0, behavior: 'instant' as ScrollBehavior });
    });
    await page.waitForTimeout(300);
    const box = await frame.boundingBox();
    expect(box, 'showcase frame box').toBeTruthy();
    const clip = { x: box!.x, y: box!.y, width: box!.width, height: box!.height };
    const shipped = await sharp(await page.screenshot({ clip, scale: 'css' })).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const hide = await page.addStyleTag({ content: '.fg__chr img { visibility: hidden !important; }' });
    const hidden = await sharp(await page.screenshot({ clip, scale: 'css' })).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    await hide.evaluate((el) => (el as Element).remove());
    const ch = 4;
    let painted = 0;
    const total = shipped.info.width * shipped.info.height;
    for (let i = 0; i < shipped.data.length; i += ch) {
      const d = Math.max(
        Math.abs(shipped.data[i]! - hidden.data[i]!),
        Math.abs(shipped.data[i + 1]! - hidden.data[i + 1]!),
        Math.abs(shipped.data[i + 2]! - hidden.data[i + 2]!),
      );
      // alpha ≥ 0.5 of full art vs background ≈ channel delta well above noise
      if (d >= 32) painted += 1;
    }
    return painted / total;
  }

  for (const [width, height] of [[768, 1024], [1024, 768]] as const) {
    test(`${width}x${height}: both tabs cover ≥35% and save shots`, async ({ page }) => {
      test.setTimeout(90_000);
      test.skip(!HERO_ART, 'needs character art');
      mkdirSync(SHOT_DIR, { recursive: true });
      await open(page, '/game/player-log/', width, height);
      await page.locator('section.fg').scrollIntoViewIfNeeded();
      await expect(page.locator('.fg__chr img')).toBeVisible({ timeout: 15_000 });
      await page.waitForTimeout(500);
      const cov0 = await paintedCoverage(page);
      expect(cov0, `tab0 coverage ${cov0}`).toBeGreaterThanOrEqual(0.35);
      await page.locator('.fg__chr').screenshot({ path: join(SHOT_DIR, `showcase-tab0-${width}x${height}.png`) });

      await page.locator('.fg__tab').nth(1).click();
      await expect(page.locator('.fg__chr img')).toBeVisible({ timeout: 15_000 });
      await page.waitForTimeout(500);
      const cov1 = await paintedCoverage(page);
      expect(cov1, `tab1 coverage ${cov1}`).toBeGreaterThanOrEqual(0.35);
      await page.locator('.fg__chr').screenshot({ path: join(SHOT_DIR, `showcase-tab1-${width}x${height}.png`) });
      // eslint-disable-next-line no-console
      console.log(`composition @${width}x${height}: tab0=${(cov0 * 100).toFixed(1)}% tab1=${(cov1 * 100).toFixed(1)}%`);
    });
  }
});

test.describe('item 1, geometry: img box and mask stops match HEAD where --oh = --overhang', () => {
  async function headHeroGeometry(page: Page, width: number): Promise<{
    img: Box;
    stops: { left32: number; left50: number; right82: number; right100: number };
    shift: number;
    overhang: number;
    oh: number;
  }> {
    return page.evaluate((w) => {
      const stage = document.querySelector('.char-stage--hero') as HTMLElement;
      const frame = document.querySelector('.char-stage--hero .char-stage__frame') as HTMLElement;
      const inner = stage.closest('.hero__inner') as HTMLElement;
      const ir = inner.getBoundingClientRect();
      const fr = frame.getBoundingClientRect();
      let designedW = ir.width;
      let top = 0;
      let designedOverhang = 0;
      if (w >= 1068) {
        designedOverhang = 60;
        designedW = Math.min(w >= 1800 ? 960 : w >= 1600 ? 900 : 780, ir.width * 0.66);
        top = 52;
      } else if (w >= 734) {
        designedOverhang = 32;
        designedW = ir.width * 0.58;
      } else {
        return {
          img: { x: fr.left, y: fr.top, width: fr.width, height: fr.height },
          stops: { left32: fr.left, left50: fr.left + fr.width / 2, right82: fr.right, right100: fr.right },
          shift: 0,
          overhang: 0,
          oh: 0,
        };
      }
      // Measure --oh from used frame width (custom props hold calc()/clamp() tokens).
      const oh = Math.max(0, fr.width - (designedW - designedOverhang));
      const right = ir.right + designedOverhang;
      const left = right - designedW;
      const height = ir.bottom - (ir.top + top);
      return {
        img: { x: left, y: ir.top + top, width: designedW, height },
        stops: {
          left32: left + designedW * 0.32,
          left50: left + designedW * 0.5,
          right82: left + designedW * 0.82,
          right100: left + designedW,
        },
        shift: designedOverhang - oh,
        overhang: designedOverhang,
        oh,
      };
    }, width);
  }

  async function actualGeometry(page: Page): Promise<{
    img: Box;
    stops: { left32: number; left50: number; right82: number; right100: number };
    shift: number;
  }> {
    return page.evaluate(() => {
      const img = document.querySelector('.char-stage--hero .char-stage__img') as HTMLElement;
      const frame = document.querySelector('.char-stage--hero .char-stage__frame') as HTMLElement;
      const ir = img.getBoundingClientRect();
      const fr = frame.getBoundingClientRect();
      const overhang = parseFloat(getComputedStyle(frame).getPropertyValue('--overhang')) || 0;
      const W = ir.width;
      const oh = Math.max(0, fr.width - (W - overhang));
      const left = fr.left;
      return {
        img: { x: ir.left, y: ir.top, width: ir.width, height: ir.height },
        stops: {
          left32: left + W * 0.32,
          left50: left + W * 0.5,
          right82: left + (fr.width - 0.18 * W),
          right100: fr.right,
        },
        shift: overhang - oh,
      };
    });
  }

  for (const [width, height] of [[1920, 1080], [2560, 1440]] as const) {
    test.describe(`${width}x${height} @ DPR 1.5`, () => {
      test.use({ deviceScaleFactor: 1.5 });
      test('hero img box and mask stops within 0.5px of HEAD', async ({ page }) => {
        test.skip(!HERO_ART, 'needs both hero characters');
        await open(page, '/game/', width, height);
        await expect(page.locator('.char-stage--hero')).toHaveAttribute('data-phase', 'shown', { timeout: 5000 });
        const expected = await headHeroGeometry(page, width);
        const actual = await actualGeometry(page);
        expect(expected.oh, 'oh equals overhang at wide width').toBeCloseTo(expected.overhang, 1);
        expect(Math.abs(actual.img.x - expected.img.x), 'img.x').toBeLessThanOrEqual(0.5);
        expect(Math.abs(actual.img.y - expected.img.y), 'img.y').toBeLessThanOrEqual(0.5);
        expect(Math.abs(actual.img.width - expected.img.width), 'img.width').toBeLessThanOrEqual(0.5);
        expect(Math.abs(actual.img.height - expected.img.height), 'img.height').toBeLessThanOrEqual(0.5);
        expect(Math.abs(actual.stops.left32 - expected.stops.left32), 'stop 32%').toBeLessThanOrEqual(0.5);
        expect(Math.abs(actual.stops.left50 - expected.stops.left50), 'stop 50%').toBeLessThanOrEqual(0.5);
        expect(Math.abs(actual.stops.right82 - expected.stops.right82), 'stop 82%').toBeLessThanOrEqual(0.5);
        expect(Math.abs(actual.stops.right100 - expected.stops.right100), 'stop 100%').toBeLessThanOrEqual(0.5);
      });
    });
  }

  for (const width of [1068, 1152, 1200, 1280, 1366] as const) {
    const height = width === 1068 ? 800 : width === 1152 ? 864 : width === 1200 ? 800 : width === 1280 ? 720 : 768;
    test(`${width}x${height}: report right-fade shift (overhang − oh)`, async ({ page }) => {
      test.skip(!HERO_ART, 'needs both hero characters');
      await open(page, '/game/', width, height);
      await expect(page.locator('.char-stage--hero')).toHaveAttribute('data-phase', 'shown', { timeout: 5000 });
      const expected = await headHeroGeometry(page, width);
      const actual = await actualGeometry(page);
      expect(actual.shift, `shift at ${width}`).toBeCloseTo(expected.shift, 1);
      // eslint-disable-next-line no-console
      console.log(`geometry shift @${width}: overhang-oh=${actual.shift.toFixed(2)} (oh=${expected.oh.toFixed(2)})`);
      expect(Math.abs(actual.img.x - expected.img.x), 'img.x (left edge preserved)').toBeLessThanOrEqual(0.5);
      expect(Math.abs(actual.img.width - expected.img.width), 'img.width = designed W').toBeLessThanOrEqual(0.5);
    });
  }
});

test.describe('item 1, no art under copy', () => {
  async function maxArtAtLineCentres(page: Page, sels: string[]): Promise<number> {
    // Sample each line-box centre (not the full copy column, which reaches into the left fade).
    const points = await page.evaluate((selectors) => {
      const pts: { x: number; y: number }[] = [];
      for (const sel of selectors) {
        for (const el of document.querySelectorAll(sel)) {
          for (const r of el.getClientRects()) {
            if (r.width < 4 || r.height < 4) continue;
            pts.push({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
          }
        }
      }
      return pts;
    }, sels);
    let worst = 0;
    for (const p of points) {
      const clip = { x: Math.max(0, p.x - 1), y: Math.max(0, p.y - 1), width: 3, height: 3 };
      const raw = async () => {
        const { data } = await sharp(await page.screenshot({ clip, scale: 'css' }))
          .removeAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
        return data as Buffer;
      };
      const withArt = await raw();
      const hide = await page.addStyleTag({ content: '.char-stage__img { visibility: hidden !important; }' });
      const without = await raw();
      await hide.evaluate((el) => (el as Element).remove());
      for (let i = 0; i < withArt.length; i += 3) {
        const d = Math.max(
          Math.abs(withArt[i]! - without[i]!),
          Math.abs(withArt[i + 1]! - without[i + 1]!),
          Math.abs(withArt[i + 2]! - without[i + 2]!),
        );
        if (d > worst) worst = d;
      }
    }
    return worst;
  }

  for (const lang of ['/game/', '/en/game/'] as const) {
    for (const width of [1068, 1100, 1200] as const) {
      test(`${lang === '/game/' ? 'ko' : 'en'} ${width}px: no painted art inside copy/title/card`, async ({ page }) => {
        test.skip(!HERO_ART, 'needs both hero characters');
        await open(page, lang, width, 800);
        await expect(page.locator('.char-stage--hero')).toHaveAttribute('data-phase', 'shown', { timeout: 5000 });
        const sels = ['.hero__name', '.hero__slogan', '.hero__meta'];
        // .hero__pcard can sit near the left fade at the tightest desktop width; name/slogan/meta must stay clear.
        expect(await maxArtAtLineCentres(page, sels), 'Remielle').toBeLessThanOrEqual(8);
        await page.locator('.char-stage__swap button').nth(1).click();
        await expect(page.locator('.char-stage--hero')).toHaveAttribute('data-phase', 'shown', { timeout: 5000 });
        expect(await maxArtAtLineCentres(page, sels), 'Eula').toBeLessThanOrEqual(8);
      });
    }
  }
});

test.describe('item 2: character images are served at the width they are painted', () => {
  for (const [width, height, dpr] of [[1440, 900, 1], [2560, 1440, 1.5]] as const) {
    test.describe(`${width}px at DPR ${dpr}`, () => {
      test.use({ deviceScaleFactor: dpr });
      test('hero, favorite tiles and showcase: the served file covers the painted width (or is the largest there is)', async ({ page }) => {
        test.skip(!HERO_ART, 'needs character art');
        const imgs: [string, Locator][] = [];
        await open(page, '/game/', width, height);
        imgs.push(['hero', page.locator('.char-stage--hero .char-stage__img')]);
        const check = async (): Promise<void> => {
          for (const [name, img] of imgs) {
            const { served, largest, painted, widths } = await servedVsPainted(img);
            const need = 0.95 * painted * dpr;
            // the smallest file that covers the painted width, or the largest there is: sharp, and not a step too big
            // (round 2 item 4: 1210px sat just above the 1200w step, so DPR-1 laptops fetched the 1600w hero)
            const ideal = Math.min(...widths.filter((w) => w >= need), largest);
            expect(served, `${name}: ${served}w file for ${Math.round(painted * dpr)} device px`).toBe(ideal);
          }
          imgs.length = 0;
        };
        await check();
        await open(page, '/game/player-log/', width, height);
        for (const tile of await page.locator('.fav-tile img').all()) imgs.push(['tile', tile]);
        await page.locator('section.fg').scrollIntoViewIfNeeded();
        await expect(page.locator('.fg__chr img')).toBeVisible();
        imgs.push(['showcase', page.locator('.fg__chr img')]);
        await check();
      });
    });
  }
});

test('item 3: the English hero controls stay inside the gutters on a phone, and wrapped rows keep 44px targets', async ({ page }) => {
  test.skip(!HERO_ART, 'needs both hero characters');
  await open(page, '/en/game/', 375, 812);
  const controls = await box(page.locator('.char-stage__controls'));
  expect(controls.x).toBeGreaterThanOrEqual(16 - 0.5);
  expect(controls.x + controls.width).toBeLessThanOrEqual(375 - 16 + 0.5);
  for (const button of await page.locator('.char-stage__controls button').all()) {
    expect(await hitArea(button, 21, 0), `${await button.textContent()}: 44px tall target`).toBe(true);
  }
});

test('item 4: on /stats/ the light band runs down to the footer (no dark strip between)', async ({ page }) => {
  // 1280×500: footer starts below the fold whether or not GoatCounter charts are present (CI has real data).
  // 2560×1440: short empty-stats pages keep the footer in view — both must sample after scroll.
  for (const [width, height] of [
    [1280, 500],
    [2560, 1440],
  ] as const) {
    await open(page, '/stats/', width, height);
    const footerEl = page.locator('.nt-footer'); // P1-10: /stats/ is a neutral page (was .site-footer)
    await footerEl.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    const footer = await box(footerEl);
    expect(footer.y - 6, `${width}×${height}: sample y in viewport after scroll`).toBeGreaterThanOrEqual(0);
    const png = await page.screenshot({
      clip: { x: 40, y: footer.y - 6, width: 1, height: 1 },
      scale: 'css',
    });
    const { data } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    expect([...data.subarray(0, 3)], `${width}×${height}: just above the footer: --read-bg #F4F5F7`).toEqual([
      0xf4, 0xf5, 0xf7,
    ]);
  }
});

test.describe('item 5 and round 2 item 2: a row of cartridges ends at one height, with its titles on one line', () => {
  for (const [route, width] of [['/game/', 1440], ['/game/', 2560], ['/game/projects/', 1440], ['/game/projects/', 2560], ['/en/game/projects/', 1920]] as const) {
    test(`${route} ${width}px`, async ({ page }) => {
      await open(page, route, width);
      const cards = await Promise.all((await page.locator('.cart-grid > .cart:not([hidden])').all()).map(async (card) => ({ card, b: await box(card) })));
      const rows = new Map<number, Box[]>();
      for (const { b } of cards) rows.set(Math.round(b.y), [...(rows.get(Math.round(b.y)) ?? []), b]);
      for (const [y, row] of rows) {
        const heights = row.map((b) => b.height);
        expect(Math.max(...heights) - Math.min(...heights), `row at y ${y}: ${heights.map(Math.round).join('/')}`).toBeLessThanOrEqual(1);
      }
      const spread = (values: number[]): number => Math.max(...values) - Math.min(...values);
      const byRow = new Map<number, { title: Box; meta: Box; tags: Box | null; label: Box }[]>();
      for (const { card, b } of cards) {
        const tags = card.locator('.cart__tags');
        const entry = {
          title: await box(card.locator('.cart__title')),
          meta: await box(card.locator('.cart__meta')),
          tags: (await tags.count()) ? await box(tags) : null,
          label: await box(card.locator('.cart__label')),
        };
        byRow.set(Math.round(b.y), [...(byRow.get(Math.round(b.y)) ?? []), entry]);
      }
      for (const [y, row] of byRow) {
        expect(spread(row.map((c) => c.title.y)), `row at y ${y}: title tops`).toBeLessThanOrEqual(2);
        expect(spread(row.map((c) => c.meta.y)), `row at y ${y}: meta tops`).toBeLessThanOrEqual(2);
        const tagBottoms = row.flatMap((c) => (c.tags ? [c.tags.y + c.tags.height] : []));
        if (tagBottoms.length > 1) expect(spread(tagBottoms), `row at y ${y}: the tags close every label at one height`).toBeLessThanOrEqual(2);
        for (const c of row) if (c.tags) expect(c.label.y + c.label.height - (c.tags.y + c.tags.height), 'tags at the label\'s foot').toBeLessThanOrEqual(14);
      }
    });
  }
});

test('item 6: /records/ head: the tagline follows the status line, no empty band beside the photo', async ({ page }) => {
  for (const route of ['/game/records/', '/en/game/records/']) {
    await open(page, route, 1440);
    const status = await box(page.locator('.rhead__status'));
    const tagline = await box(page.locator('.rhead__tagline'));
    expect(tagline.y - (status.y + status.height), route).toBeLessThan(40);
  }
});

test('item 7: job-fit table at 1440px: compact rows, evidence on the requirement\'s line, counts one per line', async ({ page }) => {
  await open(page, '/game/records/', 1440);
  const row = page.locator('.jobfit__row[data-row="python-ml"]');
  expect((await box(row)).height, 'the four-link row').toBeLessThan(130);
  for (const r of await page.locator('.jobfit__row').all()) {
    const [req, first] = await Promise.all([
      r.locator('.jobfit__req').evaluate((el) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        const line = range.getClientRects()[0];
        return line ? line.top + line.height / 2 : 0;
      }),
      r.locator('.jobfit__ev-short, .jobfit__ev, .jobfit__none').first().evaluate((el) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        const line = range.getClientRects()[0];
        return line ? line.top + line.height / 2 : 0;
      }),
    ]);
    expect(Math.abs(req - first), `${await r.getAttribute('data-row')}: first evidence on the requirement's first line`).toBeLessThanOrEqual(4);
  }
  const parts = await row.locator('.jobfit__freq-part').all();
  expect(parts).toHaveLength(2);
  const [a, b] = await Promise.all(parts.map(box));
  expect(b.y, 'the second count on its own line').toBeGreaterThan(a.y + a.height - 1);
  await expect(row.locator('.jobfit__freq-sep')).toHaveCSS('position', 'absolute'); // the dot is for screen readers only
});

test.describe('item 8: Player Log', () => {
  test('1440px: a 520px showcase with the tabs in a row and no half-empty panel; tile captions on one line', async ({ page }) => {
    test.skip(!HERO_ART, 'needs character art');
    for (const route of ['/game/player-log/', '/en/game/player-log/']) {
      await open(page, route, 1440);
      await page.locator('section.fg').scrollIntoViewIfNeeded();
      await expect(page.locator('.fg__scene .fg__copy')).toBeVisible();
      const fg = await box(page.locator('section.fg'));
      expect(fg.height, route).toBeCloseTo(520, 0);
      const tabs = await Promise.all((await page.locator('.fg__tab').all()).map(box));
      expect(new Set(tabs.map((t) => Math.round(t.y))).size, 'tabs in one row').toBe(1);
      const copy = await box(page.locator('.fg__scene .fg__copy'));
      const credit = await box(page.locator('.fg__credit'));
      const gap = credit.y - (copy.y + copy.height);
      expect(gap, `${route}: copy clear of the credit`).toBeGreaterThan(16);
      expect(gap, `${route}: no empty half under the copy`).toBeLessThan(130);
      for (const kicker of await page.locator('.fav-tile__kicker').all()) {
        const lineHeight = await kicker.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight));
        expect((await box(kicker)).height, `${await kicker.textContent()}`).toBeLessThan(lineHeight * 1.5);
      }
    }
  });

  test('375px: the membership sticker stays on the photo, clear of the barcode band and the fields', async ({ page }) => {
    await open(page, '/game/player-log/', 375, 812);
    const sticker = await box(page.locator('.mcard__sticker'));
    const band = await box(page.locator('.mcard__band'));
    expect(sticker.y + sticker.height).toBeLessThan(band.y);
    for (const dd of await page.locator('.mcard__field dd').all()) {
      const text = await dd.evaluate((el) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        const r = range.getBoundingClientRect();
        return { x: r.left, y: r.top, width: r.width, height: r.height };
      });
      const overlaps = text.x < sticker.x + sticker.width && sticker.x < text.x + text.width && text.y < sticker.y + sticker.height && sticker.y < text.y + text.height;
      expect(overlaps, `${await dd.textContent()}`).toBe(false);
    }
  });
});

test.describe('item 9: the hero credit', () => {
  test('375px: right under the art it credits, before the player card', async ({ page }) => {
    test.skip(!HERO_ART, 'needs character art');
    await open(page, '/game/', 375, 812);
    const stage = await box(page.locator('.char-stage--hero'));
    const credit = await box(page.locator('.hero__credit'));
    const card = await box(page.locator('.hero__pcard'));
    expect(credit.y).toBeGreaterThanOrEqual(stage.y + stage.height - 1);
    expect(credit.y + credit.height).toBeLessThanOrEqual(card.y + 1);
  });

  for (const width of [1068, 1440, 2560]) {
    test(`${width}px: lines break only between its pieces, never inside one`, async ({ page }) => {
      test.skip(!HERO_ART, 'needs character art');
      for (const route of ['/game/', '/en/game/']) {
        await open(page, route, width);
        for (const part of await page.locator('.hero__credit-part').all()) {
          expect(await part.evaluate((el) => el.getClientRects().length === 1 && el.getBoundingClientRect().height < 25), `${route} "${await part.textContent()}"`).toBe(true);
        }
      }
    });
  }
});

test('item 10: choosing Eula in the hero moves Remielle to the MAIN MENU, and back', async ({ page }) => {
  test.skip(!HERO_ART, 'needs both hero characters');
  await open(page, '/game/', 1440, 1100);
  const side = page.locator('.char-stage--side .char-stage__img');
  const sideSrc = (): Promise<string> => side.evaluate((img: HTMLImageElement) => img.currentSrc || img.src);
  await page.locator('.char-stage--side').scrollIntoViewIfNeeded();
  await expect.poll(sideSrc).toContain('/eula.');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole('button', { name: /유라/ }).click();
  await expect.poll(sideSrc, { timeout: 5000 }).toContain('/remielle.');
  await expect.poll(() => page.locator('.char-stage--hero .char-stage__img').evaluate((img: HTMLImageElement) => img.currentSrc || img.src)).toContain('/eula.');
  await page.getByRole('button', { name: /레미엘/ }).click();
  await expect.poll(sideSrc, { timeout: 5000 }).toContain('/eula.');
});

test('item 11: the English hero does not repeat the name above the H1', async ({ page }) => {
  await open(page, '/en/game/', 1440);
  await expect(page.locator('.hero__titlecard')).toHaveCount(0);
  await expect(page.locator('h1')).toHaveText('Seongeun Baek');
  await open(page, '/game/', 1440);
  await expect(page.locator('.hero__titlecard')).toHaveText('SEONGEUN BAEK'); // the Korean page keeps the romanization
});

test('item 13: the largest first-screen image of each page loads eagerly; the rest stay lazy', async ({ page }) => {
  await page.goto('/game/player-log/');
  const tiles = page.locator('.fav-tile img');
  for (const tile of await tiles.all()) await expect(tile).toHaveAttribute('loading', 'eager'); // the phone LCP
  await expect(tiles.first()).toHaveAttribute('fetchpriority', 'high');
  await page.goto('/game/research/');
  const figures = page.locator('img.interests__img');
  await expect(figures.first()).toHaveAttribute('loading', 'eager'); // the desktop LCP (1440x900, 2560x1440)
  for (const img of (await figures.all()).slice(1)) await expect(img).toHaveAttribute('loading', 'lazy');
  await page.goto('/game/');
  const carts = page.locator('#featured-projects img.cart__img');
  await expect(carts.first()).toHaveAttribute('loading', 'eager'); // the LCP at 2560x1440
  await expect(carts.first()).toHaveAttribute('fetchpriority', 'low'); // far below the fold on phones
  for (const img of (await carts.all()).slice(1)) await expect(img).toHaveAttribute('loading', 'lazy');
});

test('item 16, round 2 item 3: the /records/ jump links keep equal gaps and 44px targets', async ({ page }) => {
  for (const width of [375, 1440]) {
    await open(page, '/game/records/', width, 900);
    const links = await page.locator('.rnav__link').all();
    const texts = await Promise.all(
      links.map((link) =>
        link.evaluate((el) => {
          const range = document.createRange();
          range.selectNodeContents(el);
          const r = range.getBoundingClientRect();
          return { left: r.left, right: r.right, top: Math.round(r.top) };
        }),
      ),
    );
    const gaps = texts.slice(1).flatMap((t, i) => (t.top === texts[i]!.top ? [t.left - texts[i]!.right] : []));
    expect(Math.max(...gaps) - Math.min(...gaps), `${width}px gaps ${gaps.map(Math.round).join('/')}`).toBeLessThanOrEqual(1);
    for (const link of links) expect(await hitArea(link, 21, 21), `${width}px ${await link.textContent()}`).toBe(true);
  }
});

test.describe('item 16: standalone links get 44px targets on phones', () => {
  const TARGETS: [string, string][] = [
    ['/game/', '.pn__link'],
    ['/game/records/', '.psum__title a'],
    ['/game/records/', '.rnav__link'],
    ['/game/research/', '.progress-list__name a'],
    ['/credits/', '.legal td > a'],
    ['/privacy/', '.legal p > a[href^="mailto:"]'],
    ['/game/projects/', '.gh__name'],
  ];
  for (const [route, selector] of TARGETS) {
    test(`${route} ${selector}`, async ({ page }) => {
      await open(page, route, 375, 812);
      const links = await page.locator(selector).all();
      test.skip(links.length === 0, 'not in this build (e.g. no GitHub data)');
      for (const link of links) expect(await hitArea(link, 21, 21), `${await link.textContent()}`).toBe(true);
    });
  }
});

test('item 18: in forced colours (dark and light themes) the AUC chart and label text stays readable on the chart', async ({ page }) => {
  // Chromium's emulated forced colours follow the colour scheme: a dark scheme gives a black Canvas, where the author
  // fills (#1D1D1F text) had all but vanished.
  for (const [route, width, colorScheme] of [['/game/research/', 1440, 'dark'], ['/game/', 1440, 'dark'], ['/game/', 375, 'dark'], ['/game/', 1440, 'light']] as const) {
    await page.emulateMedia({ forcedColors: 'active', colorScheme, reducedMotion: 'reduce' });
    await page.setViewportSize({ width, height: 900 });
    await page.goto(route, { waitUntil: 'networkidle' });
    const ratios = await page.evaluate(() => {
      const rgb = (c: string): number[] => (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
      const lum = ([r, g, b]: number[]): number => {
        const f = (v: number): number => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      const bgOf = (el: Element): string => {
        for (let p: Element | null = el; p; p = p.parentElement) {
          const c = getComputedStyle(p).backgroundColor;
          if (c && !/rgba\([^)]*,\s*0\)|transparent/.test(c)) return c;
        }
        return getComputedStyle(document.body).backgroundColor;
      };
      const out: { text: string; ratio: number }[] = [];
      for (const t of Array.from(document.querySelectorAll('.chart__label, .chart__value, .chart__tick, .auc-label__name, .auc-label__value, .auc-label__tick'))) {
        const r = t.getBoundingClientRect();
        if (r.width === 0 || getComputedStyle(t.closest('svg') as Element).display === 'none') continue;
        const [a, b] = [lum(rgb(getComputedStyle(t).fill)), lum(rgb(bgOf(t)))];
        out.push({ text: t.textContent ?? '', ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) });
      }
      return out;
    });
    expect(ratios.length, `${route} ${width}px: chart text found`).toBeGreaterThan(3);
    const low = ratios.filter((r) => r.ratio < 4.5).map((r) => `${r.text} ${r.ratio.toFixed(2)}`);
    expect(low, `${route} ${width}px ${colorScheme}`).toEqual([]);
  }
});

test('item 19: prose tables break English words only at spaces at 320px, and never widen the page', async ({ page }) => {
  await open(page, '/en/game/projects/youth-startup-location/', 320, 640);
  const cellHyphens = await page.locator('.prose td').first().evaluate((el) => getComputedStyle(el).hyphens);
  expect(cellHyphens, 'prose td must not use hyphens: auto (Linux Chromium would split syllables)').toBe('manual');
  const split = await page.evaluate(() => {
    const found: string[] = [];
    for (const cell of Array.from(document.querySelectorAll('.prose td, .prose th'))) {
      const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node.textContent ?? '';
        for (const m of text.matchAll(/[^\s-]+/g)) {
          const range = document.createRange();
          range.setStart(node, m.index ?? 0);
          range.setEnd(node, (m.index ?? 0) + m[0].length);
          const lines = new Set(Array.from(range.getClientRects()).map((r) => Math.round(r.top)));
          if (lines.size > 1) found.push(m[0]);
        }
      }
    }
    return found;
  });
  expect(split, 'words split across lines').toEqual([]);
  const overflow = await horizontalOverflow(page);
  expect(overflow.scrollWidth, overflow.offenders.join(', ')).toBeLessThanOrEqual(overflow.width);
  for (const tableBox of await page.locator('.prose-table').all()) {
    const overflows = await tableBox.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
    if (overflows) {
      await expect(tableBox).toHaveAttribute('tabindex', '0');
      await expect(tableBox).toHaveAttribute('role', 'region');
      await expect(tableBox).toHaveAttribute('aria-labelledby', /.+/);
    } else {
      await expect(tableBox).not.toHaveAttribute('tabindex');
    }
  }
});
