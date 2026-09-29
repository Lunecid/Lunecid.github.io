import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { test, expect, dataPath } from './helpers';
import { MONO_FAMILY, SANS_FAMILY, SERIF_KO_FAMILY, SERIF_KO_HEAD_FAMILY } from '../../src/lib/fonts';
import { cmapCodePoints, woff2Tables } from '../../scripts/fonts/sfnt.mjs';

// Batch 2: the page fonts are build-time subsets. Body text renders in the sans subset, HUD labels in the mono
// file, the Korean paper text in the Korean serif subset — and none of their visible characters that the source
// font has falls back to a system font. (Characters the source font lacks, e.g. a CJK ideograph in fetched
// GitHub text, fall back by design; the ops guard prints them as warnings.)

const MODULES = join(process.cwd(), 'node_modules');
const cmapOf = (file: string): Set<number> => cmapCodePoints(woff2Tables(readFileSync(file)).get('cmap')!);
const PRETENDARD = cmapOf(join(MODULES, 'pretendard/dist/web/variable/woff2/PretendardVariable.woff2'));
const NOTO_SERIF_KR = (() => {
  const dir = join(MODULES, '@fontsource-variable/noto-serif-kr/files');
  const all = new Set<number>();
  for (const f of readdirSync(dir).filter((f) => /^noto-serif-kr-\d+-wght-normal\.woff2$/.test(f))) for (const cp of cmapOf(join(dir, f))) all.add(cp);
  return all;
})();
/** The characters of `text` that the source font `source` has. */
const inSource = (text: string, source: Set<number>): string => [...text].filter((ch) => source.has(ch.codePointAt(0)!)).join('');

async function open(page: Page, route: string): Promise<void> {
  await page.goto(route, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready.then(() => true));
}

/**
 * Characters of `text` that `family` does not draw: each is painted on a canvas once as `"family", monospace` and
 * once as plain `monospace`; identical pixels mean the family had no glyph and the fallback drew both.
 */
async function fallbackChars(page: Page, family: string, text: string): Promise<string[]> {
  return page.evaluate(
    async ({ family, text }) => {
      await document.fonts.load(`48px "${family}"`, text);
      const canvas = document.createElement('canvas');
      canvas.width = 96;
      canvas.height = 96;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      const paint = (font: string, ch: string) => {
        ctx.clearRect(0, 0, 96, 96);
        ctx.font = font;
        ctx.fillText(ch, 16, 64);
        return ctx.getImageData(0, 0, 96, 96).data.join(',');
      };
      const chars = [...new Set(text)].filter((ch) => ch.trim() !== '' && !/\p{Emoji_Presentation}/u.test(ch));
      return chars.filter((ch) => paint(`48px "${family}", monospace`, ch) === paint('48px monospace', ch));
    },
    { family, text },
  );
}

