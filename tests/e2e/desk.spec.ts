// The chooser desk (motion plan amendment 2026-10-05, chooser v6.4 approved): the game file's cyber cover behind, the
// general file's white art-paper printout tilted on top of it. MO-23: the static desk at rest.
import type { Page } from '@playwright/test';
import { test, expect, horizontalOverflow, textBelow12px, expectNoAxeViolations, openAt } from './helpers';

const GAME = 'a[data-choose-variant="game"]';
const DATA = 'a[data-choose-variant="data"]';
const GAME_WORDS = /PLAYER|PATCH NOTES|SELECT YOUR|GAME OVER|\bMODE\b|\[\s*■?\s*\]|QUEST LOG|INVENTORY|ACHIEVEMENT|CONTINUE\?|\bGAME\b|게임/;

const rectOf = (page: Page, sel: string) => page.locator(sel).first().evaluate((el) => el.getBoundingClientRect().toJSON() as DOMRect);
/** The file (game | data | null) that owns the topmost element at a viewport point. */
const fileAt = (page: Page, x: number, y: number) =>
  page.evaluate(([px, py]) => {
    const el = document.elementFromPoint(px!, py!);
    const file = el?.closest('.file');
    return file ? (file.classList.contains('file--game') ? 'game' : 'data') : null;
  }, [x, y]);

