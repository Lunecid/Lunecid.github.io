import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { load } from 'js-yaml';
import { test, expect, NAV_HEIGHT } from './helpers';
import { ANCHORS } from '../../src/lib/routes';
import { t } from '../../src/i18n/utils';
import type { Lang } from '../../src/i18n/ui';

const LANGS: Lang[] = ['ko', 'en'];

/** Waits for the CRT intro (home only) to finish and for web fonts, so positions are final. */
async function settle(page: Page): Promise<void> {
  await page.waitForFunction(() => !document.documentElement.hasAttribute('data-intro'));
  await page.evaluate(() => document.fonts.ready.then(() => true));
}

/** Viewport position of #id and the bottom edge of the sticky HUD nav; null when #id does not exist. */
async function landing(page: Page, id: string) {
  return page.evaluate((targetId) => {
    const el = document.getElementById(targetId);
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const nav = document.querySelector('.hud-nav');
    return {
      top: rect.top,
      height: rect.height,
      navBottom: nav ? nav.getBoundingClientRect().bottom : 0,
      innerHeight: window.innerHeight,
    };
  }, id);
}

test.describe('every ANCHORS target exists and sits below the sticky nav (ko + en)', () => {
  for (const [koPath, ids] of Object.entries(ANCHORS)) {
    for (const lang of LANGS) {
      const path = lang === 'en' ? `/en${koPath}` : koPath;
      test(path, async ({ page }) => {
        // One full page load per id (/records/ has 12): about 12 s locally, so a slower CI runner would hit the 30 s default.
        test.setTimeout(120_000);
        for (const id of ids) {
          // The query string forces a real page load per id; a hash-only change would be a same-document jump.
          const response = await page.goto(`${path}?anchor=${id}#${id}`, { waitUntil: 'load' });
          expect(response?.status(), path).toBe(200);
          await settle(page);
          const box = await landing(page, id);
          expect(box, `${path}#${id} exists`).not.toBeNull();
          expect(box!.height, `${path}#${id} is rendered`).toBeGreaterThan(0);
          expect(box!.top, `${path}#${id} is not hidden under the sticky nav`).toBeGreaterThanOrEqual(
            Math.max(NAV_HEIGHT, box!.navBottom) - 1,
          );
          expect(box!.top, `${path}#${id} is inside the viewport`).toBeLessThan(box!.innerHeight);
        }
      });
    }
  }
});

test.describe('hero job-fit CTA lands on the job-fit heading', () => {
  for (const lang of LANGS) {
    test(lang, async ({ page }) => {
      const prefix = lang === 'en' ? '/en' : '';
      await page.goto(`${prefix}/`, { waitUntil: 'load' });
      await settle(page);
      const cta = page.locator('main').getByRole('link', { name: t(lang, 'action.viewJobFit') }).first();
      await expect(cta).toHaveAttribute('href', `${prefix}/records/#job-fit`);
      await cta.click();
      await page.waitForURL(`**${prefix}/records/#job-fit`);
      await page.waitForLoadState('load');
      await settle(page);
      const heading = page.locator('#job-fit h2').first();
      await expect(heading).toContainText(t(lang, 'jobfit.title'));
      const pos = await heading.evaluate((h) => {
        const rect = h.getBoundingClientRect();
        const nav = document.querySelector('.hud-nav');
        return {
          top: rect.top,
          bottom: rect.bottom,
          navBottom: nav ? nav.getBoundingClientRect().bottom : 0,
          innerHeight: window.innerHeight,
        };
      });
      expect(pos.top, 'job-fit heading is not under the sticky nav').toBeGreaterThanOrEqual(Math.max(NAV_HEIGHT, pos.navBottom) - 1);
      expect(pos.bottom, 'job-fit heading is fully inside the viewport').toBeLessThanOrEqual(pos.innerHeight);
    });
  }
});

test.describe('/records/ and /en/records/ show the tagline', () => {
  const resume = load(readFileSync(join(process.cwd(), 'src', 'data', 'resume.yaml'), 'utf8')) as {
    profile: { tagline: Record<Lang, string> };
  };
  for (const lang of LANGS) {
    test(lang, async ({ page }) => {
      const response = await page.goto(lang === 'en' ? '/en/records/' : '/records/');
      expect(response?.status()).toBe(200);
      await expect(page.locator('#profile')).toContainText(resume.profile.tagline[lang]);
    });
  }
});
