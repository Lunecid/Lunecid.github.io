import { test, expect, dataPath } from './helpers';

test.describe('general paper page (P2-5)', () => {
  for (const lang of ['ko', 'en'] as const) {
    test(`${lang}: the white sheet on the white page, no HUD frame, links in navy`, async ({ page }) => {
      await page.goto(dataPath('/research/cog-2026-engagement/', lang), { waitUntil: 'networkidle' });
      await expect(page.locator('article.paper')).toHaveCount(1);
      await expect(page.locator('main .hud-grid, main .bracket')).toHaveCount(0);
      const link = page.locator('article.paper a[href]').first();
      expect(await link.evaluate((el) => getComputedStyle(el).color)).toBe('rgb(30, 58, 138)');
    });
  }
});
