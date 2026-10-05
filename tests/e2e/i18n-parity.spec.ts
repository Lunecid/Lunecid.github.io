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
      // P2-10 (D-6): the chooser's switch keeps ?choose (spec §5.5), so a stored choice does not redirect it away.
      const target = route === '/' || route === '/en/' ? `${expected}?choose` : expected;

      const response = await page.goto(route);
      expect(response?.status(), route).toBe(200);
      const link = page.locator('a[hreflang]').first(); // first in DOM order = the HUD nav language link
      await expect(link).toHaveAttribute('hreflang', other);
      await expect(link).toHaveAttribute('href', target);

      const switched = await page.goto(target);
      expect(switched?.status(), target).toBe(200);
      await expect(page.locator('html')).toHaveAttribute('lang', other);
    });
  }
});

// P2-6 (controller ruling 3): the language switch keeps location.hash (anchor ids are shared across languages), so
// a hash-scrolled page (e.g. from "지원 요건 대응 보기" → #job-fit) stays on the same section after switching language.
test.describe('language switch keeps the #hash', () => {
  test('/game/records/#job-fit -> /en/game/records/#job-fit', async ({ page }) => {
    await page.goto('/game/records/#job-fit', { waitUntil: 'load' });
    // a[hreflang]').first() (as elsewhere in this file) is the DOM-first .hud-nav__lang--panel link, hidden at
    // desktop width (it exists only for < 734px); this test clicks, so it needs the always-on-desktop bar link.
    const link = page.locator('.hud-nav__lang--bar a[hreflang]');
    await expect(link).toHaveAttribute('href', '/en/game/records/#job-fit');
    await link.click();
    await expect(page).toHaveURL(/\/en\/game\/records\/#job-fit$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('#job-fit')).toBeInViewport();
  });

  test('a route with no hash is unaffected', async ({ page }) => {
    await page.goto('/game/records/', { waitUntil: 'load' });
    const link = page.locator('a[hreflang]').first();
    await expect(link).toHaveAttribute('href', '/en/game/records/');
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

// DS-8: the general version's Korean and English pages have the same composition: section ids, folios, rails (whose
// CSS-counter numbers therefore match), stat tiles and display words; English pages show no Hangul outside the language
// switch and proper names marked lang="ko".
test.describe('DS-8: general pages — the same composition in ko and en', () => {
  const shape = (page: import('@playwright/test').Page) =>
    page.evaluate(() => ({
      ids: [...document.querySelectorAll('main section[id], main [id].ed-sec')].map((el) => el.id),
      folios: document.querySelectorAll('.ed-folio').length,
      rails: [...document.querySelectorAll('main .ed-rail')].map((el) => el.closest('section')?.id ?? ''),
      tiles: document.querySelectorAll('main .ed-stat').length,
      display: document.querySelectorAll('main [data-display]').length,
      paintText: document.querySelectorAll('main [data-paint-text]').length,
    }));
  for (const koRoute of builtRoutes({ variant: 'data', lang: 'ko' })) {
    test(`DS-8: every general route has the same section ids, folio count, rail numbers and stat-tile count in ko and en — ${koRoute}`, async ({ page }) => {
      const enRoute = `/en${koRoute}`;
      expect((await page.goto(koRoute, { waitUntil: 'networkidle' }))?.status(), koRoute).toBe(200);
      const ko = await shape(page);
      expect((await page.goto(enRoute, { waitUntil: 'networkidle' }))?.status(), enRoute).toBe(200);
      const en = await shape(page);
      expect(en, `${enRoute} vs ${koRoute}`).toEqual(ko);
      expect(ko.folios, 'a folio at least in the footer').toBeGreaterThan(0);
      // Named exception: the kickick-park figure caption quotes the Korean axis label of its Tableau chart, "(합계)"
      // (copy verbatim; the shared Figure component has no lang mark for it — reported, not changed here).
      const hangul = await page.evaluate(() => {
        const walker = document.createTreeWalker(document.querySelector('main')!, NodeFilter.SHOW_TEXT);
        const hits: string[] = [];
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          const el = n.parentElement!;
          const text = (n.textContent ?? '').replace(/\(합계\)/g, '');
          if (!/\p{Script=Hangul}/u.test(text) || el.closest('[lang="ko"], .sr-only, [hidden], .paper')) continue;
          const s = getComputedStyle(el);
          if (s.display !== 'none' && s.visibility !== 'hidden') hits.push(text.trim().slice(0, 40));
        }
        return hits;
      });
      expect(hangul, `${enRoute}: visible Hangul outside lang="ko"`).toEqual([]);
    });
  }
});
