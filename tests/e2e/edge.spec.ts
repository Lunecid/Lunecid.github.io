// GP-6 (game palette v3): the fixed edge frame — pre-rendered yellow brush strokes and cyan line-art in the gutters —
// never touches text or controls, follows its width tiers, loads only the files its tier shows, sits under the nav,
// toast, menu and viewer, disappears in print and forced colours, and is never the LCP element.
import sharp from 'sharp';
import { test, expect, settle } from './helpers';
import { visibleTextBoxes, type TextBox } from '../helpers/text-boxes';
import type { Page } from '@playwright/test';

const ROUTES = ['/game/', '/game/records/', '/game/projects/school-zone-blindspots/', '/game/player-log/', '/en/game/'];
const WIDTHS = [375, 800, 1260, 1280, 1440, 1920];
const CLEARANCE = 8;
/** A control's box is its 44 px hit area, padded past its text; the prototype's rule for it is "no paint within 2 px". */
const CONTROL_CLEARANCE = 2;

type Rect = [number, number, number, number];
const near = (a: Rect, b: Rect, m: number) => a[0] < b[2] + m && b[0] < a[2] + m && a[1] < b[3] + m && b[1] < a[3] + m;

/** The painted part of the edge layer alone (everything else hidden, black ground), as raw RGB. */
async function paintOnly(page: Page) {
  await page.evaluate(() => {
    for (const el of Array.from(document.body.children)) if (!el.classList.contains('edge')) (el as HTMLElement).style.setProperty('visibility', 'hidden', 'important');
    document.documentElement.style.setProperty('background', '#000', 'important');
    document.body.style.setProperty('background', '#000', 'important');
  });
  const shot = await sharp(await page.screenshot()).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  await page.evaluate(() => {
    for (const el of Array.from(document.body.children)) (el as HTMLElement).style.removeProperty('visibility');
    document.documentElement.style.removeProperty('background');
    document.body.style.removeProperty('background');
  });
  return shot;
}

