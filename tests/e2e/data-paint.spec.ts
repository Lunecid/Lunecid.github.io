// DS-9: text on paint (the hero's DATA ANALYST, the research figure tile, the award badge, 진행 중, 내 역할) reads at
// ≥ 4.5:1 at its worst pixel: sampled from the page as painted — the committed raster tiles (src/styles/paint/), the
// frayed edge, the line boxes — at three widths at DPR 1 and two at DPR 2 (tests/helpers/paint-contrast.ts).
import type { Browser } from '@playwright/test';
import { test, expect, dataPath } from './helpers';
import { paintSamples, type PaintSample } from '../helpers/paint-contrast';

const PAGES = [
  dataPath('/'),
  dataPath('/projects/school-zone-blindspots/'),
  dataPath('/research/'),
  dataPath('/', 'en'),
  dataPath('/projects/school-zone-blindspots/', 'en'),
];
const SIZES = [
  { width: 1280, dpr: 1 },
  { width: 768, dpr: 1 },
  { width: 375, dpr: 1 },
  { width: 1280, dpr: 2 },
  { width: 375, dpr: 2 },
];
const FLOOR = 4.5;

/** `flat`: the state before the tiles attach (after load) — the fields' flat paint, the tiles' mean colour. */
async function samplesAt(browser: Browser, route: string, width: number, dpr: number, flat = false): Promise<PaintSample[]> {
  const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: dpr, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(route, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready.then(() => true));
  // every one-time reveal below the first screen has run (reduced motion: a fade; nothing left half-visible)
  await page.evaluate(async () => {
    for (let y = 0; y < document.documentElement.scrollHeight; y += 400) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 40));
    }
  });
  await page.waitForFunction(() => document.querySelectorAll('.is-waiting').length === 0);
  await page.waitForFunction(() => document.documentElement.hasAttribute('data-paint-tex'));
  if (flat) await page.evaluate(() => document.documentElement.removeAttribute('data-paint-tex'));
  await page.waitForTimeout(400);
  const samples = await paintSamples(page);
  await context.close();
  return samples;
}

for (const route of PAGES) {
  test(`DS-9 ${route}: every glyph on paint reads at ≥ ${FLOOR}:1 against the lightest and the darkest paint pixel under it`, async ({ browser }) => {
    test.setTimeout(240_000);
    const report: string[] = [];
    let worst = Infinity;
    for (const { width, dpr } of SIZES) {
      const samples = await samplesAt(browser, route, width, dpr);
      expect(samples.length, `${width}px @${dpr}x: text on paint found`).toBeGreaterThan(0);
      for (const s of samples) {
        expect(s.pixels, `${width}px @${dpr}x ${s.label}: glyph pixels found`).toBeGreaterThan(0);
        // the paint under the text is a committed raster tile, never live SVG noise
        expect(s.paint, `${width}px @${dpr}x ${s.label}: paint`).toMatch(/\/_astro\/paint-[rby][hv](-2x)?\.[\w-]+\.webp/);
        const min = Math.min(s.atLightest, s.atDarkest);
        worst = Math.min(worst, min);
        report.push(`${width}@${dpr}x ${s.label}: ${s.atLightest.toFixed(2)} / ${s.atDarkest.toFixed(2)}`);
        expect(min, `${width}px @${dpr}x ${s.label} (lightest ${s.atLightest.toFixed(2)}, darkest ${s.atDarkest.toFixed(2)})`).toBeGreaterThanOrEqual(FLOOR);
      }
    }
    // the flat state (before the tiles attach after load) reads too
    for (const { width, dpr } of [SIZES[0]!, SIZES[4]!]) {
      for (const s of await samplesAt(browser, route, width, dpr, true)) {
        expect(s.paint, `flat ${width}px @${dpr}x ${s.label}: no tile yet`).not.toMatch(/paint-[rby][hv]/);
        const min = Math.min(s.atLightest, s.atDarkest);
        worst = Math.min(worst, min);
        report.push(`flat ${width}@${dpr}x ${s.label}: ${s.atLightest.toFixed(2)} / ${s.atDarkest.toFixed(2)}`);
        expect(min, `flat ${width}px @${dpr}x ${s.label}`).toBeGreaterThanOrEqual(FLOOR);
      }
    }
    test.info().annotations.push({ type: 'worst', description: worst.toFixed(2) }, { type: 'samples', description: report.join('\n') });
    console.info(`${route} worst text-on-paint contrast ${worst.toFixed(2)}`);
  });
}

// Deferred textures (DS-9 ruling): the painted fields render flat (the tiles' mean colour) and the tiles attach after
// the load event, so they never compete with the first render; the hover stroke's tile waits for a hover or a focus.
const tileRequests = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    return {
      loadEnd: nav.loadEventEnd,
      tiles: performance.getEntriesByType('resource').filter((e) => /\/paint-[rby][hv](-2x)?\./.test(e.name)).map((e) => ({ name: e.name.replace(/^.*\/_astro\//, ''), start: e.startTime })),
    };
  });

for (const base of ['/', '/projects/', '/projects/school-zone-blindspots/', '/records/', '/research/', '/research/cog-2026-engagement/']) {
  test(`DS-9 ${dataPath(base)}: no texture tile is requested before the load event; they attach after it`, async ({ page }) => {
    await page.goto(dataPath(base), { waitUntil: 'load' });
    await page.waitForFunction(() => document.documentElement.hasAttribute('data-paint-tex'));
    await page.waitForLoadState('networkidle');
    const { loadEnd, tiles } = await tileRequests(page);
    expect(loadEnd).toBeGreaterThan(0);
    expect(tiles.length, 'tiles once attached').toBeGreaterThan(0);
    for (const t of tiles) expect(t.start, `${t.name} requested before load ended`).toBeGreaterThanOrEqual(loadEnd);
  });
}

for (const via of ['hover', 'focus'] as const) {
  test(`DS-9: the hover stroke's tile is requested only after the first ${via}`, async ({ page }) => {
    // The yh tile is also a field's (the footer sign-off's yellow cell, on every page): the field tiles are kept from
    // attaching here (idle time never comes), so any yh request can only be the stroke's.
    await page.addInitScript(() => {
      window.requestIdleCallback = (() => 0) as typeof window.requestIdleCallback;
    });
    const requested: string[] = [];
    page.on('request', (r) => { if (/\/paint-yh(-2x)?\./.test(r.url())) requested.push(r.url()); });
    await page.goto(dataPath('/'), { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    await expect(page.locator('html')).not.toHaveAttribute('data-paint-tex', /.*/);
    expect(requested, 'the stroke tile before any hover or focus').toEqual([]);
    const strokeLayer = () => page.locator('.data-nav__list a').first().evaluate((a) => getComputedStyle(a, '::before').backgroundImage);
    expect(await strokeLayer(), 'the nav sweep has no tile yet').not.toMatch(/paint-yh/);
    if (via === 'hover') await page.locator('.data-nav__list a').first().hover();
    else await page.keyboard.press('Tab');
    await expect(page.locator('html')).toHaveAttribute('data-paint-stroke', '');
    expect(await strokeLayer(), 'the nav sweep takes the tile').toMatch(/paint-yh/);
    await expect.poll(() => requested.length, { message: 'the stroke tile after the first interaction' }).toBeGreaterThan(0);
  });
}
