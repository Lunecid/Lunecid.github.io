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

  // DS-9: Windows High Contrast keeps url() background images, so the brush tiles would stay under forced text
  // colours, and the frayed mask would eat any frame. Text on paint: no image, no mask, a 1 px system frame;
  // decorative paint: gone; folios, chips, buttons and the tag filter: framed; the pressed filter differs.
  test('DS-9: data pages — text on paint has a frame and system colours; decorative paint is gone; pressed filter differs', async ({ page }) => {
    test.setTimeout(120_000);
    for (const colorScheme of ['dark', 'light'] as const) {
      await page.emulateMedia({ forcedColors: 'active', colorScheme });
      await page.setViewportSize({ width: 1280, height: 900 });
      for (const route of ['/data/', '/data/projects/', '/data/projects/school-zone-blindspots/', '/data/records/', '/data/research/', '/en/data/'] as const) {
        await page.goto(route, { waitUntil: 'networkidle' });
        await settle(page);
        const found = await page.evaluate(() => {
          const visible = (el: Element): boolean => {
            const r = el.getBoundingClientRect();
            const s = getComputedStyle(el);
            return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
          };
          const painted: string[] = [];
          for (const el of document.querySelectorAll('body *')) {
            for (const pseudo of [null, '::before', '::after'] as const) {
              const s = getComputedStyle(el, pseudo);
              if (/paint-[rby][hv]/.test(s.backgroundImage) && s.display !== 'none' && visible(el)) painted.push(`${el.tagName.toLowerCase()}.${el.className}${pseudo ?? ''}`);
            }
          }
          const hosts = [...document.querySelectorAll('[data-paint-text]')].filter(visible).map((el) => {
            const s = getComputedStyle(el);
            return { el: el.className || el.tagName, border: Math.min(...['Top', 'Right', 'Bottom', 'Left'].map((side) => parseFloat(s.getPropertyValue(`border-${side.toLowerCase()}-width`)))), mask: s.getPropertyValue('-webkit-mask-box-image-source') || 'none' };
          });
          const decor = [...document.querySelectorAll('.ed-mc, .ed-spread__y, .ed-spread__sq')].filter(visible).map((el) => el.className);
          const frames = [...document.querySelectorAll('.ed-folio__n, .ed-chip, .ed-btn, .tag-filter__btn')].filter(visible).filter((el) => parseFloat(getComputedStyle(el).borderTopWidth) < 1).map((el) => el.className);
          return { painted: painted.slice(0, 8), hosts, decor: decor.slice(0, 8), frames: frames.slice(0, 8) };
        });
        expect(found.painted, `${route} ${colorScheme}: brush paint still drawn`).toEqual([]);
        expect(found.decor, `${route} ${colorScheme}: decorative paint elements still shown`).toEqual([]);
        expect(found.frames, `${route} ${colorScheme}: unframed folios, chips or buttons`).toEqual([]);
        for (const h of found.hosts) {
          expect(h.border, `${route} ${colorScheme} ${h.el}: frame`).toBeGreaterThanOrEqual(1);
          expect(h.mask, `${route} ${colorScheme} ${h.el}: frayed mask`).toBe('none');
        }
      }
    }
    await page.emulateMedia({ forcedColors: 'active', colorScheme: 'dark' });
    await page.goto('/data/projects/', { waitUntil: 'networkidle' });
    await settle(page);
    const tags = page.locator('.tag-filter__btn');
    const idleBg = await tags.nth(1).evaluate((el) => getComputedStyle(el).backgroundColor);
    await tags.nth(1).click();
    await expect(tags.nth(1)).toHaveAttribute('aria-pressed', 'true');
    expect(await tags.nth(1).evaluate((el) => getComputedStyle(el).backgroundColor), 'pressed tag differs').not.toBe(idleBg);
  });
});

