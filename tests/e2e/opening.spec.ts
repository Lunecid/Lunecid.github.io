// The chooser's opening (MO-41, chooser v6.12; owner 2026-10-07): on the first chooser view of a session the tablet and
// the props stand still on the desk, the tablet's screen powers on and the game file decrypts on it, then the printout
// (with its folder, clip and flag) drops onto the desk from above and its rubber stamp lands; ~2.40 s, once per session (sb:intro), never with ?choose, after the
// pre-paint redirect, under reduced motion or without JS. Any input ends it at once; a press only ends it.
import type { Browser, BrowserContextOptions, Page } from '@playwright/test';
import { test, expect } from './helpers';

const GAME = 'a[data-choose-variant="game"]';

/** A fresh context (a new session: the opening plays) with the page loaded, its animation clock read at the first frame. */
async function fresh(browser: Browser, width: number, height: number, opts: BrowserContextOptions = {}, route = '/', before?: (page: Page) => Promise<unknown>): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext({ viewport: { width, height }, ...opts });
  const page = await context.newPage();
  if (before) await before(page);
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

/**
 * Holds the opening's end until __releaseOpening(): its done and safety timers (2400 and 3400 ms, OPENING_TIMING in
 * src/lib/head-init.ts) are kept from firing, so a check reads the opening while it plays however slow the runner is
 * (a loaded runner can reach a check after a timer-bound end). Records the requested delay of the timer that ended it
 * (doneMs) and when that timer was armed (armedAt). A key press still ends the opening at once (skip calls done()).
 */
const holdOpeningEnd = (p: Page) =>
  p.addInitScript((held: number[]) => {
    type Rec = { doneMs: number | null; armedAt: number | null };
    const w = window as Window & { __opening?: Rec; __releaseOpening?: () => void };
    const rec: Rec = (w.__opening = { doneMs: null, armedAt: null });
    const set = window.setTimeout.bind(window);
    const toHold = new Set(held);
    const waiting: { fn: () => void; ms: number }[] = [];
    window.setTimeout = ((fn: () => void, ms?: number) => {
      if (toHold.delete(Number(ms))) {
        if (Number(ms) === held[0]) rec.armedAt = performance.now();
        waiting.push({ fn, ms: Number(ms) });
        return -waiting.length; // never fires by itself; clearTimeout of it is harmless
      }
      return set(fn, ms);
    }) as typeof window.setTimeout;
    w.__releaseOpening = () => {
      const d = document.documentElement;
      for (const { fn, ms } of waiting.filter((x) => x.ms === held[0])) {
        const before = d.hasAttribute('data-intro');
        fn();
        if (before && !d.hasAttribute('data-intro')) rec.doneMs = ms;
      }
    };
  }, [2400, 3400]);

