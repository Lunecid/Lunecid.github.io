import { test, expect, dataPath, settle } from './helpers';

const HOMES = [
  { route: dataPath('/'), name: '백성은', headline: '데이터 분석가', tagline: '질문을 데이터로 바꾸고, 결과를 결정으로 잇습니다.' },
  { route: dataPath('/', 'en'), name: 'Seongeun Baek', headline: 'Data Analyst', tagline: 'I turn questions into data, and results into decisions.' },
];

for (const home of HOMES) {
  test(`${home.route}: hero, then featured projects, research highlight, news, profile — one filled button`, async ({ page }) => {
    await page.goto(home.route, { waitUntil: 'networkidle' });
    await expect(page.locator('#hero-name')).toHaveText(home.name);
    await expect(page.locator('.dhero__headline')).toHaveText(home.headline);
    await expect(page.locator('.dhero__tagline')).toHaveText(home.tagline);
    const ids = await page.locator('main section[id]').evaluateAll((els) => els.map((el) => el.id));
    expect(ids).toEqual(['featured-projects', 'research-highlight', 'patch-notes', 'hello']);
    await expect(page.locator('#main-menu, .hero, .mm-sec, .pn__ver')).toHaveCount(0);
    await expect(page.locator('main .ed-btn--fill')).toHaveCount(1);
    await expect(page.locator('#featured-projects li.ed-card')).toHaveCount(3); // DS-4 (named): cards, not rows
  });

  test(`${home.route}: name, CV link and the first project within two screens (success criterion 1)`, async ({ page }) => {
    for (const viewport of [{ width: 375, height: 812 }, { width: 1280, height: 720 }]) {
      await page.setViewportSize(viewport);
      await page.goto(home.route, { waitUntil: 'networkidle' });
      await settle(page);
      await page.evaluate(() => window.scrollTo(0, 0));
      const limit = 2 * viewport.height;
      const top = (selector: string) => page.locator(selector).first().evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
      expect(await top('#hero-name'), `${viewport.width}: name`).toBeLessThan(limit);
      expect(await top('.data-nav__cv'), `${viewport.width}: CV`).toBeLessThan(limit);
      expect(await top('#featured-projects li.ed-card'), `${viewport.width}: first project`).toBeLessThan(limit);
    }
  });
}

for (const home of HOMES) {
  test(`DS-4 ${home.route}: order hero → featured → research → news → profile; one filled button; badges and tiles visible at 375 and 1280`, async ({ page }) => {
    for (const width of [375, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(home.route, { waitUntil: 'networkidle' });
      await settle(page);
      const order = await page.locator('main > *').evaluateAll((els) =>
        els.filter((el) => el.matches('section')).map((el) => (el.matches('.ed-hero') ? 'hero' : el.id)),
      );
      expect(order, `${width}`).toEqual(['hero', 'featured-projects', 'research-highlight', 'patch-notes', 'hello']);
      await expect(page.locator('main .ed-btn--fill')).toHaveCount(1);
      await expect(page.locator('.ed-hero .ed-stat')).toHaveCount(3);
      await expect(page.locator('#research-highlight .ed-stat')).toHaveCount(3);
      await expect(page.locator('#research-highlight .ed-stamp')).toHaveCount(1);
      for (const selector of ['.ed-hero__bars', '.ed-hero .ed-stats', '#research-highlight .ed-stats', '.ed-now__label', '.ed-spread__tab']) {
        const box = await page.locator(selector).first().boundingBox();
        expect(box, `${width} ${selector}`).not.toBeNull();
        expect(box!.width, `${width} ${selector}`).toBeGreaterThan(0);
        expect(box!.x + box!.width, `${width} ${selector} inside the page`).toBeLessThanOrEqual(width + 0.5);
      }
      // the badge becomes visible once it is scrolled to (the one-time reveal never leaves it hidden)
      await page.locator('#research-highlight .ed-stamp').scrollIntoViewIfNeeded();
      await expect(page.locator('#research-highlight .ed-stamp')).toBeVisible();
      await expect.poll(() => page.locator('#research-highlight .ed-stamp').evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
      expect(await page.evaluate(() => document.documentElement.scrollWidth), `${width}: no horizontal scroll`).toBeLessThanOrEqual(width);
    }
  });
}
