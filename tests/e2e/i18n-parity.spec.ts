import { test, expect, builtRoutes, sectionIds, internalLinks, koPathOf } from './helpers';
import { routesFor } from '../../src/lib/routes';
import { otherLang, switchLocalePath } from '../../src/i18n/utils';
import type { Lang } from '../../src/i18n/ui';

test.describe('language switch resolves on every route', () => {
  for (const route of builtRoutes()) {
    test(route, async ({ page }) => {
      const lang: Lang = route.startsWith('/en/') ? 'en' : 'ko';
      const other = otherLang(lang);
      const expected = switchLocalePath(route, other);
      expect(koPathOf(expected), 'the switch targets the same page').toBe(koPathOf(route));

      const response = await page.goto(route);
      expect(response?.status(), route).toBe(200);
      const link = page.locator('a[hreflang]').first(); // first in DOM order = the HUD nav language link
      await expect(link).toHaveAttribute('hreflang', other);
      await expect(link).toHaveAttribute('href', expected);

      const switched = await page.goto(expected);
      expect(switched?.status(), expected).toBe(200);
      await expect(page.locator('html')).toHaveAttribute('lang', other);
    });
  }
});

// P2-6 (controller ruling 3): the language switch keeps location.hash (anchor ids are shared across languages), so
// a hash-scrolled page (e.g. from "지원 요건 대응 보기" → #job-fit) stays on the same section after switching language.
test.describe('language switch keeps the #hash', () => {
  test('/records/#job-fit -> /en/records/#job-fit', async ({ page }) => {
    await page.goto('/records/#job-fit', { waitUntil: 'load' });
    // a[hreflang]').first() (as elsewhere in this file) is the DOM-first .hud-nav__lang--panel link, hidden at
    // desktop width (it exists only for < 734px); this test clicks, so it needs the always-on-desktop bar link.
    const link = page.locator('.hud-nav__lang--bar a[hreflang]');
    await expect(link).toHaveAttribute('href', '/en/records/#job-fit');
    await link.click();
    await expect(page).toHaveURL(/\/en\/records\/#job-fit$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('#job-fit')).toBeInViewport();
  });

  test('a route with no hash is unaffected', async ({ page }) => {
    await page.goto('/records/', { waitUntil: 'load' });
    const link = page.locator('a[hreflang]').first();
    await expect(link).toHaveAttribute('href', '/en/records/');
  });
});

test.describe('ko/en pages expose the same section ids and internal link targets', () => {
  for (const koRoute of routesFor('ko')) {
    test(koRoute, async ({ page }) => {
      const enRoute = `/en${koRoute}`;
      expect((await page.goto(koRoute, { waitUntil: 'networkidle' }))?.status(), koRoute).toBe(200);
      const koIds = await sectionIds(page);
      const koLinks = await internalLinks(page);

      expect((await page.goto(enRoute, { waitUntil: 'networkidle' }))?.status(), enRoute).toBe(200);
      const enIds = await sectionIds(page);
      const enLinks = await internalLinks(page);

      expect(enIds, `section ids of ${enRoute} vs ${koRoute}`).toEqual(koIds);
      expect(enLinks, `internal link targets of ${enRoute} vs ${koRoute}`).toEqual(koLinks);
    });
  }
});
