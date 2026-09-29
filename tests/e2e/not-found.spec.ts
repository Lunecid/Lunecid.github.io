import { test, expect } from './helpers';

const CASES = [
  { path: '/data/no-such-page/', lang: 'ko', game: '/game/', data: '/data/', title: '페이지를 찾을 수 없습니다.' },
  { path: '/game/no-such-page/', lang: 'ko', game: '/game/', data: '/data/', title: '페이지를 찾을 수 없습니다.' },
  { path: '/no-such-page/', lang: 'ko', game: '/game/', data: '/data/', title: '페이지를 찾을 수 없습니다.' },
  { path: '/en/data/no-such-page/', lang: 'en', game: '/en/game/', data: '/en/data/', title: 'Page not found.' },
  { path: '/en/game/no-such-page/', lang: 'en', game: '/en/game/', data: '/en/data/', title: 'Page not found.' },
] as const;

test.describe('neutral 404 (R-1, §7, §12)', () => {
  for (const c of CASES) {
    test(`${c.path}: 404, neutral, both homes in the page language, no game module or trigger`, async ({ page }) => {
      const res = await page.goto(c.path);
      expect(res?.status()).toBe(404);
      await expect(page.locator('html')).toHaveAttribute('lang', c.lang);
      await expect(page.locator('html')).toHaveAttribute('data-variant', 'neutral');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(c.title);
      await expect(page.locator('[data-nf-home="game"]')).toHaveAttribute('href', c.game);
      await expect(page.locator('[data-nf-home="data"]')).toHaveAttribute('href', c.data);
      await expect(page.locator('[data-nt-lang]')).toHaveAttribute('href', c.lang === 'en' ? '/' : '/en/');
      for (const sel of ['.hud-nav', '.crt', 'astro-island', '.bgm', '.ach-toast-region']) await expect(page.locator(sel), sel).toHaveCount(0);
      await expect(page.locator('meta[http-equiv="refresh"]')).toHaveCount(0);
      await expect(page.locator('link[hreflang]')).toHaveCount(0);
      await page.waitForTimeout(1500); // no auto-redirect and no achievement write
      expect(new URL(page.url()).pathname).toBe(c.path);
      expect(await page.evaluate(() => localStorage.getItem('sb:achievements'))).toBeNull();
    });
  }

  test('the language switch leads to the other chooser', async ({ page }) => {
    await page.goto('/en/data/no-such-page/');
    await page.locator('[data-nt-lang]').click();
    await expect(page).toHaveURL(/\/$/);
  });
});
