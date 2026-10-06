// The chooser's opening (MO-41, chooser v6.12): on the first chooser view of a session the tablet rises and powers on,
// the props settle, the game file decrypts on its screen, then the printout (with its folder, clip and flag) is tossed
// onto the desk and its rubber stamp lands; ~2.40 s, once per session (sb:intro), never with ?choose, after the
// pre-paint redirect, under reduced motion or without JS. Any input ends it at once; a press only ends it.
import type { Browser, BrowserContextOptions, Page } from '@playwright/test';
import { test, expect } from './helpers';

const GAME = 'a[data-choose-variant="game"]';

/** A fresh context (a new session: the opening plays) with the page loaded, its animation clock read at the first frame. */
async function fresh(browser: Browser, width: number, height: number, opts: BrowserContextOptions = {}, route = '/'): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext({ viewport: { width, height }, ...opts });
  const page = await context.newPage();
  await page.addInitScript(() => {
    const w = window as Window & { __lcp?: { t: number; inDesk: boolean; inData: boolean; prop: boolean; size: number }[]; __cls?: number };
    w.__lcp = [];
    w.__cls = 0;
    window.addEventListener('sb:intro-done', () => { (window as Window & { __doneAt?: number }).__doneAt = performance.now(); });
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as (PerformanceEntry & { element?: Element | null; size: number })[]) {
          w.__lcp!.push({ t: e.startTime, size: e.size, inDesk: !!e.element?.closest('.desk'), inData: !!e.element?.closest('.file--data'), prop: !!e.element?.closest('.props') });
        }
      }).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) if (!e.hadRecentInput) w.__cls! += e.value;
      }).observe({ type: 'layout-shift', buffered: true });
    } catch { /* observers are optional */ }
  });
  await page.goto(route);
  return { page, close: () => context.close() };
}

/** End times (ms on the document timeline) of the CSS animation named `name` on the first element matching `sel`. */
const timing = (page: Page, sel: string, name: string) =>
  page.locator(sel).first().evaluate((el, n) => {
    const a = el.getAnimations().find((x) => (x as CSSAnimation).animationName === n);
    if (!a) return null;
    const t = a.effect!.getComputedTiming();
    return { delay: Number(t.delay), duration: Number(t.duration), end: Number(t.endTime) };
  }, name);

