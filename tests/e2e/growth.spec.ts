// The growth infographic on the four research pages (GrowthQuestLog on /game/research/, GrowthReport on /data/research/,
// both languages): placed right after the page header, no horizontal scroll, keyboard-reachable marks with a visible
// tooltip, the table view, the draw-on (final state without JS and under reduced motion), no CSP violation, no layout
// shift, axe clean.
import type { Page } from '@playwright/test';
import {
  test, expect, collectProblems, collectViolations, dataPath, expectNoAxeViolations, gamePath, horizontalOverflow, openAt, watchViolations,
} from './helpers';

const PAGES = [gamePath('/research/'), gamePath('/research/', 'en'), dataPath('/research/'), dataPath('/research/', 'en')] as const;
const isGame = (route: string) => route.includes('/game/');
/** The marks a keyboard reaches: quest nodes (game, all widths) and the role lane's marks (data, from 1000 px). */
const MARK = (route: string) => (isGame(route) ? '#growth a.gq-node' : '#growth a.gd-mk');

/** Scrolls the whole page in steps so every draw-on part has entered the viewport, then waits for them to finish. */
async function scrollThrough(page: Page): Promise<void> {
  await page.evaluate(async () => {
    for (let y = 0; y < document.documentElement.scrollHeight; y += 300) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 30));
    }
  });
  await page.waitForFunction(() => document.querySelectorAll('#growth .gr-wait').length === 0);
}

