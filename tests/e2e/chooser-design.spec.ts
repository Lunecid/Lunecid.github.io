import { test, expect, horizontalOverflow, textBelow12px } from './helpers';

const GAME = '[data-choose-variant="game"]';
const DATA = '[data-choose-variant="data"]';
const box = (page: import('@playwright/test').Page, sel: string) => page.locator(sel).evaluate((el) => el.getBoundingClientRect().toJSON() as DOMRect);

test.describe('chooser (P2-10 intents on the MO-23 desk, Review Focus 4)', () => {
  test('MO-23: the printout lies over the game cover at every width; ←/→ move between the two files; Tab goes data → game', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/?choose', { waitUntil: 'networkidle' });
    const [g, d] = [await box(page, '.file--game'), await box(page, '.file--data')];
    expect(d.left).toBeGreaterThan(g.left); // the game cover peeks out at the left
    expect(d.top).toBeGreaterThan(g.top); // and above
    expect(d.left).toBeLessThan(g.right); // the sheet covers most of it
    await page.locator(DATA).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator(GAME)).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator(DATA)).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator(GAME)).toBeFocused();

    await page.setViewportSize({ width: 375, height: 812 });
    await expect(page.locator(GAME)).toBeFocused(); // focus survives the re-flow
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator(DATA)).toBeFocused();
    // the rest geometry: the focused game file had slid the sheet aside; let it settle back (a race under load)
    await page.waitForFunction(() => document.querySelector('.file--data')!.getAnimations().length === 0);
    const [g2, d2] = [await box(page, '.file--game'), await box(page, '.file--data')];
    expect(d2.top).toBeGreaterThan(g2.top + 60); // phone: the game cover shows as a strip above the sheet
    expect(d2.top).toBeLessThan(g2.bottom);
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

  // MO-24 (replaces the P2-10 "hover widens a side" test, named): the reveal slides the printout aside
  test('hover/focus reveal the game file in --dur-aside; under reduced motion only opacity changes', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/?choose', { waitUntil: 'networkidle' });
    const before = await box(page, '.file--data');
    const g = await box(page, '.file--game');
    await page.mouse.move(g.left + 30, g.top + 120);
    await page.waitForTimeout(520);
    expect((await box(page, '.file--data')).left - before.left).toBeGreaterThan(200);
    expect(await page.locator('.file--data').evaluate((el) => getComputedStyle(el).transitionDuration)).toContain('0.45s');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/?choose', { waitUntil: 'networkidle' });
    await page.locator(DATA).focus();
    await page.keyboard.press('Tab');
    await page.waitForTimeout(300);
    expect(await page.locator('.file--data').evaluate((el) => getComputedStyle(el).transform)).toBe('none');
    expect(await page.locator('.file--data').evaluate((el) => getComputedStyle(el).opacity)).toBe('0');
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
    await expect(page.locator(GAME)).toHaveAttribute('aria-labelledby', 'file-game-title file-game-cta');
    await expect(page.locator(DATA)).toHaveAttribute('aria-labelledby', 'file-data-title file-data-cta');
    await context.close();
  });

  test('no image request, only sans preloads, and the header shows the language switch only', async ({ page }) => {
    const images: string[] = [];
    page.on('request', (r) => { if (r.resourceType() === 'image' && !/favicon|apple-touch-icon/.test(r.url())) images.push(r.url()); });
    await page.goto('/?choose', { waitUntil: 'networkidle' });
    expect(images).toEqual([]);
    const preloads = await page.locator('link[rel="preload"]').evaluateAll((els) => els.map((el) => el.getAttribute('href') ?? ''));
    expect(preloads.every((href) => /sb-sans/.test(href))).toBe(true);
    expect(preloads.some((href) => /jetbrains|anton|cover|serif/i.test(href)), 'MO-23: mono and Anton are not preloaded').toBe(false);
    await expect(page.locator('header a[hreflang]')).toHaveCount(1);
    await expect(page.locator('header a[href="/"]')).toHaveCount(0);
  });
});
