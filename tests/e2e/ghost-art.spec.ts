// Ghost watermark in the side margins of light bands on wide screens (≥1600px).
// Below that breakpoint the CSS background is not applied, so the image must never be requested.
import AxeBuilder from '@axe-core/playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { test, expect, settle, gamePath } from './helpers';

const GHOST_ASSET = join(process.cwd(), 'src/assets/ghost/miku-v6.webp');
const SHOT_DIR = join(process.cwd(), '.superpowers/sdd/2026-09-25-portfolio-site/miku-ghost-shots');
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/** One ghost per page: selector of the host band and expected side. */
const PLACEMENTS = [
  { route: gamePath('/'), band: '#hello', side: 'right' as const, shot: 'game-home' },
  { route: gamePath('/research/'), band: '#publications', side: 'left' as const, shot: 'game-research' },
  { route: gamePath('/records/'), band: '#profile', side: 'right' as const, shot: 'game-records' },
  { route: gamePath('/projects/'), band: '#github', side: 'left' as const, shot: 'game-projects' },
] as const;

const WIDE = [
  { width: 2560, height: 1440, dpr: 1.5 },
  { width: 1920, height: 1080, dpr: 1 },
  { width: 1800, height: 1000, dpr: 1 },
  { width: 1600, height: 900, dpr: 1.25 },
] as const;

const NARROW = [
  { width: 1599, height: 900, dpr: 1 },
  { width: 1440, height: 900, dpr: 1 },
  { width: 375, height: 812, dpr: 1 },
] as const;

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

async function boxOf(locator: Locator): Promise<Box | null> {
  return locator.boundingBox();
}

async function open(page: Page, route: string, width: number, height: number, dpr: number): Promise<void> {
  await page.setViewportSize({ width, height });
  // deviceScaleFactor is set via browser context in the describe loops below when needed
  void dpr;
  await page.goto(route, { waitUntil: 'networkidle' });
  await settle(page);
}

