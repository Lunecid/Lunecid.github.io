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
    await expect(page.locator('#featured-projects li.pli')).toHaveCount(3);
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
      expect(await top('#featured-projects li.pli'), `${viewport.width}: first project`).toBeLessThan(limit);
    }
  });
}
