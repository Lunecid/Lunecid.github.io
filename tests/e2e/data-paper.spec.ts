import type { Page } from '@playwright/test';
import { test, expect, dataPath } from './helpers';

test.describe('general paper page (P2-5)', () => {
  for (const lang of ['ko', 'en'] as const) {
    test(`${lang}: the white sheet on the white page, no HUD frame, links in the link ink (DS-2)`, async ({ page }) => {
      await page.goto(dataPath('/research/cog-2026-engagement/', lang), { waitUntil: 'networkidle' });
      await expect(page.locator('article.paper')).toHaveCount(1);
      await expect(page.locator('main .hud-grid, main .bracket')).toHaveCount(0);
      const link = page.locator('article.paper a[href]').first();
      expect(await link.evaluate((el) => getComputedStyle(el).color)).toBe('rgb(20, 20, 20)');
    });
  }
});

// The Korean paper serif (a 60 KB subset) used to arrive after the first render and rewrap the Korean title gloss at
// 375 px: "(국문 제목)" moved up a line and the authors and abstract with it (CLS 0.037, at ~130 ms locally and later on a
// slow phone). The general page preloads the face with font-display: optional, so it never swaps in late.
test.describe('general paper page: no layout shift from the Korean serif (DS-8)', () => {
  /** Sum of the layout-shift entries without recent input, from a buffered observer (shifts since navigation). */
  const shiftSum = (page: Page, ms: number): Promise<number> =>
    page.evaluate(
      (wait) =>
        new Promise<number>((resolve) => {
          let sum = 0;
          const po = new PerformanceObserver((list) => {
            for (const e of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) if (!e.hadRecentInput) sum += e.value;
          });
          po.observe({ type: 'layout-shift', buffered: true });
          setTimeout(() => {
            po.disconnect();
            resolve(sum);
          }, wait);
        }),
      ms,
    );

  for (const [label, slow] of [['fast', false], ['slow phone (150 ms RTT, 1.6 Mbps, CPU ×4)', true]] as const) {
    test(`375 px, ${label}: /data/research/cog-2026-engagement/ keeps CLS ≤ 0.02 (3 fresh loads)`, async ({ browser }) => {
      test.setTimeout(90_000);
      const sums: number[] = [];
      for (let run = 0; run < 3; run++) {
        const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 });
        const page = await context.newPage();
        if (slow) {
          const cdp = await context.newCDPSession(page);
          await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
          await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 200_000, uploadThroughput: 93_750 });
        }
        await page.goto(dataPath('/research/cog-2026-engagement/', 'ko'), { waitUntil: 'commit' });
        await page.waitForLoadState('load');
        sums.push(Math.round((await shiftSum(page, 2500)) * 10000) / 10000);
        await context.close();
      }
      test.info().annotations.push({ type: 'cls', description: JSON.stringify(sums) });
      for (const sum of sums) expect(sum, JSON.stringify(sums)).toBeLessThanOrEqual(0.02);
    });
  }

  test('the Korean serif is preloaded with font-display: optional on the general paper page only', async ({ page }) => {
    for (const [path, general] of [[dataPath('/research/cog-2026-engagement/', 'ko'), true], ['/game/research/cog-2026-engagement/', false]] as const) {
      await page.goto(path, { waitUntil: 'load' });
      const rule = await page.evaluate(() => [...document.querySelectorAll('style')].map((s) => s.textContent ?? '').join('').match(/@font-face\{font-family:"SB Serif KR";[^}]*\}/)?.[0] ?? '');
      const preload = await page.locator('link[rel="preload"][as="font"][href*="/sb-serif-kr."]').count();
      expect(rule, path).toContain(general ? 'font-display:optional' : 'font-display:swap');
      expect(preload, path).toBe(general ? 1 : 0);
    }
  });
});
