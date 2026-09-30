import { test, expect, basePathOf, builtRoutes, dataPath, horizontalOverflow, settle } from './helpers';

const NAVY = 'rgb(30, 58, 138)';

test.describe('general pages use the editorial layout (P2-2)', () => {
  for (const route of [dataPath('/'), dataPath('/records/', 'en')]) {
    test(`${route}: light scheme, white body, navy focus ring, ink skip link, no mono file`, async ({ page }) => {
      const fonts: string[] = [];
      page.on('request', (req) => { if (req.url().includes('/_astro/') && req.url().endsWith('.woff2')) fonts.push(req.url()); });
      await page.goto(route, { waitUntil: 'networkidle' });
      await settle(page);
      await expect(page.locator('html')).toHaveAttribute('data-variant', 'data');
      expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe('light');
      expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(255, 255, 255)');
      await page.keyboard.press('Tab');
      const skip = page.locator('.skip-link');
      await expect(skip).toBeFocused();
      expect(await skip.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(20, 20, 20)');
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => getComputedStyle(document.activeElement as Element).outlineColor)).toBe(NAVY);
      expect(fonts.filter((url) => url.includes('jetbrains-mono'))).toEqual([]);
      // P1-9b root marker (binding, contract §1.8); AchievementHost and BgmToggle are .astro after P1-9b.
      await expect(page.locator('.crt, .bgm, [data-achievement-host], .ach-toast, .hud-nav')).toHaveCount(0);
    });
  }
});

test.describe('DataNav', () => {
  test('375px: the menu opens, traps Tab, closes on Escape and returns focus', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(dataPath('/records/'), { waitUntil: 'networkidle' });
    const toggle = page.locator('[data-data-nav] [data-nav-toggle]');
    await toggle.click();
    await expect(page.locator('[data-data-nav]')).toHaveAttribute('data-open', 'true');
    await expect(page.locator('#data-menu')).toBeVisible();
    for (let i = 0; i < 12; i += 1) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => (document.activeElement as Element).closest('[data-data-nav]') !== null)).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-data-nav]')).toHaveAttribute('data-open', 'false');
    await expect(toggle).toBeFocused();
  });

  test('320px: the bar stays on one line (switches live in the panel below 734px)', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    for (const route of [dataPath('/'), dataPath('/', 'en')]) {
      await page.goto(route, { waitUntil: 'networkidle' });
      const height = await page.locator('.data-nav__bar').evaluate((el) => el.getBoundingClientRect().height);
      expect(height, route).toBeLessThanOrEqual(53);
    }
  });

  test('the version switch goes to the same page of the game version and remembers the choice', async ({ page }) => {
    await page.goto(`${dataPath('/records/')}#skills`, { waitUntil: 'networkidle' });
    await page.locator('.data-nav__tools [data-switch-variant="game"]').click();
    await expect(page).toHaveURL(/\/game\/records\/#skills$/);
    expect(await page.evaluate(() => localStorage.getItem('sb:variant'))).toBe('game');
  });
});

// P-05 / N01 for DataNav (the 320×256 scroll check and the stable toggle width) lives in responsive.spec.ts, next to the
// game describes it mirrors: this spec runs on the desktop project only (playwright.config.ts testMatch).

test.describe('general case studies without read.css (P2-9, D-7)', () => {
  test('320px: wide tables and code scroll inside their own box, never the page', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    const studies = builtRoutes({ variant: 'data' }).filter((route) => /^\/projects\/[a-z0-9-]+\/$/.test(basePathOf(route).base));
    expect(studies.length, 'general case studies').toBeGreaterThan(0);
    let tables = 0;
    for (const route of studies) {
      await page.goto(route, { waitUntil: 'networkidle' });
      const body = page.locator('main article.ed-prose');
      const boxes = await body.evaluate((article) => Array.from(article.querySelectorAll('.prose-table, pre')).map((el) => getComputedStyle(el).overflowX));
      expect(boxes.filter((overflow) => overflow !== 'auto'), `${route}: a table or code box that does not scroll`).toEqual([]);
      tables += await body.locator('.prose-table').count();
      const o = await horizontalOverflow(page);
      expect(o.scrollWidth, `${route}: ${o.offenders.join(', ')}`).toBeLessThanOrEqual(o.width);
    }
    expect(tables, 'at least one general case study has a Markdown table').toBeGreaterThan(0);
    // 5c54b03 / final-fix2 item 19: no automatic hyphenation in prose table cells (Linux Chromium splits syllables).
    await page.goto('/en/data/projects/youth-startup-location/', { waitUntil: 'networkidle' });
    expect(await page.locator('main article.ed-prose td').first().evaluate((el) => getComputedStyle(el).hyphens)).toBe('manual');
  });
});
