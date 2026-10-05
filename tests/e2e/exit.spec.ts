// The chooser's exits (MO-38 game, MO-39 data, MO-40 sound): an activation plays a short exit on the desk before the
// next page loads. Frames are read with every animation paused and seeked (document.getAnimations()); the navigation is
// stubbed only where a frame is inspected.
import type { Page } from '@playwright/test';
import { test, expect, horizontalOverflow, openAt } from './helpers';

const GAME = 'a[data-choose-variant="game"]';
const GAME_HIT = '.file--game .cta__hit';

/** Click a link with its navigation timer held (so frames can be seeked), then pause every animation. */
async function startHeld(page: Page, link: string): Promise<void> {
  await page.evaluate((sel) => {
    const st = window.setTimeout;
    (window as unknown as { setTimeout: unknown }).setTimeout = (f: () => void, d?: number, ...r: unknown[]) => ([150, 800, 880].includes(d ?? 0) ? 0 : st(f, d, ...(r as [])));
    document.querySelector<HTMLAnchorElement>(sel)!.click();
    document.getAnimations().forEach((a) => a.pause());
  }, link);
}
const seek = (page: Page, ms: number) => page.evaluate((t) => document.getAnimations().forEach((a) => { a.currentTime = t; }), ms);
const style = (page: Page, sel: string, prop: string) => page.locator(sel).first().evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);
const scaleY = (m: string) => { const n = /matrix\(([^)]+)\)/.exec(m)?.[1]?.split(',').map(Number); return n ? n[3]! : 1; };
const scaleX = (m: string) => { const n = /matrix\(([^)]+)\)/.exec(m)?.[1]?.split(',').map(Number); return n ? n[0]! : 1; };
const tx = (m: string) => { const n = /matrix\(([^)]+)\)/.exec(m)?.[1]?.split(',').map(Number); return n ? n[4]! : 0; };
/** When the navigation started after the activating click (sessionStorage survives the navigation). */
const timeToLeave = (page: Page) =>
  page.evaluate(() => {
    let t0 = 0;
    document.addEventListener('click', () => { t0 = performance.now(); }, { capture: true });
    window.addEventListener('beforeunload', () => sessionStorage.setItem('x:dt', String(performance.now() - t0)));
  });