test.describe('ghost art (Hatsune Miku watermark)', () => {
  test.skip(!existsSync(GHOST_ASSET), 'src/assets/ghost/miku-v6.webp not present');

  for (const vp of WIDE) {
    test.describe(`${vp.width}x${vp.height} @ ${vp.dpr}`, () => {
      test.use({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.dpr });

      for (const place of PLACEMENTS) {
        test(`${place.route} ghost is outside text/interactive boxes, opacity ≤ 0.1, side=${place.side}`, async ({ page }) => {
          await open(page, place.route, vp.width, vp.height, vp.dpr);
          const band = page.locator(place.band);
          await expect(band).toBeVisible();
          const ghost = band.locator(`[data-ghost-art="${place.side}"]`);
          await expect(ghost).toHaveCount(1);
          await ghost.scrollIntoViewIfNeeded();

          const gBox = await boxOf(ghost);
          expect(gBox, 'ghost has a layout box').toBeTruthy();
          const ghostBox = gBox as Box;

          const opacity = await ghost.evaluate((el) => parseFloat(getComputedStyle(el).opacity));
          expect(opacity).toBeGreaterThan(0);
          expect(opacity).toBeLessThanOrEqual(0.1);

          const display = await ghost.evaluate((el) => getComputedStyle(el).display);
          expect(display).not.toBe('none');

          if (place.side === 'right') {
            const sx = await ghost.evaluate((el) => getComputedStyle(el).transform);
            // scaleX(-1) → matrix(-1, 0, 0, 1, …) or matrix3d(-1, …)
            expect(sx === 'none' || /matrix(3d)?\(-1/.test(sx), `right ghost mirrored, got ${sx}`).toBe(true);
          }

          // Content nodes inside the band must not overlap the ghost box.
          const offenders = await band.evaluate((root, g) => {
            const hits: string[] = [];
            const walk = (node: Node) => {
              if (node.nodeType === Node.TEXT_NODE) {
                const text = node.textContent?.trim();
                if (!text) return;
                const range = document.createRange();
                range.selectNodeContents(node);
                const rects = [...range.getClientRects()];
                for (const r of rects) {
                  if (r.width < 1 || r.height < 1) continue;
                  const b = { x: r.x, y: r.y, width: r.width, height: r.height };
                  if (g.x < b.x + b.width && g.x + g.width > b.x && g.y < b.y + b.height && g.y + g.height > b.y) {
                    hits.push(`text:${text.slice(0, 40)}`);
                    return;
                  }
                }
                return;
              }
              if (node.nodeType !== Node.ELEMENT_NODE) return;
              const el = node as HTMLElement;
              if (el.hasAttribute('data-ghost-art') || el.getAttribute('aria-hidden') === 'true') return;
              const style = getComputedStyle(el);
              if (style.display === 'none' || style.visibility === 'hidden') return;
              const tag = el.tagName.toLowerCase();
              const interactive =
                tag === 'a' ||
                tag === 'button' ||
                tag === 'input' ||
                tag === 'select' ||
                tag === 'textarea' ||
                el.getAttribute('role') === 'button' ||
                el.tabIndex >= 0;
              if (interactive) {
                const r = el.getBoundingClientRect();
                if (r.width >= 1 && r.height >= 1) {
                  const b = { x: r.x, y: r.y, width: r.width, height: r.height };
                  if (g.x < b.x + b.width && g.x + g.width > b.x && g.y < b.y + b.height && g.y + g.height > b.y) {
                    hits.push(`interactive:${tag}${el.id ? '#' + el.id : ''}`);
                  }
                }
              }
              for (const child of el.childNodes) walk(child);
            };
            walk(root);
            return hits;
          }, ghostBox);

          expect(offenders, `${place.route} overlaps: ${offenders.join('; ')}`).toEqual([]);
        });
      }
    });
  }

  for (const vp of NARROW) {
    test(`${vp.width}x${vp.height}: no visible ghost and no network request for the image`, async ({ browser }) => {
      test.setTimeout(120_000);
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: vp.dpr,
      });
      const page = await context.newPage();
      const ghostReqs: string[] = [];
      page.on('request', (req) => {
        const u = req.url();
        if (/miku-v6|ghost\/miku|\/_astro\/.*miku/i.test(u)) ghostReqs.push(u);
      });
      for (const place of PLACEMENTS) {
        await page.goto(place.route, { waitUntil: 'networkidle' });
        await settle(page);
        const ghosts = page.locator('[data-ghost-art]');
        const count = await ghosts.count();
        for (let i = 0; i < count; i++) {
          const el = ghosts.nth(i);
          const visible = await el.evaluate((node) => {
            const s = getComputedStyle(node);
            if (s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity) === 0) return false;
            const r = node.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
          });
          expect(visible, `${place.route} ghost visible at ${vp.width}`).toBe(false);
        }
      }
      expect(ghostReqs, `unexpected ghost fetches: ${ghostReqs.join(', ')}`).toEqual([]);
      await context.close();
    });
  }

  test('axe stays clean on ghost pages at 2560', async ({ browser }) => {
    test.setTimeout(120_000);
    const context = await browser.newContext({
      viewport: { width: 2560, height: 1440 },
      deviceScaleFactor: 1.5,
    });
    const page = await context.newPage();
    for (const place of PLACEMENTS) {
      await page.goto(place.route, { waitUntil: 'networkidle' });
      await settle(page);
      const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      expect(results.violations, place.route).toEqual([]);
    }
    await context.close();
  });

  test('viewport screenshots at 2560x1440 @ 1.5 for the four pages', async ({ browser }) => {
    test.setTimeout(120_000);
    mkdirSync(SHOT_DIR, { recursive: true });
    const context = await browser.newContext({
      viewport: { width: 2560, height: 1440 },
      deviceScaleFactor: 1.5,
    });
    const page = await context.newPage();
    for (const place of PLACEMENTS) {
      await page.goto(place.route, { waitUntil: 'networkidle' });
      await settle(page);
      const ghost = page.locator(`${place.band} [data-ghost-art="${place.side}"]`);
      await ghost.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: join(SHOT_DIR, `${place.shot}-2560x1440.png`),
        fullPage: false,
      });
    }
    await context.close();
  });
});
