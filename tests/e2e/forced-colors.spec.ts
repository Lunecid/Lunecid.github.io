import { test, expect, settle } from './helpers';

// N14 / G-012..G-014: Windows High Contrast (forced-colors) keeps cut edges and selected states.

test.describe('N14: forced colours', () => {
  for (const colorScheme of ['dark', 'light'] as const) {
    test(`${colorScheme}: visible .cut controls keep a ≥1px border on / and /records/`, async ({ page }) => {
      await page.emulateMedia({ forcedColors: 'active', colorScheme });
      await page.setViewportSize({ width: 1440, height: 900 });
      for (const route of ['/', '/records/'] as const) {
        await page.goto(route, { waitUntil: 'networkidle' });
        await settle(page);
        const widths = await page.evaluate(() =>
          Array.from(document.querySelectorAll('.cut'))
            .filter((el) => {
              const r = el.getBoundingClientRect();
              return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
            })
            .map((el) => parseFloat(getComputedStyle(el).borderTopWidth)),
        );
        expect(widths.length, `${route}: at least one .cut`).toBeGreaterThan(0);
        for (const w of widths) expect(w, `${route} ${colorScheme}`).toBeGreaterThanOrEqual(1);
      }
    });
  }

  test('pressed tag / character / game-tab backgrounds differ from idle', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active', colorScheme: 'dark' });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/projects/', { waitUntil: 'networkidle' });
    await settle(page);

    const tags = page.locator('.tag-filter__btn');
    await expect(tags.first()).toBeVisible();
    const idleBg = await tags.nth(1).evaluate((el) => getComputedStyle(el).backgroundColor);
    await tags.nth(1).click();
    await expect(tags.nth(1)).toHaveAttribute('aria-pressed', 'true');
    const pressedBg = await tags.nth(1).evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(pressedBg, 'pressed tag uses Highlight').not.toBe(idleBg);

    await page.goto('/', { waitUntil: 'networkidle' });
    await settle(page);
    const charBtns = page.locator('.char-stage__btn');
    if ((await charBtns.count()) >= 2) {
      const a = await charBtns.nth(0).evaluate((el) => getComputedStyle(el).backgroundColor);
      const b = await charBtns.nth(1).evaluate((el) => getComputedStyle(el).backgroundColor);
      const pressed0 = await charBtns.nth(0).getAttribute('aria-pressed');
      const pressed1 = await charBtns.nth(1).getAttribute('aria-pressed');
      if (pressed0 !== pressed1) expect(a).not.toBe(b);
    }

    await page.goto('/player-log/', { waitUntil: 'networkidle' });
    await settle(page);
    const tabs = page.locator('.fg__tab');
    if ((await tabs.count()) >= 2) {
      const selected = page.locator('.fg__tab[aria-selected="true"]').first();
      const idle = page.locator('.fg__tab:not([aria-selected="true"])').first();
      if ((await selected.count()) && (await idle.count())) {
        const sb = await selected.evaluate((el) => getComputedStyle(el).backgroundColor);
        const ib = await idle.evaluate((el) => getComputedStyle(el).backgroundColor);
        expect(sb).not.toBe(ib);
      }
    }
  });

  test('.hud-label__sq background differs from the body', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active', colorScheme: 'dark' });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/', { waitUntil: 'networkidle' });
    await settle(page);
    const sq = page.locator('.hud-label__sq').first();
    await expect(sq).toBeVisible();
    const pair = await sq.evaluate((el) => ({
      sq: getComputedStyle(el).backgroundColor,
      body: getComputedStyle(document.body).backgroundColor,
    }));
    expect(pair.sq).not.toBe(pair.body);
  });
});
