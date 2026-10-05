// The chooser desk (motion plan amendment 2026-10-05, chooser v6.4 approved): the game file's cyber cover behind, the
// general file's white art-paper printout tilted on top of it. MO-23: the static desk at rest.
import { readFileSync } from 'node:fs';
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
  // MO-33 (named change): the game palette on the chooser: the page is the game black, the game file's ring yellow
  test('dark HUD page: color-scheme dark, body --hud-bg, focus ring yellow round the game file and --pr-focus on the printout', async ({ page }) => {
    await openAt(page, '/?choose', 1280, 800);
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe('dark');
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(10, 10, 11)');
    await page.locator(DATA).focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab'); // keyboard focus, so :focus-visible applies
    await expect(page.locator(DATA)).toBeFocused();
    const dataRing = await page.locator('.file--data > .face').evaluate((el) => [getComputedStyle(el).outlineStyle, getComputedStyle(el).outlineColor]);
    expect(dataRing).toEqual(['solid', 'rgb(20, 20, 20)']);
    await page.keyboard.press('Tab');
    await expect(page.locator(GAME)).toBeFocused();
    const gameRing = await page.locator('.file--game > .face').evaluate((el) => [getComputedStyle(el).outlineStyle, getComputedStyle(el).outlineColor]);
    expect(gameRing).toEqual(['solid', 'rgb(255, 230, 0)']);
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

  // MO-29 (named change): the printout banner's face (the display face's chooser subset) is held back too
  test('CLS ≤ 0.02 with mono, Anton and the display face delayed 1.5 s', async ({ browser }) => {
    test.setTimeout(90_000);
    for (const width of [375, 1280]) {
      const context = await browser.newContext({ viewport: { width, height: 800 } });
      const page = await context.newPage();
      let held = 0;
      await page.route(/sb-cover-(mono|display|banner)[^/]*\.woff2/, (route) => {
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
      expect(held, `@${width}: mono, Anton and the display face were requested and held back`).toBeGreaterThanOrEqual(3);
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
    // its line is reserved before the script fills it: filling it shifts nothing
    const shifted = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          let sum = 0;
          const po = new PerformanceObserver((list) => { for (const e of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) if (!e.hadRecentInput) sum += e.value; });
          po.observe({ type: 'layout-shift', buffered: true });
          setTimeout(() => { po.disconnect(); resolve(sum); }, 300);
        }),
    );
    expect(shifted).toBeLessThanOrEqual(0.005);
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

/** Records, across the navigation, how long the page lived after the activating click (sessionStorage survives it). */
const timeToLeave = (page: Page) =>
  page.evaluate(() => {
    let t0 = 0;
    document.addEventListener('click', () => { t0 = performance.now(); }, { capture: true });
    window.addEventListener('pagehide', () => sessionStorage.setItem('mo25:dt', String(performance.now() - t0)));
  });
const GAME_HIT = '.file--game .cta__hit';

test.describe('MO-25: the declassify stamp', () => {
  test('the stamp is invisible at rest and has no layout box change when it appears', async ({ page }) => {
    await openAt(page, '/?choose', 1280, 800);
    const stamp = page.locator('.file--game .stamp');
    expect(await stamp.evaluate((el) => getComputedStyle(el).opacity)).toBe('0');
    const before = await stamp.evaluate((el) => el.getBoundingClientRect().toJSON());
    const title = await rectOf(page, '#file-game-title');
    await stamp.evaluate((el) => el.classList.add('is-declassified'));
    expect(await stamp.evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
    expect(await stamp.evaluate((el) => el.getBoundingClientRect().toJSON())).toEqual(before);
    expect(await rectOf(page, '#file-game-title')).toEqual(title);
  });

  // MO-33 (named change): struck in yellow with ink, its ring yellow with a cyan echo outside it
  test('click on the game cover: the stamp turns yellow (bg rgb(255, 230, 0), ink text) with a cyan echo ring, then /game/ loads after ~440 ms', async ({ page }) => {
    await openAt(page, '/?choose', 1280, 800);
    await timeToLeave(page);
    const g = await rectOf(page, '.file--game');
    await page.mouse.move(g.left + 30, g.top + 120);
    await page.waitForTimeout(520);
    await page.mouse.down();
    const stamp = page.locator('.file--game .stamp');
    await expect(stamp).toHaveClass(/is-declassified/);
    await expect(stamp).toHaveClass(/is-struck/);
    const look = await stamp.evaluate((el) => ({ ring: getComputedStyle(el, '::after').animationName, strike: getComputedStyle(el).animationName }));
    expect(look).toEqual({ ring: 'stamp-ring', strike: 'stamp-strike' });
    // the colour change runs over --dur-hover (the button is still held: nothing navigates yet)
    await expect.poll(() => stamp.evaluate((el) => getComputedStyle(el).backgroundColor), { timeout: 400 }).toBe('rgb(255, 230, 0)');
    expect(await stamp.evaluate((el) => getComputedStyle(el).color)).toBe('rgb(10, 10, 11)');
    expect(await stamp.evaluate((el) => [getComputedStyle(el, '::after').borderTopColor, getComputedStyle(el, '::after').outlineColor])).toEqual(['rgb(255, 230, 0)', 'rgb(0, 229, 255)']);
    await page.mouse.up();
    await page.waitForURL(/\/game\/$/);
    const dt = Number(await page.evaluate(() => sessionStorage.getItem('mo25:dt')));
    expect(dt).toBeGreaterThanOrEqual(430);
    expect(dt).toBeLessThan(900);
    expect(await page.evaluate(() => localStorage.getItem('sb:variant'))).toBe('game');
  });

  test('reduced motion: no animation on the stamp; navigation within 300 ms', async ({ page }) => {
    await openAt(page, '/?choose', 1280, 800, { reducedMotion: true });
    await timeToLeave(page);
    await page.locator(DATA).focus();
    await page.keyboard.press('Tab');
    await page.waitForTimeout(260);
    // the stamp is read in the page right after the activation (the 150 ms navigation may outrun a round trip)
    await page.evaluate(() => {
      const el = document.querySelector('.file--game .stamp')!;
      document.addEventListener('click', () => setTimeout(() => sessionStorage.setItem('mo25:stamp', JSON.stringify([el.className, getComputedStyle(el).animationName, getComputedStyle(el, '::after').animationName]))), { capture: true });
    });
    const leaving = page.waitForURL(/\/game\/$/);
    await page.keyboard.press('Enter');
    await leaving;
    const [cls, strike, ring] = JSON.parse((await page.evaluate(() => sessionStorage.getItem('mo25:stamp'))) ?? '[]') as string[];
    expect(cls).toMatch(/is-declassified/);
    expect([strike, ring]).toEqual(['none', 'none']);
    const dt = Number(await page.evaluate(() => sessionStorage.getItem('mo25:dt')));
    expect(dt).toBeGreaterThanOrEqual(140);
    expect(dt).toBeLessThanOrEqual(300);
  });

  test('ctrl+click opens no stamp and does not block', async ({ page, context }) => {
    await openAt(page, '/?choose', 1280, 800);
    await page.evaluate(() => document.addEventListener('click', (e) => { (window as unknown as { __prevented: boolean }).__prevented = e.defaultPrevented; }));
    const popup = context.waitForEvent('page', { timeout: 3000 }).catch(() => null);
    await page.locator(GAME_HIT).click({ modifiers: ['Control'], position: { x: 24, y: 12 } });
    expect(await page.evaluate(() => (window as unknown as { __prevented: boolean }).__prevented)).toBe(false);
    expect(await page.locator('.file--game .stamp').getAttribute('class')).toBe('stamp');
    await page.waitForTimeout(600);
    await expect(page).toHaveURL(/\?choose$/);
    (await popup)?.close();
  });

  test('back navigation (bfcache): the stamp is gone again', async ({ page }) => {
    await openAt(page, '/?choose', 1280, 800);
    await page.locator(GAME_HIT).click({ position: { x: 24, y: 12 } });
    await page.waitForURL(/\/game\/$/);
    await page.goBack();
    await expect(page).toHaveURL(/\?choose$/);
    const stamp = page.locator('.file--game .stamp');
    await expect(stamp).not.toHaveClass(/is-declassified|is-struck/);
    expect(await stamp.evaluate((el) => getComputedStyle(el).opacity)).toBe('0');
    await expect(page.locator('.desk')).not.toHaveClass(/is-aside/);
  });
});

/** Every colour a page computes (each element and its ::before / ::after; colour properties, gradients and shadows),
 *  as [r, g, b] in 0–255. */
const computedColours = (page: Page) =>
  page.evaluate(() => {
    const props = ['color', 'background-color', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color', 'outline-color', 'text-decoration-color', 'fill', 'stroke', 'caret-color'];
    const rich = ['background-image', 'box-shadow', 'text-shadow'];
    const out = new Map<string, number[]>();
    const take = (v: string) => {
      for (const m of v.matchAll(/rgba?\(([^)]*)\)|color\(srgb ([^)]*)\)/g)) {
        const n = (m[1] ?? m[2] ?? '').split(/[\s,/]+/).filter(Boolean).map(Number);
        if (n.length < 3) continue;
        const rgb = m[2] ? n.slice(0, 3).map((x) => Math.round(x * 255)) : n.slice(0, 3);
        const alpha = n[3] ?? 1;
        if (alpha > 0) out.set(rgb.join(','), rgb);
      }
    };
    for (const el of document.querySelectorAll('*')) {
      for (const pseudo of [null, '::before', '::after']) {
        const cs = getComputedStyle(el, pseudo);
        for (const p of props) take(cs.getPropertyValue(p));
        for (const p of rich) take(cs.getPropertyValue(p));
      }
    }
    return [...out.values()];
  });
const near = (a: number[], b: number[], d = 3) => a.every((v, i) => Math.abs(v - b[i]!) <= d);

/** Share of yellow and of cyan pixels in a viewport clip (the printout hidden), counted in the page from a screenshot. */
async function paletteShare(page: Page, clip: { x: number; y: number; width: number; height: number }): Promise<{ yellow: number; cyan: number }> {
  const png = (await page.screenshot({ clip, animations: 'disabled' })).toString('base64');
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let y = 0;
    let cy = 0;
    for (let i = 0; i < d.length; i += 4) {
      const [r, g, b] = [d[i]!, d[i + 1]!, d[i + 2]!];
      if (r > 190 && g > 170 && b < 110 && r - b > 120) y++;
      else if (r < 110 && g > 150 && b > 170 && b - r > 90) cy++;
    }
    const n = d.length / 4;
    return { yellow: y / n, cyan: cy / n };
  }, png);
}

test.describe('MO-33: the game cover in the approved palette', () => {
  test('MO-33: no lime and no gold computed on / (any element, any colour property)', async ({ page }) => {
    for (const route of ['/?choose', '/en/?choose']) {
      await openAt(page, route, 1280, 800);
      const colours = await computedColours(page);
      const LIME = [200, 240, 60];
      const GOLD = [245, 179, 1];
      const OLIVE = [79, 107, 0];
      expect(colours.filter((c) => near(c, LIME) || near(c, GOLD) || near(c, OLIVE)), route).toEqual([]);
      // the palette is there: yellow and cyan are computed
      expect(colours.some((c) => near(c, [255, 230, 0])), route).toBe(true);
      expect(colours.some((c) => near(c, [0, 229, 255])), route).toBe(true);
    }
  });

  for (const width of [375, 768, 1280]) {
    test(`MO-33: every visible cover text ≥ 4.5:1 by computed colour (${width})`, async ({ page }) => {
      await openAt(page, '/?choose', width, 900);
      await page.locator('.desk').evaluate((el) => el.classList.add('is-aside')); // the whole cover in view
      const low = await page.evaluate(() => {
        const parse = (v: string): number[] | null => {
          const m = /rgba?\(([^)]*)\)/.exec(v);
          if (!m) return null;
          const n = m[1]!.split(/[\s,/]+/).filter(Boolean).map(Number);
          return [n[0]!, n[1]!, n[2]!, n[3] ?? 1];
        };
        const lum = (c: number[]) => {
          const f = (x: number) => { const s = x / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
          return 0.2126 * f(c[0]!) + 0.7152 * f(c[1]!) + 0.0722 * f(c[2]!);
        };
        const ratio = (a: number[], b: number[]) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x! + 0.05) / (y! + 0.05); };
        const bgOf = (el: Element): number[] => {
          for (let e: Element | null = el; e; e = e.parentElement) {
            if (e.classList.contains('cta__face')) { const b = parse(getComputedStyle(e, '::after').backgroundColor); if (b && b[3]! > 0) return b; }
            const b = parse(getComputedStyle(e).backgroundColor);
            if (b && b[3]! > 0.5) return b;
          }
          return [0, 0, 0, 1];
        };
        const shown = (el: Element) => {
          for (let e: Element | null = el; e; e = e.parentElement) {
            const cs = getComputedStyle(e);
            if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
          }
          return (el as HTMLElement).getClientRects().length > 0;
        };
        const out: string[] = [];
        for (const el of document.querySelectorAll('.file--game *')) {
          const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim() !== '');
          if (!own || !shown(el)) continue;
          const fg = parse(getComputedStyle(el).color)!;
          const bg = bgOf(el);
          const mixed = fg.slice(0, 3).map((v, i) => v * fg[3]! + bg[i]! * (1 - fg[3]!));
          const r = ratio(mixed, bg);
          if (r < 4.5) out.push(`${el.className || el.tagName}: ${r.toFixed(2)}`);
        }
        return out;
      });
      expect(low).toEqual([]);
    });
  }

  test('MO-33: yellow + cyan pixels ≤ 10% of the 375 and 1280 folds (printout hidden), ≥ 4% of the cover (the palette is present)', async ({ page }) => {
    for (const [w, h] of [[375, 812], [1280, 800]] as const) {
      await openAt(page, '/?choose', w, h);
      await page.locator('.file--data').evaluate((el) => (el as HTMLElement).style.setProperty('visibility', 'hidden', 'important'));
      await page.mouse.move(0, h - 1);
      const fold = await paletteShare(page, { x: 0, y: 0, width: w, height: h });
      expect(fold.yellow + fold.cyan, `fold @${w}`).toBeLessThanOrEqual(0.1);
      const r = await rectOf(page, '.file--game');
      const top = Math.max(0, r.top);
      const cover = await paletteShare(page, { x: Math.max(0, r.left), y: top, width: Math.min(w, r.right) - Math.max(0, r.left), height: Math.min(h, r.bottom) - top });
      expect(cover.yellow + cover.cyan, `cover @${w}`).toBeGreaterThanOrEqual(0.04);
      expect(cover.yellow + cover.cyan, `cover @${w}`).toBeLessThanOrEqual(0.1);
    }
  });

  test('MO-33: cover text boxes unchanged (±1 px) vs the MO-32 build at 375/768/1280', async ({ page }) => {
    const fixture = JSON.parse(readFileSync(new URL('./fixtures/cover-boxes.json', import.meta.url), 'utf8')) as Record<string, Record<string, number[]>>;
    for (const [key, boxes] of Object.entries(fixture)) {
      if (key.startsWith('_')) continue;
      const [lang, w] = key.split('@') as [string, string];
      await openAt(page, lang === 'en' ? '/en/?choose' : '/?choose', Number(w), 900);
      await page.evaluate(() => document.fonts.ready);
      const now = await page.evaluate((sels) => {
        const o = document.querySelector('.file--game .screen, .file--game .dev__screen > .face')!.getBoundingClientRect();
        const r: Record<string, number[]> = {};
        for (const s of sels) {
          const b = document.querySelector(`.file--game ${s}`)?.getBoundingClientRect();
          if (b?.width) r[s] = [b.left - o.left, b.top - o.top, b.width, b.height];
        }
        return r;
      }, Object.keys(boxes));
      for (const [sel, box] of Object.entries(boxes)) {
        expect(now[sel], `${key} ${sel}`).toBeDefined();
        box.forEach((v, i) => expect(Math.abs(now[sel]![i]! - v), `${key} ${sel}[${i}]`).toBeLessThanOrEqual(1));
      }
    }
  });
});
