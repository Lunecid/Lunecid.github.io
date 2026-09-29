import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { load } from 'js-yaml';
import { test, expect } from './helpers';
import { SITE } from '../../src/config';
import { containsTrademark } from '../../src/lib/seo';

// D-15: /research/cog-2026-engagement/ (+ /en/) is a paper-style, abstract-only page built from the publication.

interface Publication {
  title: string;
  titleKo: string;
  authors: { name: string }[];
  abstract: string;
  abstractKo: string;
  bibtex: string;
}

const PUB = (() => {
  const text = readFileSync(join(process.cwd(), 'src/content/publications/cog-2026-engagement.md'), 'utf8').replace(/\r\n/g, '\n');
  const match = /^---\n([\s\S]*?)\n---/.exec(text);
  if (!match) throw new Error('publication frontmatter missing');
  return load(match[1]) as Publication;
})();

const ROUTES = [
  { lang: 'ko', route: '/game/research/cog-2026-engagement/' },
  { lang: 'en', route: '/en/game/research/cog-2026-engagement/' },
] as const;

const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

async function open(page: Page, route: string): Promise<void> {
  await page.goto(route, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready.then(() => true));
}

for (const { lang, route } of ROUTES) {
  test.describe(`paper page ${route}`, () => {
    test('title, authors and the English abstract; Korean title/abstract only on ko; trademark-free <title>', async ({ page }) => {
      await open(page, route);
      await expect(page.locator('h1')).toHaveCount(1);
      expect(squash(await page.locator('h1').innerText())).toBe(PUB.title);
      for (const author of PUB.authors) await expect(page.locator('.paper__author-name', { hasText: author.name })).toBeVisible();
      await expect(page.locator('.paper__affil').first()).toHaveText('Pusan National University');
      expect(squash(await page.locator('#abstract .paper__text').innerText())).toBe(squash(PUB.abstract));
      await expect(page.getByRole('heading', { level: 2, name: 'Abstract', exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { level: 2, name: 'Index Terms', exact: true })).toBeVisible();
      const koAbstract = page.getByRole('region', { name: '국문 초록', exact: true });
      if (lang === 'ko') {
        await expect(page.locator('.paper__title-ko')).toContainText(PUB.titleKo);
        await expect(page.locator('.paper__title-ko')).toContainText('(국문 제목)');
        expect(squash(await koAbstract.locator('.paper__text').innerText())).toBe(squash(PUB.abstractKo));
      } else {
        await expect(page.locator('.paper__title-ko')).toHaveCount(0);
        await expect(koAbstract).toHaveCount(0);
        await expect(page.locator('main')).not.toContainText(PUB.abstractKo.slice(0, 20));
      }
      // P-07 F-048 (owner decision 18): the page's one e-mail is the school address in the full-text request line under
      // Code; the author blocks still carry none (D-15), so a second or another address fails here.
      expect((await page.locator('main').innerText()).match(/[a-z0-9._-]+@[a-z0-9.-]+\.[a-z]{2,}/gi)).toEqual([SITE.email]);
      const title = await page.title();
      expect(containsTrademark(title), title).toBe(false);
    });

    test('no story sections, figures, telemetry excerpt or AUC chart remain', async ({ page }) => {
      await open(page, route);
      const main = page.locator('main');
      await expect(main.locator('figure, img, svg, picture, .chart, .telemetry, .story-step, .story-progress, [data-step], [data-block]')).toHaveCount(0);
      for (const id of ['question', 'data', 'method', 'results', 'limits', 'for-game-teams', 'story-end']) {
        await expect(page.locator(`#${id}`), id).toHaveCount(0);
      }
      expect(await main.locator('section[id]').evaluateAll((els) => els.map((el) => el.id))).toEqual(['abstract', 'bibtex']);
    });

    test('paper typography: Times New Roman first, white sheet, near-black ink', async ({ page }) => {
      await open(page, route);
      const style = await page.locator('#abstract .paper__text').evaluate((el) => {
        const s = getComputedStyle(el);
        return { fontFamily: s.fontFamily, fontSize: s.fontSize, color: s.color, align: getComputedStyle(el.parentElement!).textAlign };
      });
      expect(style.fontFamily.startsWith('"Times New Roman"'), style.fontFamily).toBe(true);
      expect(style.fontSize).toBe('17px');
      expect(style.color).toBe('rgb(20, 20, 20)');
      expect(style.align).toBe('justify');
      expect(await page.locator('.paper').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(255, 255, 255)');
      expect(await page.locator('#paper-title').evaluate((el) => getComputedStyle(el).fontFamily.startsWith('"Times New Roman"'))).toBe(true);
    });

    // Fix round 1: a justified ~40-character phone line opens wide word gaps where the browser does not hyphenate.
    for (const [width, align] of [[375, 'left'], [1280, 'justify']] as const) {
      test(`English abstract and Index Terms are ${align}-aligned at ${width}px (Korean stays left-aligned)`, async ({ page }) => {
        await page.setViewportSize({ width, height: 800 });
        await open(page, route);
        const aligns = await page.evaluate(() => ({
          abstract: getComputedStyle(document.querySelector('#abstract .paper__text')!).textAlign,
          terms: getComputedStyle(document.querySelector('.paper__block--terms .paper__text')!).textAlign,
          hyphens: getComputedStyle(document.querySelector('#abstract .paper__text')!).hyphens,
          ko: (() => {
            const ko = document.querySelector('.paper__block--ko .paper__text');
            return ko ? getComputedStyle(ko).textAlign : null;
          })(),
        }));
        expect(aligns.abstract).toBe(align);
        expect(aligns.terms).toBe(align);
        expect(aligns.hyphens).toBe('auto');
        expect(aligns.ko).toBe(lang === 'ko' ? 'start' : null);
      });
    }

    test('BibTeX copy button copies the entry, announces it and does not shift the layout', async ({ page, context, baseURL }) => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: baseURL });
      await open(page, route);
      const button = page.locator('[data-bib-copy]');
      await button.scrollIntoViewIfNeeded();
      await expect(button).toBeVisible();
      const before = await button.boundingBox();
      const code = await page.locator('.bib__code').boundingBox();
      await button.click();
      await expect(button).toHaveAttribute('data-state', 'done');
      await expect(page.locator('[data-bib-status]')).toHaveText(lang === 'ko' ? 'BibTeX를 클립보드에 복사했습니다.' : 'BibTeX copied to the clipboard.');
      await expect(page.locator('[data-bib-status]')).toHaveAttribute('role', 'status');
      // The Windows clipboard hands text back with CRLF line ends.
      expect((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n')).toBe(PUB.bibtex.trimEnd());
      expect(await button.boundingBox(), 'button keeps its box').toEqual(before);
      expect(await page.locator('.bib__code').boundingBox(), 'BibTeX box does not move').toEqual(code);
      await expect(button).toHaveAttribute('data-state', 'idle', { timeout: 5000 });
    });

    test('reaching the end of the paper unlocks the finish-cog-story achievement', async ({ page }) => {
      await open(page, route);
      await page.locator('[data-paper-end]').scrollIntoViewIfNeeded();
      await expect
        .poll(
          () =>
            page.evaluate(() => {
              try {
                return JSON.parse(localStorage.getItem('sb:achievements') ?? '{}')['cog-story-complete'] ?? null;
              } catch {
                return null;
              }
            }),
          { timeout: 10_000 },
        )
        .toBeTruthy();
    });

    for (const width of [320, 375]) {
      test(`no horizontal overflow at ${width}px; the sheet spans the width with 16px padding`, async ({ page }) => {
        await page.setViewportSize({ width, height: 800 });
        await open(page, route);
        const result = await page.evaluate(() => {
          const sheet = document.querySelector('.paper')!;
          const s = getComputedStyle(sheet);
          return {
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
            mainWidth: document.querySelector('main')!.getBoundingClientRect().width,
            sheetWidth: sheet.getBoundingClientRect().width,
            padding: s.paddingLeft,
          };
        });
        expect(result.scrollWidth).toBeLessThanOrEqual(result.clientWidth);
        expect(result.sheetWidth, 'the sheet spans <main>').toBeGreaterThanOrEqual(result.mainWidth - 1);
        expect(result.padding).toBe('16px');
      });
    }

    test('print shows only the sheet, black on white', async ({ page }) => {
      await open(page, route);
      await page.emulateMedia({ media: 'print' });
      const printed = await page.evaluate(() => ({
        nav: getComputedStyle(document.querySelector('.hud-nav')!).display,
        footer: getComputedStyle(document.querySelector('body > footer, .site-footer')!).display,
        copy: getComputedStyle(document.querySelector('[data-bib-copy]')!).display,
        ink: getComputedStyle(document.querySelector('#abstract .paper__text')!).color,
        bg: getComputedStyle(document.querySelector('.paper')!).backgroundColor,
      }));
      expect(printed).toEqual({ nav: 'none', footer: 'none', copy: 'none', ink: 'rgb(0, 0, 0)', bg: 'rgb(255, 255, 255)' });
    });
  });
}
