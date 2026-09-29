import AxeBuilder from '@axe-core/playwright';
import { test, expect, builtRoutes, collectProblems } from './helpers';
import { GOATCOUNTER } from '../../src/config';
import { allRoutes } from '../../src/lib/routes';
import { containsTrademark } from '../../src/lib/seo';

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

for (const route of builtRoutes()) {
  test(`smoke ${route}: 200, one h1, html lang, no errors, axe clean, og:image resolves, title has no trademark, links end with / or an extension`, async ({ page }) => {
    const problems = collectProblems(page);
    const response = await page.goto(route, { waitUntil: 'networkidle' });
    expect(response?.status(), route).toBe(200);
    // Home plays the CRT intro once per session (≤ 700 ms); audit the finished page.
    await page.waitForFunction(() => !document.documentElement.hasAttribute('data-intro'));

    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('html')).toHaveAttribute('lang', route.startsWith('/en/') ? 'en' : 'ko');

    const title = await page.title();
    expect(containsTrademark(title), `<title> "${title}" names a game trademark`).toBe(false);

    const axe = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(
      axe.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`),
      'axe violations',
    ).toEqual([]);

    const ogImages = await page
      .locator('meta[property="og:image"]')
      .evaluateAll((metas) => metas.map((m) => m.getAttribute('content') ?? ''));
    expect(ogImages.length, 'og:image meta present').toBeGreaterThan(0);
    for (const og of ogImages) {
      const res = await page.request.get(new URL(og).pathname);
      expect(res.status(), og).toBe(200);
      expect(res.headers()['content-type'], og).toContain('image/png');
    }

    const hrefs = await page
      .locator("a[href^='/']:not([href^='//'])")
      .evaluateAll((anchors) => anchors.map((a) => a.getAttribute('href') ?? ''));
    const unslashed = hrefs.filter((href) => {
      const { pathname } = new URL(href, 'http://127.0.0.1');
      return !(pathname.endsWith('/') || /\.[a-z0-9]+$/i.test(pathname));
    });
    expect(unslashed, 'internal links end with "/" or a file extension').toEqual([]);

    expect(problems, problems.join('\n')).toEqual([]);
  });
}

test('OG endpoints return 1200×630 PNGs', async ({ request }) => {
  for (const path of ['/og/home.png', '/og/en/home.png', '/og/game/projects/kickick-park.png', '/og/en/game/research/cog-2026-engagement.png']) {
    const res = await request.get(path);
    expect(res.status(), path).toBe(200);
    expect(res.headers()['content-type'], path).toContain('image/png');
    const png = await res.body();
    expect(png.readUInt32BE(16), `${path} width`).toBe(1200);
    expect(png.readUInt32BE(20), `${path} height`).toBe(630);
  }
});

test('robots.txt disallows /print/ and names the sitemap', async ({ request }) => {
  const res = await request.get('/robots.txt');
  expect(res.status()).toBe(200);
  const text = await res.text();
  expect(text).toMatch(/^Disallow: \/print\/$/m);
  expect(text).toContain('Sitemap: https://lunecid.github.io/sitemap-index.xml');
});

test('sitemap lists ko and en pages and no /print/ route', async ({ request }) => {
  expect((await request.get('/sitemap-index.xml')).status()).toBe(200);
  const res = await request.get('/sitemap-0.xml');
  expect(res.status()).toBe(200);
  const xml = await res.text();
  expect(xml).toContain('<loc>https://lunecid.github.io/</loc>');
  expect(xml).toContain('<loc>https://lunecid.github.io/en/</loc>');
  expect(xml).toContain('<loc>https://lunecid.github.io/game/</loc>');
  expect(xml).toContain('<loc>https://lunecid.github.io/data/</loc>');
  expect(xml).not.toContain('/print/');
});

test.describe('projects tag filter (P2-8)', () => {
  test('tags with fewer than 2 projects are hidden entirely; the rest filter and All restores them', async ({ page }) => {
    await page.goto('/game/projects/');
    const all = page.locator('#project-grid > [data-tags]');
    const visible = page.locator('#project-grid > [data-tags]:not([hidden])');
    await expect(all).toHaveCount(6);
    const group = page.getByRole('group', { name: '태그로 거르기' });
    // geospatial/cv/web/gamification/stats each have exactly one project and nlp has none; all are hidden (P2-8):
    // 전체 + 머신러닝/공공데이터/시각화/데이터 수집 = 5 buttons (down from 11).
    await expect(group.getByRole('button')).toHaveCount(5);
    await expect(group.getByRole('button', { name: '자연어 처리', exact: true })).toHaveCount(0);
    const ml = group.getByRole('button', { name: '머신러닝', exact: true });
    await ml.click();
    await expect(ml).toHaveAttribute('aria-pressed', 'true');
    await expect(visible).toHaveCount(4);
    await group.getByRole('button', { name: '전체', exact: true }).click();
    await expect(visible).toHaveCount(6);
    await ml.click();
    await ml.click();
    await expect(group.getByRole('button', { name: '전체', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(visible).toHaveCount(6);
  });

  test('the selection lives in ?tag= and survives reload, and reappears after visiting a project and going back', async ({ page }) => {
    await page.goto('/en/game/projects/');
    const group = page.getByRole('group', { name: 'Filter by tag' });
    const status = page.locator('[data-tag-filter-status]');
    const viz = group.getByRole('button', { name: 'Visualization', exact: true });
    await viz.click();
    await expect(page).toHaveURL(/[?&]tag=viz(&|$)/);
    await expect(status).toHaveText('3 projects');

    await page.reload({ waitUntil: 'networkidle' });
    await expect(viz).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#project-grid > [data-tags]:not([hidden])')).toHaveCount(3);

    // history.replaceState (controller ruling 5) never creates its own back-traversable entry between two tag
    // selections on the same page; "restored on … back" means: leave for a project, then return.
    await page.locator('#project-grid > [data-tags]:not([hidden]) .cart__link').first().click();
    await page.waitForURL(/\/en\/game\/projects\/[a-z0-9-]+\/$/);
    await page.goBack();
    await expect(page).toHaveURL(/[?&]tag=viz(&|$)/);
    await expect(viz).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#project-grid > [data-tags]:not([hidden])')).toHaveCount(3);
  });

  test('fix round 1 minor: the status region stays silent on initial load, even restoring a valid ?tag=', async ({ page }) => {
    await page.goto('/en/game/projects/?tag=viz');
    const status = page.locator('[data-tag-filter-status]');
    await expect(page.getByRole('button', { name: 'Visualization', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#project-grid > [data-tags]:not([hidden])')).toHaveCount(3);
    // The live region never announced anything: restoring state on load is not something the visitor did.
    await expect(status).toBeEmpty();
    // A real, user-driven change afterwards does announce.
    await page.getByRole('button', { name: 'All', exact: true }).click();
    await expect(status).toHaveText('6 projects');
  });

  test('fix round 2 item 8: a hash-only popstate (e.g. a skip link) does not re-announce the filter', async ({ page }) => {
    await page.goto('/en/game/projects/?tag=viz');
    const status = page.locator('[data-tag-filter-status]');
    await expect(page.getByRole('button', { name: 'Visualization', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(status).toBeEmpty(); // silent on load, as above

    // A same-page #hash history entry (what a skip link, or any in-page anchor, pushes) fires popstate on
    // history.back() too, even though ?tag= never changed — this used to re-announce "3 projects" for no reason.
    await page.evaluate(() => history.pushState(null, '', `${location.pathname}${location.search}#main`));
    await page.goBack();
    await expect(page).toHaveURL(/[?&]tag=viz(&|$)/);
    await expect(status, 'no announcement: the tag filter itself never changed').toBeEmpty();
    await expect(page.getByRole('button', { name: 'Visualization', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#project-grid > [data-tags]:not([hidden])')).toHaveCount(3);
  });

  test('fix round 1 minor: an unknown ?tag= shows All and is dropped from the address bar', async ({ page }) => {
    await page.goto('/game/projects/?tag=does-not-exist');
    await expect(page.getByRole('group', { name: '태그로 거르기' }).getByRole('button', { name: '전체', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.locator('#project-grid > [data-tags]:not([hidden])')).toHaveCount(6);
    await expect(page).toHaveURL(/\/game\/projects\/$/);
    expect(new URL(page.url()).searchParams.has('tag')).toBe(false);
  });
});

test('unknown route serves GAME OVER', async ({ page }) => {
  const res = await page.goto('/no-such-page/');
  expect(res?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('GAME OVER');
  await expect(page.getByText('페이지를 찾을 수 없습니다')).toBeVisible();
  await expect(page.getByText('CONTINUE?', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: '처음으로', exact: true })).toHaveAttribute('href', '/game/');
  await expect(page.getByRole('link', { name: '프로젝트 보기', exact: true })).toHaveAttribute('href', '/game/projects/');
  await expect(page.locator('meta[http-equiv="refresh"]')).toHaveCount(0);
  await expect(page.locator('link[hreflang]')).toHaveCount(0);
  const url = page.url();
  await page.waitForTimeout(3000); // no auto-redirect (spec §5)
  expect(page.url()).toBe(url);
  expect(await page.evaluate(() => location.pathname)).toBe('/no-such-page/');
});

test("stores achievement 'game-over' in sb:achievements after AchievementHost hydrates", async ({ page }) => {
  await page.goto('/no-such-page/');
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          try {
            return JSON.parse(localStorage.getItem('sb:achievements') ?? '{}')['game-over'] ?? null;
          } catch {
            return null;
          }
        }),
      { timeout: 10_000 },
    )
    .toBeTruthy();
});

for (const width of [375, 320]) {
  test.describe(`legal pages at ${width} px`, () => {
    test.use({ viewport: { width, height: 812 } });

    test('notice tables fit the text column without a scroll region; axe clean', async ({ page }) => {
      // builtRoutes(): a route deleted from dist on purpose (Task 29a's negative check) is left to the route-count test.
      for (const route of ['/privacy/', '/credits/', '/en/privacy/', '/en/credits/'].filter((r) => builtRoutes().includes(r))) {
        await page.goto(route, { waitUntil: 'networkidle' });
        await page.evaluate(() => document.fonts.ready.then(() => true));
        // A scrolling table would need tabindex/role/label (axe scrollable-region-focusable): the legal tables never scroll.
        const problems = await page.locator('article.legal').evaluate((article) => {
          const found: string[] = [];
          const right = article.getBoundingClientRect().right - parseFloat(getComputedStyle(article).paddingRight);
          for (const el of Array.from(article.querySelectorAll('*'))) {
            const x = getComputedStyle(el).overflowX;
            if (x === 'auto' || x === 'scroll') found.push(`<${el.tagName.toLowerCase()}> scrolls (overflow-x: ${x})`);
          }
          for (const table of Array.from(article.querySelectorAll('table'))) {
            const end = table.getBoundingClientRect().right;
            if (end > right + 1) found.push(`<table> ends at ${Math.round(end)}px, text column at ${Math.round(right)}px`);
          }
          return found;
        });
        expect(problems, route).toEqual([]);
        const axe = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
        expect(
          axe.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`),
          `${route} axe violations`,
        ).toEqual([]);
      }
    });
  });
}

test('/stats/ shows the live total from the counter fixture when a code is set', async ({ page }) => {
  test.skip(GOATCOUNTER.code === null, 'GoatCounter site code is null: the site does not collect statistics yet');
  for (const route of ['/stats/', '/en/stats/']) {
    await page.goto(route);
    // helpers.ts fulfils **/counter/TOTAL.json with { count: '1 234' } → parseCount → formatNumber (ko-KR and en-US both print 1,234)
    await expect(page.locator('.stats__live')).toContainText('1,234');
  }
});

test.describe('stats page at 375 px', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('every horizontal scroller is a focusable, named region; axe clean', async ({ page }) => {
    // builtRoutes(): a route deleted from dist on purpose (Task 29a's negative check) is left to the route-count test.
    for (const route of ['/stats/', '/en/stats/'].filter((r) => builtRoutes().includes(r))) {
      await page.goto(route, { waitUntil: 'networkidle' });
      // Open the daily "view as table" fallback (built only with usable stats) so axe sees its scroll wrapper.
      await page.locator('#daily details').evaluateAll((els) => els.forEach((d) => d.setAttribute('open', '')));
      const unreachable = await page.locator('main').evaluate((main) =>
        Array.from(main.querySelectorAll('*'))
          .filter((el) => ['auto', 'scroll'].includes(getComputedStyle(el).overflowX))
          .filter((el) => !(el.getAttribute('tabindex') === '0' && el.getAttribute('role') === 'region' && el.hasAttribute('aria-labelledby')))
          .map((el) => `<${el.tagName.toLowerCase()} class="${el.getAttribute('class') ?? ''}">`),
      );
      expect(unreachable, route).toEqual([]);
      const axe = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      expect(
        axe.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`),
        `${route} axe violations`,
      ).toEqual([]);
    }
  });
});

test('every route of the table is built', () => {
  const built = builtRoutes();
  expect(built, `built routes: ${built.join(' ')}`).toEqual(allRoutes());
});