test.describe('MO-23: the static desk', () => {
  test('dark HUD page: color-scheme dark, body --hud-bg, focus rings lime on the game file and --pr-focus on the printout', async ({ page }) => {
    await openAt(page, '/?choose', 1280, 800);
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe('dark');
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(11, 13, 17)');
    await page.locator(DATA).focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab'); // keyboard focus, so :focus-visible applies
    await expect(page.locator(DATA)).toBeFocused();
    const dataRing = await page.locator('.file--data > .face').evaluate((el) => [getComputedStyle(el).outlineStyle, getComputedStyle(el).outlineColor]);
    expect(dataRing).toEqual(['solid', 'rgb(20, 20, 20)']);
    await page.keyboard.press('Tab');
    await expect(page.locator(GAME)).toBeFocused();
    const gameRing = await page.locator('.file--game > .face').evaluate((el) => [getComputedStyle(el).outlineStyle, getComputedStyle(el).outlineColor]);
    expect(gameRing).toEqual(['solid', 'rgb(200, 240, 60)']);
  });

  test("at rest the printout lies over the game cover; the game cover's title bar and display row stay visible (≥ 734 px: left strip; < 734 px: top 96 px)", async ({ page }) => {
    await openAt(page, '/?choose', 1280, 800);
    const g = await rectOf(page, '.file--game');
    const d = await rectOf(page, '.file--data');
    expect(d.left - g.left).toBeGreaterThan(g.width * 0.3);
    expect(await fileAt(page, (g.left + d.left) / 2, g.top + 16)).toBe('game'); // title bar
    const disp = await rectOf(page, '.file--game .disp');
    expect(await fileAt(page, (g.left + d.left) / 2, disp.top + disp.height / 2)).toBe('game'); // display row
    expect(await fileAt(page, d.left + d.width / 2, d.top + d.height / 2)).toBe('data');
    await openAt(page, '/?choose', 375, 812);
    const g2 = await rectOf(page, '.file--game');
    const d2 = await rectOf(page, '.file--data');
    expect(Math.round(d2.top - g2.top)).toBeGreaterThanOrEqual(90);
    expect(await fileAt(page, g2.left + g2.width / 2, g2.top + 16)).toBe('game');
    expect(await fileAt(page, g2.left + g2.width / 2, g2.top + 70)).toBe('game');
    expect(await fileAt(page, d2.left + d2.width / 2, d2.top + 140)).toBe('data');
  });

  test('Tab order: data link, then game link', async ({ page }) => {
    await openAt(page, '/?choose', 1280, 800);
    await page.locator('header a[hreflang]').focus();
    await page.keyboard.press('Tab');
    await expect(page.locator(DATA)).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator(GAME)).toBeFocused();
  });

  test('a click anywhere on the printout follows its link at once; the choice is remembered', async ({ page }) => {
    await openAt(page, '/?choose', 1280, 800);
    const banner = await rectOf(page, '.file--data .pr__disp');
    await page.mouse.click(banner.left + banner.width / 2, banner.top + banner.height / 2);
    await expect(page).toHaveURL(/\/data\/$/);
    expect(await page.evaluate(() => localStorage.getItem('sb:variant'))).toBe('data');
  });

  for (const width of [320, 375, 768, 1280, 1440]) {
    test(`no horizontal scroll and no text below 12px at ${width} (ko, en, ?choose)`, async ({ page }) => {
      for (const route of ['/?choose', '/en/?choose']) {
        await openAt(page, route, width, 900);
        const result = await horizontalOverflow(page);
        expect(result.scrollWidth, `${route}: ${result.offenders.join(', ')}`).toBeLessThanOrEqual(result.width);
        expect(await textBelow12px(page), route).toEqual([]);
      }
    });
  }

  test('2560 at DPR 1.5', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 2560, height: 1440 }, deviceScaleFactor: 1.5 });
    const page = await context.newPage();
    await page.goto('/?choose', { waitUntil: 'networkidle' });
    const result = await horizontalOverflow(page);
    expect(result.scrollWidth, result.offenders.join(', ')).toBeLessThanOrEqual(result.width);
    const d = await rectOf(page, '.file--data');
    expect(d.width, 'the printout keeps its cap').toBeLessThanOrEqual(724);
    await context.close();
  });

  test('1280×800: both CTAs inside the first viewport', async ({ page }) => {
    for (const route of ['/?choose', '/en/?choose']) {
      await openAt(page, route, 1280, 800);
      for (const sel of ['.file--data .cta__face', '.file--game .cta__face']) {
        const r = await rectOf(page, sel);
        expect(r.bottom, `${route} ${sel}`).toBeLessThanOrEqual(800);
        expect(r.top, `${route} ${sel}`).toBeGreaterThan(0);
      }
    }
  });

  test('axe clean at 375 and 1280', async ({ page }) => {
    for (const width of [375, 1280]) {
      for (const route of ['/?choose', '/en/?choose']) {
        await openAt(page, route, width, 900);
        await expectNoAxeViolations(page, `${route} @${width}`);
      }
    }
  });

  test('forced colors: 1px CanvasText frame on both files; text visible', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active', colorScheme: 'dark' });
    await openAt(page, '/?choose', 1280, 800);
    for (const sel of ['.file--game > .face', '.file--data > .face']) {
      const frame = await page.locator(sel).evaluate((el) => {
        const s = getComputedStyle(el);
        return { w: s.borderTopWidth, style: s.borderTopStyle, color: s.borderTopColor, text: s.color };
      });
      expect(frame.w, sel).toBe('1px');
      expect(frame.style, sel).toBe('solid');
      expect(frame.color, sel).toBe(frame.text);
    }
    await expect(page.locator('#file-data-title')).toBeVisible();
    await expect(page.locator('#file-game-title')).toBeVisible();
    expect(await page.locator('.file--data .paper').evaluate((el) => getComputedStyle(el).backgroundImage)).toBe('none');
  });

  test('print: both flat, untilted, no stamp', async ({ page }) => {
    await openAt(page, '/?choose', 1280, 800);
    await page.emulateMedia({ media: 'print' });
    expect(await page.locator('.file--data > .face').evaluate((el) => getComputedStyle(el).transform)).toBe('none');
    const g = await rectOf(page, '.file--game');
    const d = await rectOf(page, '.file--data');
    expect(g.top, 'data first, then game, one below the other').toBeGreaterThanOrEqual(d.bottom - 1);
    expect(Math.abs(g.left - d.left)).toBeLessThan(2);
    expect(await page.locator('.file--game .stamp').evaluate((el) => getComputedStyle(el).display)).toBe('none');
    expect(await page.locator('.file--data .rstamp').evaluate((el) => getComputedStyle(el).display)).toBe('none');
    expect(await page.locator('.file--data .feed').evaluate((el) => getComputedStyle(el, '::before').boxShadow), 'no shadow on paper').toBe('none');
  });

  test('the printout says no game word (GAME_WORDS)', async ({ page }) => {
    for (const route of ['/?choose', '/en/?choose']) {
      await openAt(page, route, 1280, 800);
      const text = await page.locator('.file--data').evaluate((el) => el.textContent ?? '');
      expect(text, route).not.toMatch(GAME_WORDS);
      expect(text.length).toBeGreaterThan(20);
    }
  });

  test('CLS ≤ 0.02 with mono and Anton delayed 1.5 s', async ({ browser }) => {
    test.setTimeout(90_000);
    for (const width of [375, 1280]) {
      const context = await browser.newContext({ viewport: { width, height: 800 } });
      const page = await context.newPage();
      let held = 0;
      await page.route(/sb-cover-(mono|display)[^/]*\.woff2/, (route) => {
        held += 1;
        setTimeout(() => void route.continue(), 1500);
      });
      await page.goto('/?choose', { waitUntil: 'commit' });
      const cls = await page.evaluate(
        () =>
          new Promise<number>((resolve) => {
            let sum = 0;
            const po = new PerformanceObserver((list) => {
              for (const e of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) if (!e.hadRecentInput) sum += e.value;
            });
            po.observe({ type: 'layout-shift', buffered: true });
            setTimeout(() => { po.disconnect(); resolve(sum); }, 2600);
          }),
      );
      expect(held, `@${width}: mono and Anton were requested and held back`).toBeGreaterThanOrEqual(2);
      expect(cls, `@${width}`).toBeLessThanOrEqual(0.02);
      await context.close();
    }
  });

  test('no image request; only the sans core is preloaded; the chooser sheet is one external stylesheet', async ({ page }) => {
    const images: string[] = [];
    page.on('request', (r) => { if (r.resourceType() === 'image' && !/favicon|apple-touch-icon/.test(r.url())) images.push(r.url()); });
    await openAt(page, '/?choose', 1280, 800);
    expect(images).toEqual([]);
    const preloads = await page.locator('link[rel="preload"]').evaluateAll((els) => els.map((el) => el.getAttribute('href') ?? ''));
    expect(preloads.length).toBeGreaterThan(0);
    for (const href of preloads) expect(href).toMatch(/sb-sans/);
    const sheets = await page.locator('link[rel="stylesheet"]').evaluateAll((els) => els.map((el) => el.getAttribute('href') ?? ''));
    expect(sheets).toEqual([expect.stringMatching(/^\/_astro\/chooser\.[\w-]+\.css$/)]);
    expect(await page.evaluate(() => document.documentElement.outerHTML.length)).toBeLessThan(60_000);
  });

  test('without JS: both links work, layout identical', async ({ browser, page }) => {
    await openAt(page, '/?choose', 1280, 800);
    const withJs = { g: await rectOf(page, '.file--game'), d: await rectOf(page, '.file--data') };
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1280, height: 800 } });
    const nojs = await context.newPage();
    await nojs.goto('/?choose', { waitUntil: 'networkidle' });
    const without = { g: await rectOf(nojs, '.file--game'), d: await rectOf(nojs, '.file--data') };
    for (const k of ['g', 'd'] as const) for (const p of ['x', 'y', 'width', 'height'] as const) expect(Math.abs(without[k][p] - withJs[k][p]), `${k}.${p}`).toBeLessThan(1);
    await expect(nojs.locator(DATA)).toHaveAttribute('href', '/data/');
    await nojs.locator('.file--game .cta__hit').click({ position: { x: 24, y: 12 } });
    await expect(nojs).toHaveURL(/\/game\/$/);
    await context.close();
  });
});

