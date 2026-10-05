// Audit M-10 side finding: the general version's Korean heading face (sb-serif-kr-head, font-display: swap) may
// arrive late on a slow connection. Its swap must not shift the layout: CLS ≤ 0.02 with the face held back 1.5 s.
import type { Browser, Page } from '@playwright/test';
import { test, expect } from './helpers';

const DELAY_MS = 1500;
const SETTLE_MS = 2500;
const RUNS = 5;

/** Sum of the layout-shift entries without recent input, from a buffered observer (shifts since navigation). */
function layoutShiftSum(page: Page, ms: number): Promise<number> {
  return page.evaluate(
    (wait) =>
      new Promise<number>((resolve) => {
        let sum = 0;
        const po = new PerformanceObserver((list) => {
          for (const e of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
            if (!e.hadRecentInput) sum += e.value;
          }
        });
        po.observe({ type: 'layout-shift', buffered: true });
        setTimeout(() => {
          po.disconnect();
          resolve(sum);
        }, wait);
      }),
    ms,
  );
}

async function lateHeadingRun(browser: Browser, path: string): Promise<{ cls: number; fontRequests: number; headFace: boolean }> {
  // a fresh context per run: no cached font
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  let fontRequests = 0;
  await page.route('**/sb-serif-kr-head*.woff2', (route) => {
    fontRequests += 1;
    setTimeout(() => void route.continue(), DELAY_MS);
  });
  await page.goto(path, { waitUntil: 'commit' });
  const cls = await layoutShiftSum(page, SETTLE_MS);
  const headFace = await page.evaluate(() => [...document.fonts].some((f) => f.family.includes('Head') && f.status === 'loaded'));
  await context.close();
  return { cls, fontRequests, headFace };
}

test('M-10: /data/ and the school-zone case study keep CLS ≤ 0.02 when the Korean heading face arrives late (1.5 s)', async ({ browser }) => {
  test.setTimeout(120_000);
  const sums: Record<string, number[]> = {};
  for (const path of ['/data/', '/data/projects/school-zone-blindspots/']) {
    sums[path] = [];
    for (let i = 0; i < RUNS; i++) {
      const run = await lateHeadingRun(browser, path);
      expect(run.fontRequests, `${path} run ${i + 1}: the heading face was requested (and held back)`).toBeGreaterThan(0);
      expect(run.headFace, `${path} run ${i + 1}: the heading face arrived within the window`).toBe(true);
      sums[path].push(Math.round(run.cls * 10000) / 10000);
      expect(run.cls, `${path} run ${i + 1}`).toBeLessThanOrEqual(0.02);
    }
  }
  test.info().annotations.push({ type: 'cls', description: JSON.stringify(sums) });
});