test.describe('MO-41: the opening', () => {
  test('MO-41: first visit — device at 280 ms, toss lands at ~2.15 s, rubber stamp by 2.40 s, data-intro gone by 2.6 s; sb:intro = 1', async ({ browser }) => {
    const { page, close } = await fresh(browser, 1280, 800);
    await expect(page.locator('html')).toHaveAttribute('data-intro', 'opening');
    expect(await page.evaluate(() => sessionStorage.getItem('sb:intro'))).toBe('1');
    const rise = await timing(page, '.file--game .dev', 'op-rise');
    expect(rise!.delay).toBe(0);
    expect(rise!.end).toBeCloseTo(280, 0);
    const toss = await timing(page, '.desk > .file--data', 'op-toss');
    expect(toss!.delay).toBeCloseTo(1548, 0);
    expect(toss!.end).toBeCloseTo(2148, 0);
    expect((await timing(page, '.file--data .rstamp__ink', 'op-stamp'))!.end).toBeCloseTo(2398, 0);
    // the overlay plays on the lit screen and is gone before the toss
    expect((await timing(page, '.ov__st', 'op-status'))!.end).toBeLessThanOrEqual(toss!.delay + 1);
    await expect(page.locator('.ov')).toBeVisible();
    await page.waitForFunction(() => !document.documentElement.hasAttribute('data-intro'), null, { timeout: 2600 + 1000 });
    // done (data-intro removed, sb:intro-done) 2.40 s after the first paint: within 2.6 s of it
    const { doneAt, fcp } = await page.evaluate(() => ({ doneAt: (window as Window & { __doneAt?: number }).__doneAt ?? -1, fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? -1 }));
    expect(doneAt - fcp).toBeGreaterThanOrEqual(2400 - 20);
    expect(doneAt - fcp).toBeLessThan(2600);
    await expect(page.locator('.ov')).toBeHidden();
    await close();
  });

  for (const [w, h] of [[375, 812], [1280, 800]] as const) {
    test(`MO-41: LCP entries after 3 s: element inside .desk, not .file--data, not a prop; time = first paint ± one frame (${w}×${h})`, async ({ browser }) => {
      const { page, close } = await fresh(browser, w, h);
      await page.waitForTimeout(3000);
      const { lcp, fcp } = await page.evaluate(() => ({
        lcp: (window as Window & { __lcp?: { t: number; inDesk: boolean; inData: boolean; prop: boolean }[] }).__lcp!,
        fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? -1,
      }));
      expect(lcp.length).toBeGreaterThan(0);
      const last = lcp.at(-1)!;
      expect(last.inDesk).toBe(true);
      expect(last.inData).toBe(false);
      expect(last.prop).toBe(false);
      expect(Math.abs(last.t - fcp)).toBeLessThanOrEqual(17);
      await close();
    });

    test(`MO-41: CLS ≤ 0.02 over the opening; no horizontal scroll mid-toss (${w}×${h})`, async ({ browser }) => {
      const { page, close } = await fresh(browser, w, h);
      await page.waitForTimeout(1800); // mid-toss
      const scroll = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth, window.scrollX]);
      expect(scroll[0]).toBeLessThanOrEqual(scroll[1]!);
      expect(scroll[2]).toBe(0);
      await page.waitForFunction(() => !document.documentElement.hasAttribute('data-intro'));
      expect(await page.evaluate(() => (window as Window & { __cls?: number }).__cls)).toBeLessThanOrEqual(0.02);
      await close();
    });
  }

  test('MO-41: any input skips at once: keydown, pointerdown, wheel, touchstart', async ({ browser }) => {
    const inputs: [string, (page: Page) => Promise<void>, BrowserContextOptions][] = [
      ['keydown', (page) => page.keyboard.press('Shift'), {}],
      ['pointerdown', async (page) => { await page.mouse.move(8, 400); await page.mouse.down(); await page.mouse.up(); }, {}],
      ['wheel', async (page) => { await page.mouse.move(640, 400); await page.mouse.wheel(0, 40); }, {}],
      ['touchstart', (page) => page.touchscreen.tap(8, 400), { hasTouch: true, isMobile: true }],
    ];
    for (const [name, input, opts] of inputs) {
      const { page, close } = await fresh(browser, name === 'touchstart' ? 390 : 1280, 800, opts);
      await page.waitForTimeout(500);
      await expect(page.locator('html'), name).toHaveAttribute('data-intro', 'opening');
      await input(page);
      // ended by the input itself (synchronously, in its listener): well before the opening would end
      await expect.poll(() => page.evaluate(() => document.documentElement.hasAttribute('data-intro')), { message: `${name}: ended`, timeout: 300 }).toBe(false);
      // at rest at once: no animation left on the toss, the overlay gone
      expect(await page.locator('.desk > .file--data').evaluate((el) => el.getAnimations().length), name).toBe(0);
      await expect(page.locator('.ov'), name).toBeHidden();
      await close();
    }
  });

  test('MO-41: a press during the opening ends it without navigating or striking', async ({ browser }) => {
    const { page, close } = await fresh(browser, 1280, 800);
    await page.waitForTimeout(600);
    const r = await page.locator('.file--game .dev__body').boundingBox();
    await page.mouse.click(r!.x + 40, r!.y + 40);
    await page.waitForTimeout(1200);
    expect(new URL(page.url()).pathname).toBe('/');
    expect(await page.locator('.desk').getAttribute('data-exit')).toBeNull();
    expect(await page.locator('.file--game .stamp').evaluate((el) => el.classList.contains('is-struck'))).toBe(false);
    expect(await page.evaluate(() => localStorage.getItem('sb:variant'))).toBeNull();
    // the next press is a choice
    await page.locator(GAME).click({ position: { x: 4, y: 4 } });
    await page.waitForURL(/\/game\/$/);
    await close();
  });

  test('MO-41: no opening on a second load, on /?choose, under reduced motion, or without JS', async ({ browser }) => {
    const second = await fresh(browser, 1280, 800);
    await second.page.reload();
    expect(await second.page.evaluate(() => document.documentElement.getAttribute('data-intro'))).toBeNull();
    await second.close();
    const choose = await fresh(browser, 1280, 800, {}, '/?choose');
    expect(await choose.page.evaluate(() => [document.documentElement.getAttribute('data-intro'), sessionStorage.getItem('sb:intro')])).toEqual([null, null]);
    await choose.close();
    const reduce = await fresh(browser, 1280, 800, { reducedMotion: 'reduce' });
    expect(await reduce.page.evaluate(() => document.documentElement.getAttribute('data-intro'))).toBeNull();
    await expect(reduce.page.locator('.ov')).toBeHidden();
    await reduce.close();
    const toggle = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await toggle.addInitScript(() => localStorage.setItem('sb:motion', 'off'));
    const tp = await toggle.newPage();
    await tp.goto('/');
    expect(await tp.evaluate(() => document.documentElement.getAttribute('data-intro'))).toBeNull();
    await toggle.close();
    const nojs = await fresh(browser, 1280, 800, { javaScriptEnabled: false });
    await expect(nojs.page.locator('.ov')).toBeHidden();
    expect(await nojs.page.locator('.desk > .file--data').evaluate((el) => getComputedStyle(el).transform)).toBe('none');
    await nojs.close();
  });

  test('MO-41: a stored choice redirects before paint with no opening, and /game/ then plays the CRT', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await context.addInitScript(() => {
      if (location.pathname === '/') localStorage.setItem('sb:variant', 'game');
    });
    const page = await context.newPage();
    await page.goto('/');
    await page.waitForURL(/\/game\/$/);
    await expect(page.locator('html')).toHaveAttribute('data-intro-played', '');
    await context.close();
  });

  test('MO-27: neon glyphs animate opacity only, at most three cycles, staggered 10–30 ms; none animates after the opening or after a key press', async ({ browser }) => {
    const { page, close } = await fresh(browser, 1280, 800);
    await page.waitForSelector('.ng');
    const info = await page.evaluate(() => {
      const lines = [...document.querySelectorAll('.ng')].map((g) => g.parentElement!.parentElement!);
      const uniq = [...new Set(lines)];
      return {
        props: [...new Set(document.querySelectorAll('.ng').length ? [...document.querySelectorAll('.ng')].flatMap((g) => g.getAnimations().flatMap((a) => (a.effect as KeyframeEffect).getKeyframes().flatMap((k) => Object.keys(k).filter((p) => !['offset', 'easing', 'composite', 'computedOffset'].includes(p))))) : [])],
        rises: Math.max(...[...document.querySelectorAll('.ng')].map((g) => { const v = (g.getAnimations()[0]!.effect as KeyframeEffect).getKeyframes().map((k) => Number(k.opacity)); return v.filter((x, i) => i > 0 && x > v[i - 1]!).length; })),
        steps: uniq.map((line) => { const d = [...line.querySelectorAll<HTMLElement>('.ng')].map((g) => parseFloat(g.style.getPropertyValue('--d'))); return d.length > 1 ? d[1]! - d[0]! : 18; }),
        targets: uniq.map((l) => l.className),
      };
    });
    expect(info.props).toEqual(['opacity']);
    expect(info.rises).toBeLessThanOrEqual(3);
    for (const st of info.steps) { expect(st).toBeGreaterThanOrEqual(10 - 0.1); expect(st).toBeLessThanOrEqual(30 + 0.1); }
    expect(info.targets.length).toBeGreaterThanOrEqual(10);
    await page.keyboard.press('Shift');
    expect(await page.locator('.ng').count()).toBe(0);
    expect(await page.locator('.bar__name').textContent()).toBe('GAME_ANALYST.DOC');
    await close();
  });

  test('MO-27: neon never touches the h1, the h2s, display words, taglines, contents or CTAs; after the opening the labels are plain text and the DOM stays ≤ 800 nodes (375)', async ({ browser }) => {
    const { page, close } = await fresh(browser, 375, 812);
    await page.waitForSelector('.ng');
    expect(await page.locator('h1 .ng, h2 .ng, .disp .ng, .intro .ng, .pr__intro .ng, .toc .ng, .cta .ng, .file--data .ng').count()).toBe(0);
    const peak = await page.evaluate(() => document.getElementsByTagName('*').length);
    expect(peak).toBeLessThanOrEqual(800);
    await page.waitForFunction(() => !document.documentElement.hasAttribute('data-intro'));
    expect(await page.locator('.ng, .file--game .sr-only').count()).toBe(0);
    expect(await page.evaluate(() => document.getElementsByTagName('*').length)).toBeLessThanOrEqual(800);
    await close();
  });
});
