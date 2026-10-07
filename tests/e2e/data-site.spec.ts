// DS-9: the four prototyped general pages (ko + en) keep their structure at phone, tablet and desktop widths:
// landmarks, one h1 and no skipped heading level, the section ids of the DS-0 build, colour fields and display words
// out of the accessibility tree, at most one filled button and one badge per view, rails visible (above the heading on
// phones), no horizontal scroll, no console error. Then reduced motion on both paths (the OS and the page switch).
import type { Page } from '@playwright/test';
import { test, expect, builtHasId, dataPath, collectProblems, horizontalOverflow, settle } from './helpers';

/** DS-0's section ids (c5d8d7f build): the redesign keeps every one. */
const PAGES = [
  { base: '/', ids: ['featured-projects', 'research-highlight', 'patch-notes', 'hello'], fill: 1, badge: 1 },
  { base: '/projects/', ids: ['project-list'], fill: 0, badge: 0 },
  { base: '/projects/school-zone-blindspots/', ids: ['details', 'research-contribution', 'links'], fill: 0, badge: 1 },
  { base: '/records/', ids: ['profile', 'education', 'publications', 'projects', 'awards', 'inventory', 'skills', 'job-fit', 'documents'], fill: 1, badge: 0 },
] as const;
const WIDTHS = [375, 768, 1280] as const;

async function structure(page: Page) {
  return page.evaluate(() => {
    const shown = (el: Element): boolean => (el as HTMLElement).checkVisibility({ visibilityProperty: true });
    const levels = [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')].filter((h) => shown(h) || h.classList.contains('sr-only')).map((h) => Number(h.tagName[1]));
    const skips = levels.flatMap((l, i) => (i > 0 && l > levels[i - 1]! + 1 ? [`h${levels[i - 1]} → h${l}`] : []));
    const hiddenFromAt = (el: Element): boolean => el.closest('[aria-hidden="true"]') !== null;
    const fields = [...document.querySelectorAll('.ed-mc, .ed-mc > *, .ed-spread__y, .ed-spread__sq')];
    return {
      landmarks: { headerNav: document.querySelectorAll('header nav').length, main: document.querySelectorAll('main').length, footer: document.querySelectorAll('footer').length },
      h1: document.querySelectorAll('h1').length,
      skips,
      ids: [...document.querySelectorAll('main section[id]')].map((s) => s.id),
      fieldsExposed: fields.filter((el) => !hiddenFromAt(el)).map((el) => el.className),
      fieldsWithText: fields.filter((el) => (el.textContent ?? '').trim() !== '').map((el) => el.className),
      displayExposed: [...document.querySelectorAll('[data-display]')].filter((el) => !hiddenFromAt(el)).map((el) => el.textContent?.trim()),
      fills: [...document.querySelectorAll('main .ed-btn--fill')].filter(shown).length,
      badges: [...document.querySelectorAll('main .ed-stamp')].filter(shown).length,
      rails: [...document.querySelectorAll('main .ed-sh, main section')].flatMap((sec) => {
        const rail = sec.querySelector(':scope .ed-rail__in');
        const title = sec.querySelector(':scope .ed-head__title');
        if (!rail || !title || !shown(title)) return [];
        const r = rail.getBoundingClientRect();
        const t = title.getBoundingClientRect();
        return [{ id: sec.id || sec.className, visible: shown(rail) && r.width > 0 && r.height > 0, above: r.bottom <= t.top + 1, beside: r.right <= t.left + 1 }];
      }),
    };
  });
}

for (const { base, ids, fill, badge } of PAGES) {
  for (const lang of ['ko', 'en'] as const) {
    const route = dataPath(base, lang);
    test(`DS-9 ${route}: landmarks, headings, section ids, hidden decoration, one filled button and badge, rails, no overflow at 375/768/1280`, async ({ page }) => {
      const problems = collectProblems(page);
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(route, { waitUntil: 'networkidle' });
        await settle(page);
        const s = await structure(page);
        const at = `${route} @${width}`;
        expect(s.landmarks, `${at}: landmarks`).toEqual({ headerNav: 1, main: 1, footer: 1 });
        expect(s.h1, `${at}: one h1`).toBe(1);
        expect(s.skips, `${at}: heading levels never skip`).toEqual([]);
        // the GitHub section exists only when the build fetched GitHub data (CI with a token; GitHubSection.astro), last
        const gh = builtHasId(route, 'github') ? ['github'] : [];
        expect(s.ids, `${at}: the DS-0 section ids`).toEqual([...ids, ...gh]);
        expect(s.fieldsExposed, `${at}: colour fields aria-hidden`).toEqual([]);
        expect(s.fieldsWithText, `${at}: colour fields empty`).toEqual([]);
        expect(s.displayExposed, `${at}: display words aria-hidden`).toEqual([]);
        expect(s.fills, `${at}: filled buttons`).toBe(fill);
        expect(s.badges, `${at}: badges`).toBe(badge);
        for (const rail of s.rails) {
          expect(rail.visible, `${at} ${rail.id}: rail number and chip visible`).toBe(true);
          if (width < 734) expect(rail.above, `${at} ${rail.id}: rail above the heading on phones`).toBe(true);
          else expect(rail.beside || rail.above, `${at} ${rail.id}: rail in its column`).toBe(true);
        }
        const overflow = await horizontalOverflow(page);
        expect(overflow.scrollWidth, `${at}: horizontal scroll (${overflow.offenders.join(', ')})`).toBeLessThanOrEqual(overflow.width);
      }
      expect(problems, `${route}: console errors / failed requests`).toEqual([]);
    });
  }
}

// Reduced motion, both paths: nothing moves (no transform on any opener or badge at any point of the scroll), the
// openers only fade, the badge never waits.
for (const path of ['os', 'switch'] as const) {
  test(`DS-9: reduced motion (${path === 'os' ? 'prefers-reduced-motion' : 'the page switch'}) — no transform on data pages, openers fade only, the badge is simply there`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: path === 'os' ? 'reduce' : 'no-preference' });
    if (path === 'switch') await context.addInitScript(() => localStorage.setItem('sb:motion', 'off'));
    const page = await context.newPage();
    for (const route of [dataPath('/'), dataPath('/projects/school-zone-blindspots/'), dataPath('/records/')]) {
      await page.goto(route, { waitUntil: 'networkidle' });
      await settle(page);
      if (path === 'switch') await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduce');
      expect(await page.locator('.is-rise').count(), `${route}: no rise`).toBe(0);
      expect(await page.locator('.ed-stamp.is-waiting').count(), `${route}: the badge never waits`).toBe(0);
      const moved = await page.evaluate(async () => {
        const hits = new Set<string>();
        const check = () => {
          for (const el of document.querySelectorAll('.ed-sh *, .ed-stamp, .ed-stamp *')) {
            const t = getComputedStyle(el).transform;
            if (t !== 'none') hits.add(`${el.className}: ${t}`);
          }
        };
        for (let y = 0; y < document.documentElement.scrollHeight; y += 300) {
          window.scrollTo(0, y);
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          check();
        }
        return [...hits].slice(0, 8);
      });
      expect(moved, `${route}: transforms under reduced motion`).toEqual([]);
    }
    await context.close();
  });
}