/** The printout's transform and opacity, and its left edge. */
const sheetState = (page: Page) =>
  page.locator('.file--data').evaluate((el) => ({ transform: getComputedStyle(el).transform, opacity: Number(getComputedStyle(el).opacity), left: el.getBoundingClientRect().left, top: el.getBoundingClientRect().top }));
/** The topmost element at the centre of the game CTA belongs to the game link. */
const gameCtaHit = (page: Page) =>
  page.evaluate(() => {
    const face = document.querySelector('.file--game .cta__face')!.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const inside = face.left >= 0 && face.right <= vw && face.top >= 0 && face.bottom <= window.innerHeight;
    const el = document.elementFromPoint(face.left + face.width / 2, face.top + face.height / 2);
    return { inside, hit: !!el?.closest('a[data-choose-variant="game"]') };
  });

test.describe('MO-24: the reveal', () => {
  test('hover on the game cover slides the printout aside within --dur-aside and back on leave', async ({ page }) => {
    await openAt(page, '/?choose', 1280, 800);
    const rest = await sheetState(page);
    const g = await rectOf(page, '.file--game');
    await page.mouse.move(g.left + 30, g.top + 120);
    await page.waitForTimeout(520); // --dur-aside .45s
    const aside = await sheetState(page);
    expect(aside.left - rest.left).toBeGreaterThan(200);
    expect(await page.locator('.file--data').evaluate((el) => getComputedStyle(el).transitionDuration)).toContain('0.45s');
    expect(await gameCtaHit(page)).toEqual({ inside: true, hit: true });
    await page.mouse.move(5, 790);
    await page.waitForTimeout(520);
    expect((await sheetState(page)).left).toBeCloseTo(rest.left, 0);
  });

  test('keyboard: focus on the game link reveals; Enter navigates to /game/ in one activation; Shift+Tab returns the sheet', async ({ page }) => {
    await openAt(page, '/?choose', 1280, 800);
    const rest = await sheetState(page);
    await page.locator('header a[hreflang]').focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await expect(page.locator(GAME)).toBeFocused();
    await page.waitForTimeout(520);
    expect((await sheetState(page)).left - rest.left).toBeGreaterThan(200);
    expect(await gameCtaHit(page)).toEqual({ inside: true, hit: true });
    await page.keyboard.press('Shift+Tab');
    await expect(page.locator(DATA)).toBeFocused();
    await page.waitForTimeout(520);
    expect((await sheetState(page)).left).toBeCloseTo(rest.left, 0);
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/game\/$/);
  });

  test('touch (Pixel 7): first tap reveals, second navigates, tap elsewhere restores', async ({ browser }) => {
    const { devices } = await import('@playwright/test');
    const context = await browser.newContext({ ...devices['Pixel 7'] });
    const page = await context.newPage();
    await page.goto('/?choose', { waitUntil: 'networkidle' });
    await expect(page.locator('.desk__hint')).toHaveText('뒤의 게임 파일을 누르면 앞으로 꺼냅니다');
    const g = await rectOf(page, '.file--game');
    await page.touchscreen.tap(g.left + g.width / 2, g.top + 20);
    await expect(page.locator('.desk')).toHaveClass(/is-aside/);
    await expect(page).toHaveURL(/\?choose$/);
    await expect(page.locator('.desk__hint')).toHaveText('한 번 더 누르면 게임 버전으로 이동합니다');
    await page.waitForTimeout(520);
    // elsewhere: the caption above the desk
    const cap = await rectOf(page, '.chooser__cap');
    await page.touchscreen.tap(cap.left + 10, cap.top + 5);
    await expect(page.locator('.desk')).not.toHaveClass(/is-aside/);
    await page.touchscreen.tap(g.left + g.width / 2, g.top + 20);
    await expect(page.locator('.desk')).toHaveClass(/is-aside/);
    await page.waitForTimeout(520);
    const cta = await rectOf(page, '.file--game .cta__face');
    await page.touchscreen.tap(cta.left + cta.width / 2, cta.top + cta.height / 2);
    await expect(page).toHaveURL(/\/game\/$/);
    await context.close();
  });

  test('reduced motion: no transform on the printout; it crossfades out within 200 ms', async ({ page }) => {
    await openAt(page, '/?choose', 1280, 800, { reducedMotion: true });
    expect(await page.locator('.file--data').evaluate((el) => getComputedStyle(el).transitionProperty)).not.toContain('transform');
    await page.locator(DATA).focus();
    await page.keyboard.press('Tab');
    await expect(page.locator(GAME)).toBeFocused();
    await page.waitForTimeout(260);
    const s = await sheetState(page);
    expect(s.transform).toBe('none');
    expect(s.opacity).toBe(0);
    expect(await page.locator('.file--data').evaluate((el) => getComputedStyle(el).transitionDuration)).toBe('0.2s');
    expect(await gameCtaHit(page)).toEqual({ inside: true, hit: true });
  });

  test('without JS hover and focus still reveal (CSS :has)', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    await page.goto('/?choose', { waitUntil: 'networkidle' });
    const rest = await sheetState(page);
    const g = await rectOf(page, '.file--game');
    await page.mouse.move(g.left + 30, g.top + 120);
    await page.waitForTimeout(520);
    expect((await sheetState(page)).left - rest.left).toBeGreaterThan(200);
    await page.mouse.move(5, 790);
    await page.waitForTimeout(520);
    await page.locator(DATA).focus();
    await page.keyboard.press('Tab');
    await page.waitForTimeout(520);
    expect((await sheetState(page)).left - rest.left).toBeGreaterThan(200);
    await context.close();
  });

  for (const [width, height] of [[320, 640], [375, 812], [1280, 800], [2560, 1440]] as const) {
    test(`revealed at ${width}: no horizontal scroll; the game CTA is fully visible and hit-testable`, async ({ page }) => {
      await openAt(page, '/?choose', width, height);
      await page.locator('.desk').evaluate((el) => el.classList.add('is-aside'));
      await page.waitForTimeout(520);
      await page.locator('.file--game .cta__face').scrollIntoViewIfNeeded();
      const result = await horizontalOverflow(page);
      expect(result.scrollWidth, result.offenders.join(', ')).toBeLessThanOrEqual(result.width);
      expect(await gameCtaHit(page)).toEqual({ inside: true, hit: true });
    });
  }

  test('the hint stays empty on a hover-capable pointer', async ({ page }) => {
    await openAt(page, '/?choose', 1280, 800);
    await expect(page.locator('.desk__hint')).toHaveText('');
    await expect(page.locator('.desk__hint')).toHaveAttribute('aria-live', 'polite');
  });
});