test.describe('MO-38: the game exit (the waveform)', () => {
  test('game exit: frames at 0/150/300/450/600/760/880 ms show strike, graticule, trace growing, collapse, line, near-black (pixel probes)', async ({ page }) => {
    await openAt(page, '/?choose', 1280, 800);
    await startHeld(page, GAME);
    await expect(page.locator('.desk')).toHaveAttribute('data-exit', 'game');
    await seek(page, 0);
    expect(Number(await style(page, '.file--game .stamp', 'opacity'))).toBeGreaterThan(0.3); // struck
    await seek(page, 300);
    expect(Number(await style(page, '.file--game .xg__grat', 'opacity'))).toBeGreaterThan(0.1);
    expect(tx(await style(page, '.file--game .xg__win', 'transform'))).toBeGreaterThan(-400); // the window is opening
    await seek(page, 450);
    expect(scaleY(await style(page, '.file--game .xg__amp', 'transform'))).toBeGreaterThan(0.6);
    expect(Number(await style(page, '.file--game .xg__q', 'opacity'))).toBeGreaterThan(0.4); // turning square
    await seek(page, 600);
    expect(scaleY(await style(page, '.file--game .dev__screen > .face', 'transform'))).toBeLessThan(0.9); // collapsing (ease-in)
    await seek(page, 700);
    expect(scaleY(await style(page, '.file--game .dev__screen > .face', 'transform'))).toBeLessThan(0.1);
    expect(Number(await style(page, '.file--game .xg__off', 'opacity'))).toBeGreaterThan(0.1);
    await seek(page, 760);
    expect(Number(await style(page, '.xnav__ln', 'opacity'))).toBeGreaterThan(0.5);
    expect(scaleX(await style(page, '.xnav__ln', 'transform'))).toBeGreaterThan(1.2);
    await seek(page, 880);
    expect(Number(await style(page, '.xnav__bg', 'opacity'))).toBeGreaterThan(0.97);
    // pixel probe: the page centre is near-black at the end
    const png = (await page.screenshot({ clip: { x: 630, y: 390, width: 20, height: 20 } })).toString('base64');
    const lum = await page.evaluate(async (b64) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      let m = 0;
      for (let i = 0; i < d.length; i += 4) m = Math.max(m, d[i]!, d[i + 1]!, d[i + 2]!);
      return m;
    }, png);
    expect(lum).toBeLessThan(30);
  });

  test("game exit: only transform and opacity animate (every running animation's keyframes; the stamp's colour change is a transition)", async ({ page }) => {
    await openAt(page, '/?choose', 1280, 800);
    await startHeld(page, GAME);
    const props = await page.evaluate(() => {
      const set = new Set<string>();
      for (const a of document.getAnimations().filter((x) => x instanceof CSSAnimation)) for (const k of (a.effect as KeyframeEffect).getKeyframes()) for (const p of Object.keys(k)) set.add(p);
      return [...set].filter((p) => !['offset', 'computedOffset', 'easing', 'composite'].includes(p)).sort();
    });
    expect(props.length).toBeGreaterThan(0);
    expect(props.every((p) => p === 'transform' || p === 'opacity'), props.join(',')).toBe(true);
    expect(await page.locator('.desk *').evaluateAll((els) => els.filter((el) => getComputedStyle(el).willChange !== 'auto').length)).toBe(0);
  });

  test('game exit: /game/ is requested at 880 ± 60 ms; nothing is requested before', async ({ page }) => {
    await openAt(page, '/?choose', 1280, 800);
    await timeToLeave(page);
    const early: string[] = [];
    let armed = true;
    page.on('request', (r) => { if (armed && r.isNavigationRequest()) early.push(r.url()); });
    await page.locator(GAME_HIT).click({ position: { x: 24, y: 12 } });
    await page.waitForURL(/\/game\/$/);
    armed = false;
    const dt = Number(await page.evaluate(() => sessionStorage.getItem('x:dt')));
    expect(dt).toBeGreaterThanOrEqual(870);
    expect(dt).toBeLessThanOrEqual(940);
    expect(early.filter((u) => !/\/game\/$/.test(u))).toEqual([]);
  });

  test('game exit: reduced motion — a fade, /game/ at ≤ 300 ms', async ({ page }) => {
    await openAt(page, '/?choose', 1280, 800, { reducedMotion: true });
    await timeToLeave(page);
    await page.evaluate(() => {
      document.addEventListener('click', () => setTimeout(() => sessionStorage.setItem('x:kind', document.querySelector<HTMLElement>('.desk')!.dataset.exit ?? '')), { capture: true });
    });
    await page.locator(GAME_HIT).click({ position: { x: 24, y: 12 } });
    await page.waitForURL(/\/game\/$/);
    expect(await page.evaluate(() => sessionStorage.getItem('x:kind'))).toBe('fade');
    const dt = Number(await page.evaluate(() => sessionStorage.getItem('x:dt')));
    expect(dt).toBeGreaterThanOrEqual(140);
    expect(dt).toBeLessThanOrEqual(300);
  });

  for (const [w, h] of [[375, 812], [1280, 800]] as const) {
    test(`game exit: no horizontal scroll and no layout shift during the exit (${w})`, async ({ page }) => {
      await openAt(page, '/?choose', w, h);
      await page.evaluate(() => {
        (window as unknown as { __cls: number }).__cls = 0;
        new PerformanceObserver((l) => { for (const e of l.getEntries() as (PerformanceEntry & { value: number })[]) (window as unknown as { __cls: number }).__cls += e.value; }).observe({ type: 'layout-shift' });
      });
      await startHeld(page, GAME);
      for (const t of [0, 300, 600, 760, 880]) {
        await seek(page, t);
        const o = await horizontalOverflow(page);
        expect(o.scrollWidth, `${t} ms: ${o.offenders.join(', ')}`).toBeLessThanOrEqual(o.width);
      }
      await page.waitForTimeout(300);
      expect(await page.evaluate(() => (window as unknown as { __cls: number }).__cls)).toBeLessThanOrEqual(0.02);
    });
  }

  test('game exit: back (bfcache) shows the desk at rest', async ({ page }) => {
    await openAt(page, '/?choose', 1280, 800);
    await page.locator(GAME_HIT).click({ position: { x: 24, y: 12 } });
    await page.waitForURL(/\/game\/$/);
    await page.goBack();
    await expect(page).toHaveURL(/\?choose$/);
    await expect(page.locator('.desk')).not.toHaveAttribute('data-exit', /.+/);
    await expect(page.locator('.desk')).not.toHaveClass(/is-aside/);
    expect(await style(page, '.xnav', 'display')).toBe('none');
    expect(await style(page, '.file--game .xg', 'display')).toBe('none');
  });
});
