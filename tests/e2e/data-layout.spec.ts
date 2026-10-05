import { test, expect, basePathOf, builtRoutes, dataPath, horizontalOverflow, settle } from './helpers';

// DS-2 (named change): the focus ring takes --ed-focus (v5.1: ink), no longer the P2 navy.
const INK = 'rgb(20, 20, 20)';

test.describe('general pages use the editorial layout (P2-2)', () => {
  for (const route of [dataPath('/'), dataPath('/records/', 'en')]) {
    test(`${route}: light scheme, white body, ink focus ring, ink skip link, no mono file`, async ({ page }) => {
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
      expect(await page.evaluate(() => getComputedStyle(document.activeElement as Element).outlineColor)).toBe(INK);
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

test.describe('DS-3: the v5 frame', () => {
  test('DS-3: 1280 — rail and main columns line up on every data page (rail right edge = section numbers column)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    let checked = 0;
    for (const route of builtRoutes({ variant: 'data' })) {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      const geo = await page.evaluate(() => {
        const box = (el: Element | null) => (el ? el.getBoundingClientRect() : null);
        const rails = Array.from(document.querySelectorAll('main .ed-sh > .ed-rail')).map((rail) => {
          const sh = rail.parentElement!;
          const r = box(rail)!;
          return { right: Math.round(r.right), left: Math.round(r.left), n: Math.round(box(rail.querySelector('.ed-rail__n'))!.left), title: Math.round(box(sh.querySelector(':scope > .ed-head__title'))!.left), id: sh.querySelector(':scope > .ed-head__title')?.id ?? '' };
        });
        const tblock = box(document.querySelector('main .ed-tblock'));
        const main = box(document.querySelector('main .ed-phead__main'));
        return { rails, tblock: tblock && { left: Math.round(tblock.left), right: Math.round(tblock.right) }, main: main && Math.round(main.left) };
      });
      if (geo.rails.length === 0 && !geo.tblock) continue;
      checked += 1;
      const lefts = [...geo.rails.map((r) => r.left), ...(geo.tblock ? [geo.tblock.left] : [])];
      const rights = [...geo.rails.map((r) => r.right), ...(geo.tblock ? [geo.tblock.right] : [])];
      const mains = [...geo.rails.map((r) => r.title), ...(geo.main !== null ? [geo.main] : [])];
      expect(Math.max(...lefts) - Math.min(...lefts), `${route}: rail left edges ${lefts}`).toBeLessThanOrEqual(1);
      expect(Math.max(...rights) - Math.min(...rights), `${route}: rail right edges ${rights}`).toBeLessThanOrEqual(1);
      expect(Math.max(...mains) - Math.min(...mains), `${route}: main column ${mains}`).toBeLessThanOrEqual(1);
      for (const r of geo.rails) {
        expect(r.n, `${route} #${r.id}: the number sits in the rail`).toBe(r.left);
        expect(r.title, `${route} #${r.id}: the title starts right of the rail`).toBeGreaterThan(r.right);
      }
    }
    expect(checked).toBeGreaterThanOrEqual(12);
  });

  test('DS-3: no opener in the first viewport is hidden at load; scrolling reveals each once; JS off shows all', async ({ page, browser }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(dataPath('/records/'), { waitUntil: 'networkidle' });
    const state = () =>
      page.evaluate(() =>
        Array.from(document.querySelectorAll('main .ed-sh')).map((sh) => {
          const title = sh.querySelector(':scope > .ed-head__title')!;
          return { id: title.id, top: title.getBoundingClientRect().top + scrollY, waiting: sh.classList.contains('is-waiting'), shown: sh.classList.contains('is-in'), opacity: Number(getComputedStyle(title).opacity) };
        }),
      );
    const atLoad = await state();
    expect(atLoad.length).toBeGreaterThan(4);
    for (const s of atLoad) {
      if (s.top < 720) expect(s.waiting || s.opacity < 1, `${s.id} on the first screen waits`).toBe(false);
      else expect(s.waiting, `${s.id} below the first screen waits`).toBe(true);
    }
    // the sections' content itself never waits, only the opener's own boxes
    expect(await page.locator('main .ed-sec .ed-list').first().evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
    for (const s of atLoad.filter((x) => x.top >= 720)) {
      await page.locator(`#${s.id}`).scrollIntoViewIfNeeded();
      await expect.poll(async () => (await state()).find((x) => x.id === s.id)?.opacity, s.id).toBe(1);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    expect((await state()).filter((s) => s.waiting)).toEqual([]); // once: nothing hides again
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1280, height: 720 } });
    const nojs = await context.newPage();
    await nojs.goto(dataPath('/records/'), { waitUntil: 'networkidle' });
    const hidden = await nojs.evaluate(() => Array.from(document.querySelectorAll('main .ed-sh > *, main .ed-rail__in')).filter((el) => getComputedStyle(el).opacity !== '1' || document.querySelector('.is-waiting')).length);
    expect(hidden).toBe(0);
    await context.close();
  });
});
