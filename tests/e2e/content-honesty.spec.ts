import { ACADEMIC_CV_HREF, CV_HREF, GOATCOUNTER } from '../../src/config';
import { STATS_META } from '../../src/data/copy/pages';
import { test, expect } from './helpers';

// Batch 3a (content facts): what the built pages show must match the owner decisions D-4, D-7, D-13 and P2-33.

test.describe('D-7: the nav CV button opens the document that fits the page', () => {
  const academic = ['/research/', '/en/research/', '/research/cog-2026-engagement/', '/en/research/cog-2026-engagement/'];
  const resume = ['/', '/en/', '/projects/', '/en/projects/', '/records/', '/en/records/', '/player-log/', '/en/player-log/'];

  for (const route of academic) {
    test(`${route} → Academic CV`, async ({ page }) => {
      await page.goto(route);
      const cv = page.locator('a.hud-nav__cv');
      await expect(cv).toHaveAttribute('href', ACADEMIC_CV_HREF);
      await expect(cv).toHaveAttribute('title', 'Academic CV (PDF)');
      await expect(cv).toHaveAccessibleName(/^CV\s*—\s*Academic CV \(PDF\)$/);
      await expect(cv.locator('[aria-hidden="true"]')).toHaveText('↓');
    });
  }

  for (const route of resume) {
    test(`${route} → résumé in the page language`, async ({ page }) => {
      await page.goto(route);
      const en = route.startsWith('/en/');
      const cv = page.locator('a.hud-nav__cv');
      await expect(cv).toHaveAttribute('href', en ? CV_HREF.en : CV_HREF.ko);
      await expect(cv).toHaveAttribute('title', en ? 'Résumé (PDF)' : '이력서 (PDF)');
    });
  }

  for (const route of ['/research/', '/en/research/']) {
    test(`${route} links the Academic CV under the header and in #for-labs`, async ({ page }) => {
      await page.goto(route);
      const headerCv = page.locator(`.page-head a[href="${ACADEMIC_CV_HREF}"]`);
      const forLabsCv = page.locator(`#for-labs a[href="${ACADEMIC_CV_HREF}"]`);
      await expect(headerCv).toHaveText(/Academic CV \(PDF\)/);
      await expect(forLabsCv).toHaveText(/Academic CV \(PDF\)/);
      // D-7: a real download, not a same-tab navigation to the PDF viewer.
      for (const link of [headerCv, forLabsCv]) {
        await expect(link).toHaveAttribute('download', '');
        await expect(link).toHaveAttribute('title', 'Academic CV (PDF)');
      }
      // Owner, 2026-09-28: the removed course project (linked to a paper under review) never appears as ongoing work.
      await expect(page.locator('#in-progress')).not.toContainText(/상담|counseling/i);
    });
  }
});

test.describe('D-13: the Player Log shows only what exists', () => {
  for (const route of ['/player-log/', '/en/player-log/']) {
    test(route, async ({ page }) => {
      await page.goto(route, { waitUntil: 'load' });
      await expect(page.locator('#favorite-games [role="tab"]')).toHaveCount(2);
      await expect(page.locator('#favorite-games [role="tab"][aria-disabled="true"]')).toHaveCount(0);
      await expect(page.locator('#game-achievements')).toHaveCount(0);
      await page.locator('#favorite-games').scrollIntoViewIfNeeded();
      await expect(page.locator('.fg__scene')).toHaveCount(1);
      await expect(page.locator('.fg-acct')).toHaveCount(0);
      await expect(page.locator('.page-head__intro')).not.toContainText(/파이프라인|pipeline/i);
      await expect(page.locator('#membership')).toBeVisible();
      await expect(page.locator('#site-achievements')).toBeVisible();
      // The BGM file ships, so the sound achievement is reachable and listed (8 in all).
      await expect(page.locator('#site-achievements [data-ach-id="sound-on"]')).toHaveCount(1);
      await expect(page.locator('#site-achievements [data-ach-id]')).toHaveCount(8);
      const hint = route.startsWith('/en/') ? 'Menu → 한국어' : '메뉴 → English';
      await expect(page.locator('#site-achievements [data-ach-id="bilingual"]')).toContainText(hint);
    });
  }
});

test.describe('P2-33: /stats/ says it is offline while no GoatCounter code is set', () => {
  for (const route of ['/stats/', '/en/stats/']) {
    test(route, async ({ page }) => {
      test.skip(GOATCOUNTER.code !== null, 'statistics are switched on');
      await page.goto(route);
      const lang = route.startsWith('/en/') ? 'en' : 'ko';
      const panel = page.locator('[data-stats-offline]');
      await expect(panel).toBeVisible();
      await expect(panel).toContainText('[ OFFLINE ]');
      await expect(panel.locator(`a[href="${lang === 'en' ? '/en/privacy/' : '/privacy/'}"]`)).toBeVisible();
      await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', STATS_META.offline[lang].description);
      await expect(page.locator('footer a[href$="/stats/"]')).toHaveCount(1); // the footer link stays
    });
  }
});

test.describe('D-4 and P1-8: project cards and case studies', () => {
  for (const route of ['/projects/', '/en/projects/']) {
    test(`${route}: KBO and Seoul apartment are link-less cards with a summary`, async ({ page }) => {
      await page.goto(route);
      const cards = page.locator('#project-grid .cart--static');
      await expect(cards).toHaveCount(2);
      await expect(cards.locator('a')).toHaveCount(0);
      await expect(cards.locator('.cart__summary')).toHaveCount(2);
      await expect(page.locator('a[href*="kbo-attendance"], a[href*="seoul-apartment-automl"]')).toHaveCount(0);
      const github = page.locator('#github');
      if ((await github.count()) > 0) {
        await expect(github).not.toContainText(/PUBG_Lab|AudioSync/);
        if (route.startsWith('/en/')) expect(await github.innerText()).not.toMatch(/[가-힣]/);
      }
    });
  }

  for (const route of ['/projects/school-zone-blindspots/', '/en/projects/kickick-park/', '/projects/youth-startup-location/']) {
    test(`${route}: "for game teams | research contribution" after the body`, async ({ page }) => {
      await page.goto(route);
      const en = route.startsWith('/en/');
      await expect(page.locator('#for-game-teams h2')).toHaveText(en ? 'For game teams' : '게임 팀에게');
      await expect(page.locator('#research-contribution h2')).toHaveText(en ? 'Research contribution' : '연구 기여');
      const bodyBottom = await page.locator('article.prose').evaluate((el) => el.getBoundingClientRect().bottom + window.scrollY);
      const blockTop = await page.locator('.audience').evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
      expect(blockTop).toBeGreaterThanOrEqual(bodyBottom - 1);
    });
  }
});