async function faceStatus(page: Page, family: string): Promise<string[]> {
  return page.evaluate((family) => [...document.fonts].filter((f) => f.family.replace(/"/g, '') === family).map((f) => f.status), family);
}

for (const route of ['/game/', '/en/game/']) {
  test(`${route}: body text is in "${SANS_FAMILY}", HUD labels in "${MONO_FAMILY}", and nothing visible falls back`, async ({ page }) => {
    await open(page, route);
    const bodyFont = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
    expect(bodyFont.startsWith(`"${SANS_FAMILY}"`), bodyFont).toBe(true);
    const brand = page.locator('.hud-nav__id'); // SEONGEUN_BAEK // GAME DATA ANALYST
    const brandFont = await brand.evaluate((el) => getComputedStyle(el).fontFamily);
    expect(brandFont.startsWith(`"${MONO_FAMILY}"`), brandFont).toBe(true);

    // Two sans files: core (Latin, symbols, the Hangul English pages show) and the rest of the Hangul.
    // English pages never fetch the Hangul file; Korean pages load both.
    const hangulFetched = await page.evaluate(() => performance.getEntriesByType('resource').some((e) => e.name.includes('/sb-sans-ko.')));
    expect(await faceStatus(page, SANS_FAMILY)).toEqual(route === '/game/' ? ['loaded', 'loaded'] : ['unloaded', 'loaded']);
    expect(hangulFetched).toBe(route === '/game/');
    expect(await faceStatus(page, MONO_FAMILY)).toEqual(['loaded']);
    // After load, the faces for the page's sample are ready: Korean on /, English on /en/ (fonts.check() counts
    // every face whose unicode-range meets the text, so on /en/ a Hangul sample would also wait for the unused
    // Hangul file, which the English page rightly never fetches).
    const sample = route === '/game/' ? '안녕하세요 백성은, 게임 데이터 분석' : 'Seongeun Baek, game data analyst · 2026';
    expect(await page.evaluate(({ f, s }) => document.fonts.check(`17px "${f}"`, s), { f: SANS_FAMILY, s: sample })).toBe(true);
    expect(await fallbackChars(page, SANS_FAMILY, sample), 'sample').toEqual([]);
    expect(await fallbackChars(page, SANS_FAMILY, '똠'), 'control: a syllable the site never uses falls back').toEqual(['똠']);

    const visible = await page.locator('body').innerText();
    expect(await fallbackChars(page, SANS_FAMILY, inSource(visible, PRETENDARD)), 'every visible character').toEqual([]);
    const brandText = await brand.innerText();
    expect(await fallbackChars(page, MONO_FAMILY, brandText.replace(/[^\x20-\x7e]/g, '')), 'nav brand').toEqual([]);
  });
}

test('the Korean paper page sets its Korean text in the Korean serif; the English one does not load it', async ({ page }) => {
  await open(page, '/game/research/cog-2026-engagement/');
  const ko = page.locator('.paper__block--ko .paper__text');
  const font = await ko.evaluate((el) => getComputedStyle(el).fontFamily);
  expect(font.startsWith(`"${SERIF_KO_FAMILY}"`), font).toBe(true);
  expect(await faceStatus(page, SERIF_KO_FAMILY)).toEqual(['loaded']);
  const hangul = [...(await page.locator('.paper').innerText())].filter((ch) => /\p{Script=Hangul}/u.test(ch)).join('');
  expect(hangul.length).toBeGreaterThan(100);
  expect(await fallbackChars(page, SERIF_KO_FAMILY, inSource(hangul, NOTO_SERIF_KR))).toEqual([]);
  // The English abstract keeps Times New Roman first.
  const en = await page.locator('#abstract .paper__text').evaluate((el) => getComputedStyle(el).fontFamily);
  expect(en.startsWith('"Times New Roman"'), en).toBe(true);

  await open(page, '/en/game/research/cog-2026-engagement/');
  expect(await faceStatus(page, SERIF_KO_FAMILY)).toEqual([]);
});

test(`general home: [data-serif] text is set in the Times stack with "${SERIF_KO_HEAD_FAMILY}" for Hangul; the face loads, nothing falls back, nothing preloads it`, async ({ page }) => {
  await open(page, dataPath('/'));
  const serif = page.locator('[data-serif]');
  const family = await serif.first().evaluate((el) => getComputedStyle(el).fontFamily);
  expect(family).toMatch(/^"Times New Roman"/);
  expect(family).toContain(SERIF_KO_HEAD_FAMILY);
  const hangul = [...(await serif.allTextContents()).join('')].filter((ch) => /\p{Script=Hangul}/u.test(ch)).join('');
  expect(hangul.length).toBeGreaterThan(0);
  expect(await faceStatus(page, SERIF_KO_HEAD_FAMILY)).toContain('loaded');
  expect(await fallbackChars(page, SERIF_KO_HEAD_FAMILY, inSource(hangul, NOTO_SERIF_KR))).toEqual([]);
  await expect(page.locator('link[rel="preload"][href*="sb-serif-kr-head"]')).toHaveCount(0);
});

test('English general home: the heading face is declared but never downloaded (its headings hold no Hangul)', async ({ page }) => {
  const requested: string[] = [];
  page.on('request', (request) => requested.push(request.url()));
  await open(page, dataPath('/', 'en'));
  expect(await faceStatus(page, SERIF_KO_HEAD_FAMILY)).toEqual(['unloaded']); // declared once, not loaded (red before Step 6)
  expect(requested.filter((url) => url.includes('sb-serif-kr-head'))).toEqual([]);
});
