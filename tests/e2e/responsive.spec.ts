import { test, expect, builtRoutes, horizontalOverflow, settle, textBelow12px } from './helpers';
import { CV_HREF } from '../../src/config';

test.describe('no horizontal overflow on every route', () => {
  for (const route of builtRoutes()) {
    test(route, async ({ page }) => {
      await page.goto(route, { waitUntil: 'networkidle' });
      await settle(page);
      const result = await horizontalOverflow(page);
      expect(result.scrollWidth, `${route} scrolls sideways; widest elements: ${result.offenders.join(', ')}`).toBeLessThanOrEqual(result.width);
    });
  }
});

test.describe('no rendered text below 12px', () => {
  for (const route of builtRoutes()) {
    test(route, async ({ page }) => {
      await page.goto(route, { waitUntil: 'networkidle' });
      await settle(page);
      expect(await textBelow12px(page), `${route}: text rendered below 12px`).toEqual([]);
    });
  }
});

test.describe('identity, CV link and evidence within two screens', () => {
  for (const route of ['/', '/en/']) {
    test(route, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name === 'mobile-320', 'the two-screen rule is asserted at 375 px and wider');
      const cv = route === '/en/' ? CV_HREF.en : CV_HREF.ko;
      await page.goto(route, { waitUntil: 'networkidle' });
      await settle(page);
      await page.evaluate(() => window.scrollTo(0, 0));
      const limit = 2 * (page.viewportSize()?.height ?? 0);

      const heroName = page.locator('#hero-name');
      const cvLink = page.locator(`a[href="${cv}"]`).first(); // first in DOM order = the HUD nav CV link
      await expect(heroName).toBeVisible();
      await expect(cvLink).toBeVisible();
      const docTop = (el: Element): number => el.getBoundingClientRect().top + window.scrollY;
      expect(await heroName.evaluate(docTop), '#hero-name top').toBeLessThan(limit);
      expect(await cvLink.evaluate(docTop), 'nav CV link top').toBeLessThan(limit);

      const evidenceTops = await page.locator('.player-card, .cart').evaluateAll((els) =>
        els
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
          })
          .map((el) => el.getBoundingClientRect().top + window.scrollY),
      );
      expect(evidenceTops.length, 'a visible .player-card or .cart exists').toBeGreaterThan(0);
      expect(Math.min(...evidenceTops), 'first evidence (.player-card or .cart) top').toBeLessThan(limit);
    });
  }
});