test.describe('MO-41: the opening', () => {
  test('MO-41: first visit — tablet and props still, screen on at 170 ms, the printout drops and lands at ~2.15 s, rubber stamp by 2.40 s, data-intro gone by 2.6 s; sb:intro = 1', async ({ browser }) => {
    // the end is held (holdOpeningEnd) so every check reads the opening while it plays; "done at 2.40 s after the first
    // paint" is the requested delay of the timer that ends it, armed at the first paint
    const { page, close } = await fresh(browser, 1280, 800, {}, '/', holdOpeningEnd);
    await expect(page.locator('html')).toHaveAttribute('data-intro', 'opening');
    expect(await page.evaluate(() => sessionStorage.getItem('sb:intro'))).toBe('1');
    // the tablet, its file and the props never move (owner 2026-10-07); only the screen powers on
    for (const sel of ['.desk > .file--game', '.file--game .dev', '.desk .prop']) {
      expect(await page.locator(sel).evaluateAll((els) => els.flatMap((el) => el.getAnimations().map((a) => (a as CSSAnimation).animationName))), sel).toEqual([]);
    }
    expect((await timing(page, '.file--game .dev__pwr', 'op-pwr'))!.delay).toBeCloseTo(170, 0);
    const toss = await timing(page, '.desk > .file--data', 'op-drop');
    expect(toss!.delay).toBeCloseTo(1548, 0);
    expect(toss!.end).toBeCloseTo(2148, 0);
    expect((await timing(page, '.file--data .rstamp__ink', 'op-stamp'))!.end).toBeCloseTo(2398, 0);
    // the overlay plays on the lit screen and is gone before the drop
    expect((await timing(page, '.ov__st', 'op-status'))!.end).toBeLessThanOrEqual(toss!.delay + 1);
    await expect(page.locator('.ov')).toBeVisible();
    await page.evaluate(() => (window as Window & { __releaseOpening?: () => void }).__releaseOpening!());
    await page.waitForFunction(() => !document.documentElement.hasAttribute('data-intro'));
    // done (data-intro removed, sb:intro-done) by the 2400 ms timer armed at the first paint
    const { rec, fcp } = await page.evaluate(() => ({ rec: (window as Window & { __opening?: { doneMs: number | null; armedAt: number | null } }).__opening!, fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? -1 }));
    expect(rec.doneMs, JSON.stringify(rec)).toBe(2400);
    expect(rec.armedAt!, JSON.stringify({ rec, fcp })).toBeGreaterThanOrEqual(fcp);
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

    test(`MO-41: CLS ≤ 0.02 over the opening; no horizontal scroll mid-drop (${w}×${h})`, async ({ browser }) => {
      const { page, close } = await fresh(browser, w, h);
      await page.waitForTimeout(1800); // mid-drop
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
      // the opening's own end is held (holdOpeningEnd): only the input can end it, however slow the runner
      const { page, close } = await fresh(browser, name === 'touchstart' ? 390 : 1280, 800, opts, '/', holdOpeningEnd);
      await page.waitForTimeout(500);
      await expect(page.locator('html'), name).toHaveAttribute('data-intro', 'opening');
      await input(page);
      // ended by the input itself (synchronously, in its listener): the opening's own end is held
      await expect.poll(() => page.evaluate(() => document.documentElement.hasAttribute('data-intro')), { message: `${name}: ended` }).toBe(false);
      // at rest at once: no animation left on the drop, the overlay gone
      expect(await page.locator('.desk > .file--data').evaluate((el) => el.getAnimations().length), name).toBe(0);
      await expect(page.locator('.ov'), name).toBeHidden();
      await close();
    }
  });

  test('MO-41: a press during the opening ends it without navigating or striking', async ({ browser }) => {
    // the opening's own end is held (holdOpeningEnd), so the press always comes while it plays
    const { page, close } = await fresh(browser, 1280, 800, {}, '/', holdOpeningEnd);
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

  // 2026-10-07 (owner ruling): an older build's stored choice no longer redirects; the chooser opens as on a first visit
  test('MO-41: an old home anchor redirects before paint with no opening, and /game/ then plays the CRT', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    await page.goto('/#hello');
    await page.waitForURL(/\/game\/#hello$/);
    await expect(page.locator('html')).toHaveAttribute('data-intro-played', '');
    await context.close();
  });

  test('2026-10-07: an older build\'s stored choice opens the chooser, not that version, and is removed', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await context.addInitScript(() => {
      if (location.pathname === '/' && sessionStorage.getItem('seeded') === null) {
        sessionStorage.setItem('seeded', '1');
        localStorage.setItem('sb:variant', 'game');
      }
    });
    const page = await context.newPage();
    await page.goto('/');
    expect(new URL(page.url()).pathname).toBe('/');
    await expect(page.locator('a[data-choose-variant]')).toHaveCount(2);
    expect(await page.evaluate(() => localStorage.getItem('sb:variant'))).toBeNull();
    await context.close();
  });

  test('MO-27: neon glyphs animate opacity only, at most three cycles, staggered 10–30 ms; none animates after the opening or after a key press', async ({ browser }) => {
    // each line is split just before it types: read them once the last one is (the opening held until then)
    const { page, close } = await fresh(browser, 1280, 800, {}, '/', holdOpeningEnd);
    await page.waitForSelector('.cv__sn .ng', { state: 'attached' });
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
    const { page, close } = await fresh(browser, 375, 812, {}, '/', holdOpeningEnd);
    await page.waitForSelector('.cv__sn .ng', { state: 'attached' }); // every line split: the DOM's peak (.cv__sn may be hidden at 375)
    expect(await page.locator('h1 .ng, h2 .ng, .disp .ng, .intro .ng, .pr__intro .ng, .toc .ng, .cta .ng, .file--data .ng').count()).toBe(0);
    const peak = await page.evaluate(() => document.getElementsByTagName('*').length);
    expect(peak).toBeLessThanOrEqual(800);
    await page.evaluate(() => (window as Window & { __releaseOpening?: () => void }).__releaseOpening!());
    await page.waitForFunction(() => !document.documentElement.hasAttribute('data-intro'));
    expect(await page.locator('.ng, .file--game .sr-only').count()).toBe(0);
    expect(await page.evaluate(() => document.getElementsByTagName('*').length)).toBeLessThanOrEqual(800);
    await close();
  });
});