test.describe('growth infographic (GR)', () => {
  test.skip(({ browserName }) => browserName !== 'chromium');

  for (const route of PAGES) {
    test(`GR-5 ${route}: #growth follows the page header and precedes #interests; content in the page language`, async ({ page }) => {
      const problems = collectProblems(page);
      await openAt(page, route, 1280);
      const order = await page.evaluate(() => Array.from(document.querySelectorAll('main > section[id], main > header, main > div > header')).map((e) => e.id || e.className.split(' ')[0]));
      const g = order.indexOf('growth');
      expect(g, order.join(',')).toBeGreaterThan(-1);
      expect(order.indexOf('interests')).toBeGreaterThan(g);
      const heading = await page.locator('#growth-title').textContent();
      expect(heading).toBe(route.startsWith('/en/') ? 'Growing as a data analyst' : '성장하는 데이터 분석가');
      if (route.startsWith('/en/')) expect(await page.locator('#growth').innerText()).not.toMatch(/[가-힣]/);
      expect(problems).toEqual([]);
    });

    for (const width of [375, 1280]) {
      test(`GR-4 ${route} @${width}: no horizontal scroll; every visible part ends in its final state after scrolling`, async ({ page }) => {
        await openAt(page, route, width);
        await scrollThrough(page);
        const o = await horizontalOverflow(page);
        expect(o.scrollWidth, o.offenders.join(', ')).toBeLessThanOrEqual(o.width);
        // the staggered transitions end within a second or two
        await expect.poll(() => page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('#growth [data-gr-i]'))
          .filter((el) => el.getClientRects().length > 0 && Number(getComputedStyle(el).opacity) < 1).map((el) => el.className.toString())), { timeout: 5000 }).toEqual([]);
      });
    }
  }

  test('GR-4: the draw-on — parts below the fold wait, then draw when scrolled to; never above the fold', async ({ page }) => {
    await openAt(page, gamePath('/research/'), 1280, 800);
    const state = await page.evaluate(() => {
      // named change 2026-10-07: the desktop path ([data-gr-path]) is lit by its band, not by the per-part rule (test below)
      const parts = Array.from(document.querySelectorAll<HTMLElement>('#growth .gq-map [data-gr-i]:not([data-gr-path])'));
      const below = parts.filter((el) => el.getBoundingClientRect().top >= innerHeight);
      return { anim: document.querySelector('#growth .gq-map')?.hasAttribute('data-gr-anim'), waiting: below.filter((el) => el.classList.contains('gr-wait')).length, below: below.length,
        aboveWaiting: parts.filter((el) => el.getBoundingClientRect().top < innerHeight && el.getClientRects().length && el.classList.contains('gr-wait')).length };
    });
    expect(state.anim).toBe(true);
    expect(state.below).toBeGreaterThan(0);
    expect(state.waiting).toBe(state.below);
    expect(state.aboveWaiting).toBe(0);
    await page.locator('#gr-q-cog-2026-engagement').scrollIntoViewIfNeeded();
    await expect.poll(() => page.locator('#growth .gq-map .gr-wait').count()).toBeLessThan(state.waiting);
  });

  test('GR-4 constellation: a path already on screen at load is not shown finished; it draws in order (owner report 2026-10-07)', async ({ page }) => {
    // hold the reveal script for a second so the first paints can be read before it runs
    let release!: () => void;
    const held = new Promise<void>((r) => { release = r; });
    await page.route(/\/_astro\/growth-reveal\.[\w-]+\.js$/, async (route) => { await held; await route.continue(); });
    await page.setViewportSize({ width: 1280, height: 1500 });
    // a module script delays DOMContentLoaded, so wait for the parsed path and two painted frames instead
    await page.goto(gamePath('/research/'), { waitUntil: 'commit' });
    await page.waitForSelector('#growth .gq-node:last-of-type', { state: 'attached' });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const read = () => page.evaluate(() => {
      const band = document.querySelector('#growth .gq-path')!.getBoundingClientRect();
      const lines = Array.from(document.querySelectorAll<SVGLineElement>('#growth .gq-path line'));
      const pops = Array.from(document.querySelectorAll<HTMLElement>('#growth .gq-node .gq-node__pop'));
      return {
        bandOnScreen: band.top < innerHeight * 0.85,
        hidden: lines.filter((l) => /^matrix\(0, 0, 0, 0,/.test(getComputedStyle(l).transform)).length,
        lines: lines.length,
        popsHidden: pops.filter((p) => getComputedStyle(p).opacity === '0').length,
        pops: pops.length,
        lit: lines.filter((l) => l.classList.contains('gr-lit')).length,
        k: Array.from(document.querySelectorAll<HTMLElement>('#growth .gq-seg')).map((l) => Number(l.style.getPropertyValue('--gr-k'))),
      };
    });
    const before = await read();
    expect(before.bandOnScreen).toBe(true);
    expect(before.lit).toBe(0);
    expect(before.hidden).toBe(before.lines); // no finished path before the draw
    expect(before.popsHidden).toBe(before.pops);
    release();
    await expect.poll(async () => (await read()).lit, { timeout: 10_000 }).toBe(before.lines);
    const after = await read();
    expect(after.k).toEqual([...after.k].sort((a, b) => a - b)); // segments draw in path order
    expect(new Set(after.k).size).toBe(after.k.length);
    await expect.poll(async () => (await read()).hidden, { timeout: 10_000 }).toBe(0);
  });

  for (const route of [gamePath('/research/'), dataPath('/research/')]) {
    test(`GR-4 ${route}: reduced motion and no JS show the final state at once`, async ({ browser }) => {
      for (const opts of [{ reducedMotion: 'reduce' as const }, { javaScriptEnabled: false }]) {
        const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, ...opts });
        const page = await context.newPage();
        await page.goto(route, { waitUntil: 'networkidle' });
        expect(await page.locator('#growth .gr-wait').count(), JSON.stringify(opts)).toBe(0);
        expect(await page.locator('#growth [data-gr-anim]').count(), JSON.stringify(opts)).toBe(0);
        await context.close();
      }
    });
  }

  for (const route of PAGES) {
    test(`GR-4 ${route}: marks take keyboard focus (≥ 44 px targets) and show their tooltip; the table opens`, async ({ page }) => {
      await openAt(page, route, 1280);
      await scrollThrough(page);
      const marks = page.locator(MARK(route));
      const count = await marks.count();
      expect(count).toBeGreaterThanOrEqual(7);
      for (let i = 0; i < count; i++) {
        const mark = marks.nth(i);
        const b = await mark.boundingBox();
        expect(b!.width).toBeGreaterThanOrEqual(44);
        expect(b!.height).toBeGreaterThanOrEqual(44);
      }
      // reach the first mark from the element before it with Tab
      await marks.first().evaluate((el) => {
        const all = Array.from(document.querySelectorAll<HTMLElement>('a[href], button, summary, [tabindex="0"]'));
        all[all.indexOf(el as HTMLElement) - 1]?.focus();
      });
      await page.keyboard.press('Tab');
      await expect(marks.first()).toBeFocused();
      const tip = marks.first().locator(isGame(route) ? '.gq-tip' : '.gd-tip');
      await expect(tip).toBeVisible();
      await expect.poll(() => tip.evaluate((el) => Number(getComputedStyle(el).opacity))).toBeGreaterThan(0.5);
      const outline = await marks.first().evaluate((el) => getComputedStyle(el).outlineStyle);
      expect(outline).not.toBe('none');
      // the mark links to its card / column
      const href = await marks.first().getAttribute('href');
      expect(await page.locator(href!).count()).toBe(1);
      // table view
      const summary = page.locator('#growth details summary');
      expect((await summary.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await summary.focus();
      await page.keyboard.press('Enter');
      await expect(page.locator('#growth details table')).toBeVisible();
      expect(await page.locator('#growth details tbody th[scope="row"]').count()).toBe(10);
    });
  }

  test('GR-4: no CSP violation, no console error and CLS ≤ 0.02 on the four research pages (load and scroll)', async ({ page }) => {
    await watchViolations(page);
    for (const route of PAGES) {
      const problems = collectProblems(page);
      await openAt(page, route, 1280);
      await page.evaluate(() => {
        (window as unknown as { __cls: number }).__cls = 0;
        new PerformanceObserver((list) => {
          for (const e of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) if (!e.hadRecentInput) (window as unknown as { __cls: number }).__cls += e.value;
        }).observe({ type: 'layout-shift', buffered: true });
      });
      await scrollThrough(page);
      await page.waitForTimeout(300);
      const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);
      expect(cls, route).toBeLessThanOrEqual(0.02);
      expect(await collectViolations(page), route).toEqual([]);
      expect(problems, route).toEqual([]);
      page.removeAllListeners('console');
      page.removeAllListeners('pageerror');
      page.removeAllListeners('response');
    }
  });

  for (const route of PAGES) {
    for (const width of [375, 1280]) {
      test(`GR-4 ${route} @${width}: axe clean on #growth with the table open`, async ({ page }) => {
        await openAt(page, route, width, 900, { reducedMotion: true });
        await page.locator('#growth details').evaluate((d) => { (d as HTMLDetailsElement).open = true; });
        await expectNoAxeViolations(page, `${route} @${width}`);
      });
    }
  }

  // owner 2026-10-06: the thesis title and the PUBG working title (one source: research-page.ts ongoing)
  const THESIS = { ko: '리그오브레전드에서 승리 확률 변화에 기반한 교전 가치 정의 및 예측에 관한 연구', en: 'A Study on Defining and Predicting Engagement Value Based on Win-Probability Change in League of Legends' };
  const PUBG = 'Surviving a Shrinking Habitat';
  for (const route of PAGES) {
    test(`GR titles ${route} @375: the thesis title and the PUBG working title show in the growth slots and the in-progress list without overflow`, async ({ page }) => {
      const lang = route.startsWith('/en/') ? 'en' : 'ko';
      await openAt(page, route, 375);
      await scrollThrough(page);
      for (const scope of ['#growth', '#in-progress']) {
        const text = await page.locator(scope).innerText();
        expect(text, scope).toContain(THESIS[lang]);
        expect(text, scope).toContain(`${lang === 'ko' ? '가제' : 'Working title'}: ${PUBG}`);
      }
      const sticking = await page.evaluate(() => {
        const out: string[] = [];
        for (const el of Array.from(document.querySelectorAll<HTMLElement>('#growth .gq-q--lock, #growth .gd-smc--fut, #growth .gd-fut, #in-progress li'))) {
          if (el.getClientRects().length === 0) continue;
          const box = el.getBoundingClientRect();
          if (box.right > document.documentElement.clientWidth + 1 || el.scrollWidth > el.clientWidth + 1) out.push(`${el.className} ${Math.round(box.right)} ${el.scrollWidth}/${el.clientWidth}`);
        }
        return out;
      });
      expect(sticking).toEqual([]);
      const o = await horizontalOverflow(page);
      expect(o.scrollWidth, o.offenders.join(', ')).toBeLessThanOrEqual(o.width);
    });
  }

  test('GR titles: /records/ (both versions, both languages) shows the thesis title', async ({ page }) => {
    for (const route of [gamePath('/records/'), gamePath('/records/', 'en'), dataPath('/records/'), dataPath('/records/', 'en')]) {
      await page.goto(route, { waitUntil: 'load' });
      expect(await page.locator('main').innerText(), route).toContain(THESIS[route.startsWith('/en/') ? 'en' : 'ko']);
    }
  });

  test('GR-4: print shows the final state and hides the closed table', async ({ page }) => {
    await openAt(page, gamePath('/research/'), 1280, 800);
    await page.emulateMedia({ media: 'print' });
    expect(await page.locator('#growth .gq-q').evaluateAll((els) => els.filter((el) => Number(getComputedStyle(el).opacity) < 1).length)).toBe(0);
    expect(await page.locator('#growth details').evaluate((el) => getComputedStyle(el).display)).toBe('none');
  });
});