test.describe('GP-6: edge frame', () => {
  test.describe.configure({ timeout: 240_000 });

  for (const route of ROUTES) {
    test(`GP-6: no text, link or control box intersects a painted edge box at any scroll position (step 400 px), clearance ≥ 8 px from text, ≥ 2 px from a control's hit box — ${route}`, async ({ page }) => {
      const problems: string[] = [];
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: width === 375 ? 812 : 800 });
        await page.goto(route, { waitUntil: 'networkidle' });
        await settle(page);
        const height = await page.evaluate(() => document.documentElement.scrollHeight);
        for (let y = 0; y < height; y += 400) {
          await page.evaluate((top) => window.scrollTo(0, top), y);
          const paint = await page.evaluate(() =>
            Array.from(document.querySelector('.edge')!.children).map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0).map((r) => [r.left, r.top, r.right, r.bottom]));
          const boxes = await page.evaluate(visibleTextBoxes, '.edge');
          const candidates = (boxes as TextBox[]).filter((t) => (paint as Rect[]).some((p) => near(t.slice(0, 4) as Rect, p, CLEARANCE)));
          if (!candidates.length) continue;
          const shot = await paintOnly(page);
          const { width: W, height: H, channels } = shot.info;
          for (const t of candidates) {
            const m = t[4].startsWith('<') ? CONTROL_CLEARANCE : CLEARANCE;
            const x0 = Math.max(0, Math.floor(t[0] - m)), x1 = Math.min(W, Math.ceil(t[2] + m));
            const y0 = Math.max(0, Math.floor(t[1] - m)), y1 = Math.min(H, Math.ceil(t[3] + m));
            let hit = false;
            for (let yy = y0; yy < y1 && !hit; yy++) for (let xx = x0; xx < x1; xx++) {
              const i = (yy * W + xx) * channels;
              if (shot.data[i]! > 40 || shot.data[i + 1]! > 40 || shot.data[i + 2]! > 40) { hit = true; break; }
            }
            if (hit) problems.push(`${width} y=${y} "${t[4]}" [${t.slice(0, 4).map((v) => Math.round(v as number)).join(',')}]`);
          }
        }
      }
      expect(problems.slice(0, 12)).toEqual([]);
    });
  }

  test('GP-6: tiers — 375 shows only edge__s, 800 adds the rail, 1280 shows the full set', async ({ page }) => {
    const shown = async (width: number) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/game/', { waitUntil: 'load' });
      return page.evaluate(() => Array.from(document.querySelectorAll('.edge > *')).filter((e) => getComputedStyle(e).display !== 'none').map((e) => e.getAttribute('class')).sort());
    };
    expect(await shown(375)).toEqual(['edge__s']);
    expect(await shown(800)).toEqual(['edge__rail', 'edge__s']);
    expect(await shown(1280)).toEqual(['edge__br', 'edge__brk', 'edge__ckt', 'edge__l', 'edge__rail', 'edge__tr']);
    const layer = await page.locator('.edge').evaluate((el) => {
      const s = getComputedStyle(el);
      return { position: s.position, z: s.zIndex, pe: s.pointerEvents, hidden: el.getAttribute('aria-hidden'), anims: el.getAnimations({ subtree: true }).length };
    });
    expect(layer).toEqual({ position: 'fixed', z: '40', pe: 'none', hidden: 'true', anims: 0 });
  });

  test('GP-6: at 375 the page requests only edge-s; at 1280 1× DPR requests the full tier\'s three 1× files (edge-s is hidden there)', async ({ browser }) => {
    const requested = async (width: number) => {
      const context = await browser.newContext({ viewport: { width, height: 800 }, deviceScaleFactor: 1 });
      const page = await context.newPage();
      const files: string[] = [];
      page.on('request', (r) => { const m = /\/_astro\/(edge-[a-z]+(?:-2x)?)\.[\w-]+\.webp/.exec(r.url()); if (m) files.push(m[1]!); });
      await page.goto('/game/', { waitUntil: 'networkidle' });
      await context.close();
      return files.sort();
    };
    expect(await requested(375)).toEqual(['edge-s']);
    expect(await requested(1280)).toEqual(['edge-br', 'edge-l', 'edge-tr']);
  });

  test('GP-6: the nav, the achievement toast, the phone menu panel and the image viewer paint above the layer', async ({ page }) => {
    // the nav at the left edge, where the rail starts below it
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/game/', { waitUntil: 'load' });
    const z = (sel: string) => page.locator(sel).first().evaluate((el) => Number(getComputedStyle(el).zIndex));
    expect(await z('.hud-nav')).toBeGreaterThan(40);
    expect(await z('.ach-toast-region')).toBeGreaterThan(40);
    expect(await z('.edge')).toBe(40);
    // the phone menu panel lives inside the nav (z 50), so it covers the sliver
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/game/', { waitUntil: 'load' });
    await settle(page);
    await page.locator('button[aria-controls="hud-menu"]').click();
    const panel = page.locator('#hud-menu');
    await expect(panel).toBeVisible();
    const box = (await panel.boundingBox())!;
    const over = await page.evaluate(([x, y]) => document.elementFromPoint(x!, y!)?.closest('.edge') ? 'edge' : 'menu', [2, box.y + box.height - 4]);
    expect(over).toBe('menu');
    // the image viewer is a top-layer dialog
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/game/records/', { waitUntil: 'networkidle' });
    await settle(page);
    await page.locator('#awards a[data-cert-id]').first().click();
    const dialog = page.locator('dialog.image-viewer[open]');
    await expect(dialog).toBeVisible();
    expect(await page.evaluate(() => document.elementFromPoint(4, innerHeight - 4)?.closest('.edge') ? 'edge' : 'viewer')).toBe('viewer');
  });

  test('GP-6: print and forced-colors hide the layer', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/game/', { waitUntil: 'load' });
    await page.emulateMedia({ media: 'print' });
    expect(await page.locator('.edge').evaluate((el) => getComputedStyle(el).display)).toBe('none');
    await page.emulateMedia({ media: 'screen', forcedColors: 'active' });
    expect(await page.locator('.edge').evaluate((el) => getComputedStyle(el).display)).toBe('none');
    await page.emulateMedia({ media: 'screen', forcedColors: 'none' });
    expect(await page.locator('.edge').evaluate((el) => getComputedStyle(el).display)).toBe('block');
  });

  test('GP-6: the LCP element of /game/ is not inside .edge', async ({ page }) => {
    for (const width of [375, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/game/', { waitUntil: 'networkidle' });
      const lcp = await page.evaluate(() => new Promise<string>((resolve) => {
        new PerformanceObserver((list) => {
          const entries = list.getEntries() as (PerformanceEntry & { element?: Element | null })[];
          const last = entries[entries.length - 1];
          resolve(last?.element ? (last.element.closest('.edge') ? 'edge' : last.element.className || last.element.tagName) : 'none');
        }).observe({ type: 'largest-contentful-paint', buffered: true });
      }));
      expect(lcp, `${width}`).not.toBe('edge');
      expect(lcp, `${width}`).not.toBe('none');
    }
  });
});
