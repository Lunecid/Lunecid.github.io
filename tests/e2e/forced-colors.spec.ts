import { test, expect, settle } from './helpers';

// N14 / G-012..G-014: Windows High Contrast (forced-colors) keeps cut edges and selected states.

test.describe('N14: forced colours', () => {
  for (const colorScheme of ['dark', 'light'] as const) {
    test(`${colorScheme}: visible .cut controls keep a ≥1px border on /game/ and /game/records/`, async ({ page }) => {
      await page.emulateMedia({ forcedColors: 'active', colorScheme });
      await page.setViewportSize({ width: 1440, height: 900 });
      for (const route of ['/game/', '/game/records/'] as const) {
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
    await page.goto('/game/projects/', { waitUntil: 'networkidle' });
    await settle(page);

    const tags = page.locator('.tag-filter__btn');
    await expect(tags.first()).toBeVisible();
    const idleBg = await tags.nth(1).evaluate((el) => getComputedStyle(el).backgroundColor);
    await tags.nth(1).click();
    await expect(tags.nth(1)).toHaveAttribute('aria-pressed', 'true');
    const pressedBg = await tags.nth(1).evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(pressedBg, 'pressed tag uses Highlight').not.toBe(idleBg);

    await page.goto('/game/', { waitUntil: 'networkidle' });
    await settle(page);
    const charBtns = page.locator('.char-stage__btn');
    if ((await charBtns.count()) >= 2) {
      const a = await charBtns.nth(0).evaluate((el) => getComputedStyle(el).backgroundColor);
      const b = await charBtns.nth(1).evaluate((el) => getComputedStyle(el).backgroundColor);
      const pressed0 = await charBtns.nth(0).getAttribute('aria-pressed');
      const pressed1 = await charBtns.nth(1).getAttribute('aria-pressed');
      if (pressed0 !== pressed1) expect(a).not.toBe(b);
    }

    await page.goto('/game/player-log/', { waitUntil: 'networkidle' });
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
    await page.goto('/game/', { waitUntil: 'networkidle' });
    await settle(page);
    const sq = page.locator('.hud-label__sq').first();
    await expect(sq).toBeVisible();
    const pair = await sq.evaluate((el) => ({
      sq: getComputedStyle(el).backgroundColor,
      body: getComputedStyle(document.body).backgroundColor,
    }));
    expect(pair.sq).not.toBe(pair.body);
  });
  test('T1: the general cue line is drawn in CanvasText under forced colors', async ({ page }) => {
    // The line is a border (not a background), so forced colours repaint it in CanvasText instead of erasing it.
    await page.emulateMedia({ forcedColors: 'active', colorScheme: 'light' });
    await page.goto('/data/projects/school-zone-blindspots/', { waitUntil: 'load' });
    await page.locator('main a[href="#figure-2"]').first().click();
    await expect(page).toHaveURL(/#figure-2$/);
    const line = await page.locator('#figure-2').evaluate((el) => {
      const probe = document.createElement('span');
      probe.style.color = 'CanvasText';
      el.append(probe);
      const canvasText = getComputedStyle(probe).color;
      probe.remove();
      const cs = getComputedStyle(el, '::before');
      return { display: cs.display, width: cs.borderTopWidth, color: cs.borderTopColor, canvasText };
    });
    expect(line.display).not.toBe('none');
    expect(line.width).toBe('2px');
    expect(line.color).toBe(line.canvasText);
  });
  test('MO-21: the targeted figure marker is drawn in CanvasText', async ({ page }) => {
    // Reduced motion draws a square marker before the targeted figure number; forced colours would erase a plain
    // background, so the marker opts out and paints CanvasText.
    await page.emulateMedia({ forcedColors: 'active', colorScheme: 'light', reducedMotion: 'reduce' });
    for (const [path, num] of [['/game/projects/school-zone-blindspots/', '.figure__num'], ['/data/projects/school-zone-blindspots/', '.ed-figcap__num']] as const) {
      await page.goto(path, { waitUntil: 'load' });
      await page.locator('main a[href="#figure-2"]').first().click();
      await expect(page).toHaveURL(/#figure-2$/);
      const marker = await page.locator(`#figure-2 ${num}`).evaluate((el) => {
        const probe = document.createElement('span');
        probe.style.color = 'CanvasText';
        el.append(probe);
        const canvasText = getComputedStyle(probe).color;
        probe.remove();
        const cs = getComputedStyle(el, '::before');
        return { content: cs.content, width: parseFloat(cs.width) || 0, bg: cs.backgroundColor, canvasText };
      });
      expect(marker.content, path).toBe('""');
      expect(marker.width, path).toBeGreaterThan(0);
      expect(marker.bg, path).toBe(marker.canvasText);
    }
  });
});
