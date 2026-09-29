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
  for (const route of ['/game/', '/en/game/']) {
    test(route, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name === 'mobile-320', 'the two-screen rule is asserted at 375 px and wider');
      const cv = route === '/en/game/' ? CV_HREF.en : CV_HREF.ko;
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

// N01 / G-011: at short phone heights the open menu panel scrolls; body scroll stays locked at 0.
test.describe('N01: phone menu panel scrolls at short heights', () => {
  for (const height of [256, 200] as const) {
    for (const route of ['/game/records/', '/en/game/records/'] as const) {
      test(`${route} at 320×${height}`, async ({ page }, testInfo) => {
        test.skip(!testInfo.project.name.startsWith('mobile'), 'phone menu only below 734px');
        await page.setViewportSize({ width: 320, height });
        await page.goto(route, { waitUntil: 'networkidle' });
        await settle(page);
        const toggle = page.locator('[data-nav-toggle]');
        await expect(toggle).toBeVisible();
        await toggle.click();
        await expect(toggle).toHaveAttribute('aria-expanded', 'true');

        const panel = page.locator('#hud-menu');
        const overflow = await panel.evaluate((el) => ({
          scrollHeight: el.scrollHeight,
          clientHeight: el.clientHeight,
        }));
        expect(overflow.scrollHeight, 'panel content taller than the viewport band').toBeGreaterThan(overflow.clientHeight);

        const target = panel.locator('.hud-nav__list a[href*="player-log"]');
        const lang = panel.locator('.hud-nav__lang--panel a');
        await expect(target).toBeAttached();
        await target.evaluate((el) => el.scrollIntoView({ block: 'nearest' }));
        await expect(target).toBeInViewport();
        await lang.evaluate((el) => el.scrollIntoView({ block: 'nearest' }));
        await expect(lang).toBeInViewport();

        // Acceptance: the scrolled item is the Player Log entry (label differs by lang).
        await expect(target).toContainText(route.startsWith('/en/') ? 'Player Log' : '플레이 로그');
        expect(await page.evaluate(() => window.scrollY), 'body scroll stays locked').toBe(0);
      });
    }
  }
});

// N01 / G-017: toggle x/width identical open vs closed; bar stays one row at 305px content width.
test.describe('N01: phone menu toggle width is stable', () => {
  for (const width of [320, 375, 390] as const) {
    for (const route of ['/game/', '/en/game/'] as const) {
      test(`${route} at ${width}px`, async ({ page }, testInfo) => {
        test.skip(!testInfo.project.name.startsWith('mobile'), 'phone menu only below 734px');
        await page.setViewportSize({ width, height: 720 });
        await page.goto(route, { waitUntil: 'networkidle' });
        await settle(page);
        const toggle = page.locator('[data-nav-toggle]');
        const before = await toggle.evaluate((el) => {
          const r = el.getBoundingClientRect();
          return { x: r.x, width: r.width };
        });
        await toggle.click();
        await expect(toggle).toHaveAttribute('aria-expanded', 'true');
        const after = await toggle.evaluate((el) => {
          const r = el.getBoundingClientRect();
          return { x: r.x, width: r.width };
        });
        expect(after.x, 'toggle x unchanged when open').toBeCloseTo(before.x, 0);
        expect(after.width, 'toggle width unchanged when open').toBeCloseTo(before.width, 0);
      });
    }
  }

  test('/en/game/ bar does not wrap at 305px content width', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('mobile'), 'phone menu only below 734px');
    // 320 CSS px with a desktop-like scrollbar ≈ 305px content; emulate via a 305-wide viewport.
    await page.setViewportSize({ width: 305, height: 720 });
    await page.goto('/en/game/', { waitUntil: 'networkidle' });
    await settle(page);
    const toggle = page.locator('[data-nav-toggle]');
    const brand = page.locator('.hud-nav__brand');
    const brandBox = (await brand.boundingBox())!;
    const toggleBox = (await toggle.boundingBox())!;
    expect(Math.abs(toggleBox.y - brandBox.y), 'brand and toggle share one bar row').toBeLessThanOrEqual(8);
    await toggle.click();
    const brandOpen = (await brand.boundingBox())!;
    const toggleOpen = (await toggle.boundingBox())!;
    expect(Math.abs(toggleOpen.y - brandOpen.y), 'still one row when open').toBeLessThanOrEqual(8);
    expect(toggleOpen.y + toggleOpen.height).toBeLessThanOrEqual(brandOpen.y + Math.max(brandOpen.height, 52) + 4);
  });
});
