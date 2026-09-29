import { test, expect, horizontalOverflow, NAV_HEIGHT } from './helpers';

test.describe('version switch (§5.5, §12)', () => {
  test('goes to the same page of the other version and remembers the choice', async ({ page }) => {
    await page.goto('/game/records/');
    const bar = page.locator('.hud-nav__tools a[data-switch-variant]');
    await expect(bar).toHaveAttribute('href', '/data/records/');
    await expect(bar).toHaveAccessibleName('일반 버전으로 보기');
    await bar.click();
    await expect(page).toHaveURL(/\/data\/records\/$/);
    expect(await page.evaluate(() => localStorage.getItem('sb:variant'))).toBe('data');
    await page.locator('.hud-nav__tools a[data-switch-variant]').click();
    await expect(page).toHaveURL(/\/game\/records\/$/);
    expect(await page.evaluate(() => localStorage.getItem('sb:variant'))).toBe('game');
  });

  test('a game-only page goes to the data home; the hash is kept only for the same page (A-26)', async ({ page }) => {
    await page.goto('/game/player-log/#favorite-games');
    await expect(page.locator('.hud-nav__tools a[data-switch-variant]')).toHaveAttribute('href', '/data/');
    await page.goto('/en/game/records/#job-fit');
    await expect(page.locator('.hud-nav__tools a[data-switch-variant]')).toHaveAttribute('href', '/en/data/records/#job-fit');
    // An image-viewer hash is never carried (2026-09-29 sync; contract §2.5: the switch lands with no dialog open).
    // A direct /data/records/#view-… link still opens the viewer (E11, P3-3 check 7); only the switch drops the hash.
    await page.goto('/game/records/#view-busan-mayor-award');
    await expect(page.locator('.hud-nav__tools a[data-switch-variant]')).toHaveAttribute('href', '/data/records/');
  });

  test('without JavaScript it is a plain link to the other version', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('/data/projects/');
    await expect(page.locator('.hud-nav__tools a[data-switch-variant]')).toHaveAttribute('href', '/game/projects/');
    await context.close();
  });

  for (const [width, height] of [[320, 640], [375, 812]] as const) {
    test(`${width}px: the bar stays one line and the switch is in the menu panel`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      for (const route of ['/game/records/', '/en/game/records/', '/data/records/', '/en/data/records/']) {
        await page.goto(route);
        const barHeight = await page.locator('.hud-nav__bar').evaluate((el) => el.getBoundingClientRect().height);
        expect(barHeight, route).toBeLessThanOrEqual(NAV_HEIGHT + 1);
        await expect(page.locator('.hud-nav__tools a[data-switch-variant]'), route).toBeHidden();
        await page.locator('[data-nav-toggle]').click();
        await expect(page.locator('#hud-menu a[data-switch-variant]'), route).toBeVisible();
      }
    });
  }

  for (const width of [768, 1068, 1180, 1200, 1280, 1600]) {
    test(`${width}px: no sideways scroll with the switch in the bar (ko and en)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      for (const route of ['/game/records/', '/en/game/records/', '/game/', '/en/game/', '/data/records/', '/en/data/records/']) {
        await page.goto(route);
        await page.evaluate(() => document.fonts.ready.then(() => true));
        const o = await horizontalOverflow(page);
        expect(o.scrollWidth, `${route}: ${o.offenders.join(', ')}`).toBeLessThanOrEqual(o.width);
        await expect(page.locator('.hud-nav__tools a[data-switch-variant]'), route).toBeVisible();
      }
    });
  }
});
