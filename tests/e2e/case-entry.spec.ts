// The case-study overlay's entry points (D1): every CoG card and list link on both versions and both languages opens the
// sheet in the page's language with its "paper page" link on that version's paper page; a modifier click still opens
// the paper page; nothing of the overlay is requested before intent. The runtime itself: case-overlay.spec.ts.
import type { Page } from '@playwright/test';
import { expect, test } from './helpers';

const PAPER = '/research/cog-2026-engagement/';
const PAGES: { route: string; lang: 'ko' | 'en'; version: 'game' | 'data'; links: number }[] = [
  { route: '/game/', lang: 'ko', version: 'game', links: 2 }, // the home cartridge and the research highlight
  { route: '/en/game/', lang: 'en', version: 'game', links: 2 },
  { route: '/data/', lang: 'ko', version: 'data', links: 1 }, // the research highlight (the general home features no CoG card)
  { route: '/en/data/', lang: 'en', version: 'data', links: 1 },
  { route: '/game/research/', lang: 'ko', version: 'game', links: 1 }, // the publication item
  { route: '/en/data/research/', lang: 'en', version: 'data', links: 1 },
  { route: '/game/projects/', lang: 'ko', version: 'game', links: 1 }, // the cartridge
  { route: '/data/projects/', lang: 'ko', version: 'data', links: 1 }, // the list item
  { route: '/en/game/records/', lang: 'en', version: 'game', links: 1 }, // the records publication item
];
const paperOf = (lang: 'ko' | 'en', version: 'game' | 'data') => `${lang === 'en' ? '/en' : ''}/${version}${PAPER}`;
const CASE_REQUEST = /\/case\/|\/_astro\/overlay\.|sb-case-/;

async function closeSheet(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog.cs')).not.toHaveAttribute('open', '');
}

for (const { route, lang, version, links } of PAGES) {
  test(`${route}: each CoG link opens the ${lang} sheet; its paper link is the ${version} paper page`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(route, { waitUntil: 'networkidle' });
    const triggers = page.locator('a[data-case="cog-2026-engagement"]');
    await expect(triggers).toHaveCount(links);
    for (let i = 0; i < links; i++) {
      const link = triggers.nth(i);
      await expect(link).toHaveAttribute('href', paperOf(lang, version));
      await link.scrollIntoViewIfNeeded();
      await link.click();
      await expect(page.locator('dialog.cs.is-open')).toBeVisible();
      await expect(page.locator('dialog.cs')).toHaveAttribute('lang', lang);
      expect(new URL(await page.locator('a[data-case-paper]').evaluate((a) => (a as HTMLAnchorElement).href)).pathname).toBe(paperOf(lang, version));
      expect(new URL(page.url()).pathname).toBe(route);
      await closeSheet(page);
      await expect(link).toBeFocused();
    }
  });
}

test('a Ctrl/Meta click opens the paper page in a new tab and leaves the sheet closed', async ({ page, context }) => {
  await page.goto('/game/research/', { waitUntil: 'networkidle' });
  const [tab] = await Promise.all([context.waitForEvent('page'), page.locator('a[data-case]').first().click({ modifiers: ['ControlOrMeta'] })]);
  // The browser opens it as a background tab. On CI (2026-10-09) that tab sat for 30 s without reaching the paper page,
  // four tries in a row, while every local run passed: bring it forward so background-tab scheduling cannot stall the
  // check, and compare the URL itself, so a failure prints the URL the tab actually has.
  await tab.bringToFront();
  await expect.poll(() => tab.url(), { message: 'the new tab is on the paper page', timeout: 15_000 }).toMatch(new RegExp(`${paperOf('ko', 'game')}$`));
  await expect(page.locator('dialog.cs')).toHaveCount(0);
});

test('the paper link inside the sheet follows to the paper page from a card page', async ({ page }) => {
  await page.goto('/data/research/', { waitUntil: 'networkidle' });
  await page.locator('a[data-case]').first().click();
  await expect(page.locator('dialog.cs.is-open')).toBeVisible();
  await page.locator('a[data-case-paper]').click();
  await expect(page).toHaveURL(new RegExp(`${paperOf('ko', 'data')}$`));
});

test('nothing of the overlay is requested before intent; hover warms the chunk, the sheet and its stylesheet', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (r) => { if (CASE_REQUEST.test(r.url())) requests.push(new URL(r.url()).pathname); });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/game/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  expect(requests).toEqual([]);
  await page.locator('a[data-case]').first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  expect(requests, 'scrolling is not intent').toEqual([]);
  await page.locator('a[data-case]').first().hover();
  await expect.poll(() => requests.some((p) => p.startsWith('/case/cog-2026-engagement/ko.json'))).toBe(true);
  expect(requests.some((p) => /\/_astro\/overlay\..+\.js$/.test(p))).toBe(true);
  expect(requests.some((p) => /\/_astro\/overlay\..+\.css$/.test(p))).toBe(true);
  expect(requests.filter((p) => p.includes('sb-case-')), 'fonts load only with the open sheet').toEqual([]);
});

test('a failed sheet never leaves a dead click: the link is followed', async ({ page }) => {
  await page.route('**/case/**', (route) => route.fulfill({ status: 500, body: '' }));
  await page.goto('/game/research/', { waitUntil: 'networkidle' });
  await page.locator('a[data-case]').first().click();
  await expect(page).toHaveURL(new RegExp(`${paperOf('ko', 'game')}$`));
});
