import type { Page } from '@playwright/test';
import { test, expect, NAV_HEIGHT, gamePath, settle } from './helpers';
import { allRoutes, anchorsFor, parseRoute } from '../../src/lib/routes';
import { t } from '../../src/i18n/utils';
import type { Lang } from '../../src/i18n/ui';
import { resolveIdentity } from '../../src/variants';
import { gameVariant } from '../../src/variants/game';
import { loadFactSource } from '../helpers/fact-source';

const LANGS: Lang[] = ['ko', 'en'];

/** Viewport position of #id and the bottom edge of the sticky HUD nav; null when #id does not exist. */
async function landing(page: Page, id: string) {
  return page.evaluate((targetId) => {
    const el = document.getElementById(targetId);
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const nav = document.querySelector('.hud-nav, .data-nav');
    return {
      top: rect.top,
      height: rect.height,
      navBottom: nav ? nav.getBoundingClientRect().bottom : 0,
      innerHeight: window.innerHeight,
    };
  }, id);
}

test.describe('every anchor of every route exists and sits below the sticky nav', () => {
  for (const path of allRoutes()) {
    const info = parseRoute(path)!;
    const ids = anchorsFor(info.base, info.variant);
    if (ids.length === 0) continue;
    test(path, async ({ page }) => {
      // One full page load per id (/game/records/ has 12): about 12 s locally, so a slower CI runner would hit the 30 s default.
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
});

test.describe('hero job-fit CTA lands on the job-fit heading', () => {
  for (const lang of LANGS) {
    test(lang, async ({ page }) => {
      const jobFit = `${gamePath('/records/', lang)}#job-fit`;
      await page.goto(gamePath('/', lang), { waitUntil: 'load' });
      await settle(page);
      const cta = page.locator('main').getByRole('link', { name: t(lang, 'action.viewJobFit') }).first();
      await expect(cta).toHaveAttribute('href', jobFit);
      await cta.click();
      await page.waitForURL(`**${jobFit}`);
      await page.waitForLoadState('load');
      await settle(page);
      const heading = page.locator('#job-fit h2').first();
      await expect(heading).toContainText(t(lang, 'jobfit.title'));
      const pos = await heading.evaluate((h) => {
        const rect = h.getBoundingClientRect();
        const nav = document.querySelector('.hud-nav, .data-nav');
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

test.describe('/game/records/ and /en/game/records/ show the tagline', () => {
  const facts = loadFactSource();
  for (const lang of LANGS) {
    test(lang, async ({ page }) => {
      const response = await page.goto(gamePath('/records/', lang));
      expect(response?.status()).toBe(200);
      await expect(page.locator('#profile')).toContainText(resolveIdentity(gameVariant, lang, facts).tagline);
    });
  }
});

// T1 (motion audit): a figure reached through the body's "그림 N" link marks itself once — the game figure's corner
// marks lock on (cue-lock-*), the general figure draws an ink line over its top rule (cue-rule).
const CUE_PAGES = [
  { variant: 'game', path: '/game/projects/school-zone-blindspots/', names: ['cue-lock-br', 'cue-lock-tl'], num: '.figure__num' },
  { variant: 'data', path: '/data/projects/school-zone-blindspots/', names: ['cue-rule'], num: '.ed-figcap__num' },
] as const;
const cueNames = (page: Page, id: string) =>
  page.evaluate((targetId) => {
    const el = document.getElementById(targetId)!;
    return el.getAnimations({ subtree: true }).map((a) => (a as CSSAnimation).animationName).filter((n) => n.startsWith('cue-')).sort();
  }, id);
/** The colour `value` (a var() or keyword) resolves to inside #id. */
const resolved = (page: Page, id: string, value: string) =>
  page.evaluate(([targetId, v]) => {
    const probe = document.createElement('span');
    probe.style.color = v;
    document.getElementById(targetId)!.append(probe);
    const c = getComputedStyle(probe).color;
    probe.remove();
    return c;
  }, [id, value] as const);

test.describe('T1: in-page arrival cue', () => {
  test('T1: following a "그림 N" link plays the cue once on the target figure (game and general)', async ({ page }) => {
    for (const c of CUE_PAGES) {
      await page.goto(c.path, { waitUntil: 'load' });
      await settle(page);
      const link = page.locator('main a[href="#figure-2"]').first();
      expect(await cueNames(page, 'figure-2'), c.variant).toEqual([]);
      // the cue's own clock: every animationstart inside the figure (pseudo-elements included) is logged, so a short
      // cue that ends before a poll sample still counts
      await page.evaluate(() => {
        const w = window as Window & { __cueStarts?: string[] };
        w.__cueStarts = [];
        document.getElementById('figure-2')!.addEventListener('animationstart', (e) => {
          if (e.animationName.startsWith('cue-')) w.__cueStarts!.push(e.animationName);
        });
      });
      const starts = () => page.evaluate(() => [...((window as Window & { __cueStarts?: string[] }).__cueStarts ?? [])].sort());
      await link.click();
      await expect(page).toHaveURL(/#figure-2$/);
      await expect.poll(starts, { message: `${c.variant}: the cue runs` }).toEqual([...c.names]);
      // it ends (≈ 1.3 s at most) and a second click on the same link, the figure still targeted, does not replay it
      await expect.poll(() => cueNames(page, 'figure-2'), { timeout: 5000, message: `${c.variant}: the cue ends` }).toEqual([]);
      await link.click();
      await page.waitForTimeout(200);
      expect(await cueNames(page, 'figure-2'), `${c.variant}: no replay`).toEqual([]);
      expect(await starts(), `${c.variant}: started once`).toEqual([...c.names]);
    }
  });

  test('T1: reduced motion — no animation; the figure number gets an ink marker, its colour unchanged', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const c of CUE_PAGES) {
      await page.goto(c.path, { waitUntil: 'load' });
      await settle(page);
      const fig = page.locator('#figure-2');
      const num = fig.locator(c.num);
      const marker = () => num.evaluate((el) => {
        const cs = getComputedStyle(el, '::before');
        return { content: cs.content, width: parseFloat(cs.width) || 0, bg: cs.backgroundColor };
      });
      const idle = await num.evaluate((el) => getComputedStyle(el).color);
      expect((await marker()).content, `${c.variant}: no marker before the jump`).toBe('none');
      await page.locator('main a[href="#figure-2"]').first().click();
      await expect(page).toHaveURL(/#figure-2$/);
      await page.waitForTimeout(100);
      expect(await cueNames(page, 'figure-2'), c.variant).toEqual([]);
      // the number keeps its own (ink) colour; the cue is the square marker in that colour, never a link colour
      expect(await num.evaluate((el) => getComputedStyle(el).color), c.variant).toBe(idle);
      const ink = await resolved(page, 'figure-2', c.variant === 'game' ? 'var(--read-text)' : 'var(--ed-ink)');
      // Named change (GP-3): the case-study prose is a white panel where links are ink with a yellow strip, so the link
      // colour the cue must not take is the yellow
      const link = await resolved(page, 'figure-2', c.variant === 'game' ? 'var(--accent)' : 'var(--ed-accent)');
      const m = await marker();
      expect(m.width, `${c.variant}: marker box`).toBeGreaterThan(0);
      expect(m.bg, c.variant).toBe(ink);
      expect(m.bg, c.variant).not.toBe(link);
      if (c.variant === 'data') expect(await fig.evaluate((el) => getComputedStyle(el).borderTopColor)).toBe(ink);
    }
  });
});
