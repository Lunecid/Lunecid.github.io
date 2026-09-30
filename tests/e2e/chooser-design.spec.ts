import { test, expect, horizontalOverflow, textBelow12px } from './helpers';

const GAME = '[data-choose-variant="game"]';
const DATA = '[data-choose-variant="data"]';
const box = (page: import('@playwright/test').Page, sel: string) => page.locator(sel).evaluate((el) => el.getBoundingClientRect().toJSON() as DOMRect);

test.describe('chooser (P2-10, Review Focus 4)', () => {
  test('side by side from 734px, stacked below; arrows follow the layout; Tab goes game → data', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/?choose', { waitUntil: 'networkidle' });
    const [g, d] = [await box(page, GAME), await box(page, DATA)];
    expect(d.left).toBeGreaterThan(g.left);
    expect(Math.abs(d.top - g.top)).toBeLessThan(2);
    await page.locator(GAME).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator(DATA)).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator(GAME)).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator(GAME)).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator(DATA)).toBeFocused();

    await page.setViewportSize({ width: 375, height: 812 });
    await expect(page.locator(DATA)).toBeFocused(); // focus survives the re-flow
    const [g2, d2] = [await box(page, GAME), await box(page, DATA)];
    expect(d2.top).toBeGreaterThanOrEqual(g2.bottom - 1);
    await page.keyboard.press('ArrowUp');
    await expect(page.locator(GAME)).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator(DATA)).toBeFocused();
  });

  test('Enter follows the focused side and remembers it', async ({ page }) => {
    await page.goto('/?choose', { waitUntil: 'networkidle' });
    await page.locator(DATA).focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/data\/$/);
    expect(await page.evaluate(() => localStorage.getItem('sb:variant'))).toBe('data');
  });

  test('with a stored choice, the language switch keeps ?choose and the other chooser stays (spec §5.5)', async ({ page }) => {
    await page.goto('/?choose', { waitUntil: 'networkidle' });
    await page.evaluate(() => localStorage.setItem('sb:variant', 'data'));
    await page.goto('/?choose', { waitUntil: 'networkidle' });
    await page.locator('header a[hreflang]').click();
    await expect(page).toHaveURL(/\/en\/\?choose$/);
    await expect(page.locator('[data-chooser]')).toBeVisible();
  });

  test('hover widens a side in 0.25s; under reduced motion only its colours change', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/?choose', { waitUntil: 'networkidle' });
    await page.locator(DATA).hover();
    await page.waitForTimeout(400);
    expect(await page.locator(DATA).evaluate((el) => getComputedStyle(el).transform)).not.toBe('none');
    expect(await page.locator(DATA).evaluate((el) => getComputedStyle(el).transitionDuration)).toContain('0.25s');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/?choose', { waitUntil: 'networkidle' });
    await page.locator(DATA).hover();
    await page.waitForTimeout(400);
    expect(await page.locator(DATA).evaluate((el) => getComputedStyle(el).transform)).toBe('none');
    expect(await page.locator(DATA).evaluate((el) => getComputedStyle(el).transitionProperty)).not.toContain('transform');
  });

  for (const width of [320, 375, 768, 1440]) {
    test(`${width}px: no horizontal scroll, no text below 12px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      for (const route of ['/?choose', '/en/?choose']) {
        await page.goto(route, { waitUntil: 'networkidle' });
        const result = await horizontalOverflow(page);
        expect(result.scrollWidth, `${route}: ${result.offenders.join(', ')}`).toBeLessThanOrEqual(result.width);
        expect(await textBelow12px(page), route).toEqual([]);
      }
    });
  }

  test('2560px at DPR 1.5: no horizontal scroll', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 2560, height: 1440 }, deviceScaleFactor: 1.5 });
    const page = await context.newPage();
    await page.goto('/?choose', { waitUntil: 'networkidle' });
    const result = await horizontalOverflow(page);
    expect(result.scrollWidth, result.offenders.join(', ')).toBeLessThanOrEqual(result.width);
    await context.close();
  });

  test('without JavaScript both sides are plain links', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.locator(GAME)).toHaveAttribute('href', '/game/');
    await expect(page.locator(DATA)).toHaveAttribute('href', '/data/');
    await expect(page.locator(DATA)).toBeVisible();
    await context.close();
  });

  test('no image request, only sans preloads, and the header shows the language switch only', async ({ page }) => {
    const images: string[] = [];
    page.on('request', (r) => { if (r.resourceType() === 'image' && !/favicon|apple-touch-icon/.test(r.url())) images.push(r.url()); });
    await page.goto('/?choose', { waitUntil: 'networkidle' });
    expect(images).toEqual([]);
    const preloads = await page.locator('link[rel="preload"]').evaluateAll((els) => els.map((el) => el.getAttribute('href') ?? ''));
    expect(preloads.every((href) => /sb-sans/.test(href))).toBe(true);
    await expect(page.locator('header a[hreflang]')).toHaveCount(1);
    await expect(page.locator('header a[href="/"]')).toHaveCount(0);
  });
});
