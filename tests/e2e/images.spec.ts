import type { Page } from '@playwright/test';
import { test, expect } from './helpers';

// Batch 2 (DIAGNOSIS P2-39): LCP images load eagerly with high priority, everything below the fold stays lazy.
// Batch 5 fix round 1: the CoG cartridge label on / is the paper's AUC chart drawn inline (AucLabel), and the research
// highlight shows the same kind of chart, so no research figure image is fetched on / at any size.

async function scrollThrough(page: Page): Promise<void> {
  await page.evaluate(async () => {
    for (let y = 0; y < document.documentElement.scrollHeight; y += 300) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
  });
  await page.waitForLoadState('networkidle');
}

for (const device of [
  { name: 'phone 412px at 1.75x', viewport: { width: 412, height: 915 }, deviceScaleFactor: 1.75 },
  { name: 'desktop 1350px', viewport: { width: 1350, height: 940 }, deviceScaleFactor: 1 },
  { name: '4K at 1.5x', viewport: { width: 2560, height: 1300 }, deviceScaleFactor: 1.5 },
]) {
  test.describe(`${device.name}`, () => {
    test.use({ viewport: device.viewport, deviceScaleFactor: device.deviceScaleFactor });

    test('/ draws the CoG label as an inline chart: no research figure image is fetched', async ({ page }) => {
      const urls: string[] = [];
      page.on('request', (request) => {
        if (/\/_astro\/(label-horizon|kill-gap-kde)\./.test(request.url())) urls.push(request.url());
      });
      await page.goto('/', { waitUntil: 'networkidle' });
      await scrollThrough(page);
      expect(urls, urls.join('\n')).toEqual([]);
      await expect(page.locator('#featured-projects .cart--wide .auc-label svg').filter({ visible: true })).toHaveCount(1);
    });
  });
}

test('LCP images are eager with fetchpriority high; the other cartridges stay lazy', async ({ page }) => {
  await page.goto('/projects/');
  const carts = page.locator('.cart__img');
  expect(await carts.count()).toBeGreaterThan(2);
  await expect(carts.first()).toHaveAttribute('loading', 'eager');
  await expect(carts.first()).toHaveAttribute('fetchpriority', 'high');
  for (const img of (await carts.all()).slice(1)) await expect(img).toHaveAttribute('loading', 'lazy');

  await page.goto('/records/');
  await expect(page.locator('img.rhead__photo')).toHaveAttribute('fetchpriority', 'high'); // the short records head (P2-19)
  await expect(page.locator('img.rhead__photo')).toHaveAttribute('loading', 'eager');

  await page.goto('/');
  await expect(page.locator('img.hello__photo')).toHaveAttribute('loading', 'lazy'); // bottom of the home page

  await page.goto('/player-log/');
  await expect(page.locator('.mcard__photo img')).toHaveAttribute('loading', 'eager');
});
