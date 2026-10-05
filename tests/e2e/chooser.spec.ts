import { test, expect } from './helpers';

test.describe('chooser memory (§5.5, success criterion 2)', () => {
  test('first visit shows the chooser; a choice is remembered and the next visit goes straight to that version', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toHaveText('백성은');
    await expect(page).toHaveURL(/\/$/);
    await page.locator('a[data-choose-variant="data"]').click();
    await expect(page).toHaveURL(/\/data\/$/);
    expect(await page.evaluate(() => localStorage.getItem('sb:variant'))).toBe('data');
    await page.goto('/');
    await expect(page).toHaveURL(/\/data\/$/);
    await page.goto('/en/');
    await expect(page).toHaveURL(/\/en\/data\/$/);
  });

  test('?choose always shows the chooser; the footer link uses it', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('sb:variant', 'game'));
    await page.goto('/?choose');
    await expect(page).toHaveURL(/\/\?choose$/);
    await expect(page.locator('a[data-choose-variant]')).toHaveCount(2);
    await page.goto('/en/?choose');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  test('old home anchors go to the game home in the same language, whatever was chosen (A-27)', async ({ page }) => {
    await page.goto('/?choose');
    await page.evaluate(() => localStorage.setItem('sb:variant', 'data'));
    await page.goto('/#hello');
    await expect(page).toHaveURL(/\/game\/#hello$/);
    await page.goto('/en/#patch-notes');
    await expect(page).toHaveURL(/\/en\/game\/#patch-notes$/);
  });

  test('A-7: visiting a version page does not write the choice', async ({ page }) => {
    await page.goto('/data/');
    expect(await page.evaluate(() => localStorage.getItem('sb:variant'))).toBeNull();
    await page.goto('/');
    await expect(page).toHaveURL(/\/$/);
  });

  test('without JavaScript the chooser is two plain links', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.locator('a[data-choose-variant="game"]')).toHaveAttribute('href', '/game/');
    await expect(page.locator('a[data-choose-variant="data"]')).toHaveAttribute('href', '/data/');
    // MO-23: the game link's hit layer covers the game file; its title bar stays visible above the printout
    await page.locator('.file--game .cta__hit').click({ position: { x: 24, y: 12 } });
    await expect(page).toHaveURL(/\/game\/$/);
    await context.close();
  });
});
