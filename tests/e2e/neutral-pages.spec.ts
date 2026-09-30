import AxeBuilder from '@axe-core/playwright';
import { test, expect, builtRoutes } from './helpers';

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const HUD_CLASSES = ['hud-grid', 'hud-label', 'hud-nav', 'site-footer', 'sec', 'sec-head', 'cut', 'btn', 'bracket', 'badge', 'lh-rows', 'lh-table', 'lh-chip', 'lh-tag', 'read', 'read-sec', 'crt', 'bgm', 'ach-toast', 'ghost-art'];
const GAME_WORDS = /PLAYER|PATCH NOTES|SELECT YOUR|GAME OVER|\bMODE\b|\[\s*■?\s*\]|QUEST LOG|INVENTORY|ACHIEVEMENT|CONTINUE\?|\[ OFFLINE \]/;
const NOT_FOUND = ['/no-such-page/', '/data/no-such-page/', '/en/data/no-such-page/', '/en/game/no-such-page/'];

for (const route of [...builtRoutes({ kind: 'shared' }), ...NOT_FOUND]) {
  test(`${route}: neutral page — white, light scheme, no HUD class, no game word, links in navy or ink, axe clean`, async ({ page }) => {
    await page.goto(route, { waitUntil: 'networkidle' });
    await expect(page.locator('html')).toHaveAttribute('data-variant', 'neutral');
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe('light');
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(255, 255, 255)');
    const classes = await page.evaluate((hud) => [...new Set(Array.from(document.body.querySelectorAll('*')).flatMap((el) => hud.filter((c) => el.classList.contains(c))))], HUD_CLASSES);
    expect(classes).toEqual([]);
    expect(await page.evaluate(() => document.body.textContent ?? '')).not.toMatch(GAME_WORDS);
    const colours = await page.evaluate(() =>
      // the skip link sits off-screen with white text on ink (neutral.css) until it is focused
      Array.from(document.querySelectorAll('a[href]:not(.skip-link)'))
        .filter((a) => a.getBoundingClientRect().width > 0)
        .map((a) => getComputedStyle(a).color)
        .filter((c) => c !== 'rgb(30, 58, 138)' && c !== 'rgb(20, 20, 20)'),
    );
    expect(colours).toEqual([]);
    await expect(page.locator('h1')).toHaveCount(1);
    const axe = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(axe.violations.map((v) => v.id)).toEqual([]);
  });
}

test('/en/credits/ at 320px: prose table cells never hyphenate automatically (5c54b03)', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/en/credits/', { waitUntil: 'networkidle' });
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('.nt-prose td') as Element).hyphens)).toBe('manual');
});
