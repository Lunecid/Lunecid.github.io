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
    expect(dt).toBeLessThanOrEqual(1000); // 880 ms timer; room for a loaded runner
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
    expect(dt).toBeLessThanOrEqual(400); // 150 ms timer; room for a loaded runner's event loop
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

const DATA = 'a[data-choose-variant="data"]';
const DATA_HIT = '.file--data .cta__hit';
/** Lowest luminance (0–255) in a viewport box: dark ink shows as a low value. */
async function darkest(page: Page, r: { x: number; y: number; width: number; height: number }): Promise<number> {
  const png = (await page.screenshot({ clip: r })).toString('base64');
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
    let m = 255;
    for (let i = 0; i < d.length; i += 4) m = Math.min(m, 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!);
    return m;
  }, png);
}

test.describe('MO-39: the data exit (the page turn)', () => {
  test('data exit: frames at 0/110/240/400/560/720/800 ms — the fold line starts at the bottom-right corner and passes the top-left by 720 ms (pixel probes on the paper vs the under sheet)', async ({ page }) => {
    await openAt(page, '/?choose', 1280, 800);
    const h2 = await page.locator('.file--data .pr__h2').evaluate((el) => el.getBoundingClientRect().toJSON() as DOMRect);
    const box = { x: h2.left, y: h2.top, width: h2.width, height: h2.height };
    expect(await darkest(page, box)).toBeLessThan(80); // ink at rest
    await startHeld(page, DATA);
    await expect(page.locator('.desk')).toHaveAttribute('data-exit', 'data');
    // the fold's distance from the sheet's top-left corner along the diagonal: D = turn's translate in its turned frame + 3000
    const fold = () => page.locator('.file--data .turn').evaluate((el) => {
      const m = new DOMMatrix(getComputedStyle(el).transform);
      const inv = new DOMMatrix().rotate(-45).multiply(m); // undo the 45° turn: what is left is the translate
      return inv.m41 + 3000;
    });
    const fw = await page.locator('.file--data').evaluate((el) => parseFloat(getComputedStyle(el).getPropertyValue('--fw')));
    const fh = await page.locator('.file--data').evaluate((el) => parseFloat(getComputedStyle(el).getPropertyValue('--fh')));
    const full = (fw + fh) * 0.7071;
    const ds: number[] = [];
    for (const t of [0, 110, 240, 400, 560, 720]) {
      await seek(page, t);
      ds.push(await fold());
    }
    expect(Math.abs(ds[0]! - full)).toBeLessThan(2); // at the bottom-right corner
    for (let i = 1; i < ds.length; i++) expect(ds[i]!, `step ${i}`).toBeLessThan(ds[i - 1]!);
    expect(ds.at(-1)!).toBeLessThanOrEqual(0); // past the top-left corner
    await seek(page, 720);
    expect(await darkest(page, box)).toBeGreaterThan(120); // the page has gone: no ink where the title was
    await seek(page, 800);
    expect(await page.locator('.file--data .flap').evaluate((el) => Number(getComputedStyle(el).opacity))).toBeLessThan(0.05);
  });

  test('data exit: only transform and opacity animate; no clip-path or background change while running', async ({ page }) => {
    await openAt(page, '/?choose', 1280, 800);
    await startHeld(page, DATA);
    const props = await page.evaluate(() => {
      const set = new Set<string>();
      for (const a of document.getAnimations().filter((x) => x instanceof CSSAnimation)) for (const k of (a.effect as KeyframeEffect).getKeyframes()) for (const p of Object.keys(k)) set.add(p);
      return [...set].filter((p) => !['offset', 'computedOffset', 'easing', 'composite'].includes(p)).sort();
    });
    expect(props).toEqual(['opacity', 'transform']);
    // the only transitions are the sheet's lift (transform) and its shadow (opacity)
    const transitions = await page.evaluate(() => document.getAnimations().filter((a) => a instanceof CSSTransition).map((a) => (a as CSSTransition).transitionProperty));
    expect(transitions.every((p) => p === 'transform' || p === 'opacity'), transitions.join(',')).toBe(true);
  });

  test('data exit: /data/ requested at 800 ± 60 ms', async ({ page }) => {
    await openAt(page, '/?choose', 1280, 800);
    await timeToLeave(page);
    await page.locator(DATA_HIT).click({ position: { x: 40, y: 40 } });
    await page.waitForURL(/\/data\/$/);
    const dt = Number(await page.evaluate(() => sessionStorage.getItem('x:dt')));
    expect(dt).toBeGreaterThanOrEqual(790);
    expect(dt).toBeLessThanOrEqual(920); // 800 ms timer; room for a loaded runner
  });

  test('data exit: the clip and the flag stay put while the page passes over them', async ({ page }) => {
    await openAt(page, '/?choose', 1280, 800);
    // positions relative to the sheet's face (the face itself only keeps its lift while the page turns)
    const rel = (sel: string) => page.evaluate((s2) => {
      const f = document.querySelector('.file--data .face')!.getBoundingClientRect();
      const r = document.querySelector(s2)!.getBoundingClientRect();
      return [r.left - f.left, r.top - f.top];
    }, sel);
    const before = { clip: await rel('.file--data .clip'), tab: await rel('.file--data .tab') };
    await startHeld(page, DATA);
    for (const t of [240, 400, 560]) {
      await seek(page, t);
      for (const k of ['clip', 'tab'] as const) {
        const now = await rel(`.file--data .${k}`);
        expect(Math.abs(now[0]! - before[k][0]!), `${k} x @${t}`).toBeLessThan(1);
        expect(Math.abs(now[1]! - before[k][1]!), `${k} y @${t}`).toBeLessThan(1);
      }
    }
  });

  test('data exit: reduced motion — a paper-coloured fade, /data/ at ≤ 300 ms', async ({ page }) => {
    await openAt(page, '/?choose', 1280, 800, { reducedMotion: true });
    await page.evaluate(() => {
      document.addEventListener('click', () => setTimeout(() => sessionStorage.setItem('x:bg', getComputedStyle(document.querySelector('.xnav__bg')!).backgroundColor)), { capture: true });
    });
    await timeToLeave(page);
    await page.locator(DATA_HIT).click({ position: { x: 40, y: 40 } });
    await page.waitForURL(/\/data\/$/);
    expect(await page.evaluate(() => sessionStorage.getItem('x:bg'))).toBe('rgb(251, 250, 246)');
    expect(Number(await page.evaluate(() => sessionStorage.getItem('x:dt')))).toBeLessThanOrEqual(400); // 150 ms timer
  });

  test('data exit: bfcache restores the sheet whole', async ({ page }) => {
    await openAt(page, '/?choose', 1280, 800);
    const rest = await page.locator('.file--data .feed').evaluate((el) => el.getBoundingClientRect().toJSON() as DOMRect);
    await page.locator(DATA_HIT).click({ position: { x: 40, y: 40 } });
    await page.waitForURL(/\/data\/$/);
    await page.goBack();
    await expect(page).toHaveURL(/\?choose$/);
    await expect(page.locator('.desk')).not.toHaveAttribute('data-exit', /.+/);
    expect(await page.locator('.file--data .turn').evaluate((el) => getComputedStyle(el).transform)).toBe('none');
    expect(await page.locator('.file--data .flap').evaluate((el) => getComputedStyle(el).display)).toBe('none');
    const back = await page.locator('.file--data .feed').evaluate((el) => el.getBoundingClientRect().toJSON() as DOMRect);
    expect(Math.abs(back.width - rest.width)).toBeLessThan(1);
    expect(Math.abs(back.height - rest.height)).toBeLessThan(1);
  });
});

test.describe('MO-40: the page-turn sound and its mute button', () => {
  /** Counts AudioContext constructions in the page (installed before any script runs). */
  const spyAudio = (page: Page) =>
    page.addInitScript(() => {
      const Real = window.AudioContext;
      (window as unknown as { __ac: number }).__ac = 0;
      window.AudioContext = class extends Real {
        constructor(...args: ConstructorParameters<typeof AudioContext>) {
          super(...args);
          (window as unknown as { __ac: number }).__ac += 1;
        }
      };
    });
  const made = (page: Page) => page.evaluate(() => (window as unknown as { __ac: number }).__ac);

  test('sound: a page with an AudioContext spy — none created before the click; one after the data click; none with reduced motion or sb:sound=off', async ({ page }) => {
    await spyAudio(page);
    await openAt(page, '/?choose', 1280, 800);
    await page.mouse.move(700, 400);
    await page.keyboard.press('Tab');
    await page.mouse.wheel(0, 200);
    expect(await made(page)).toBe(0);
    await startHeld(page, DATA);
    expect(await made(page)).toBe(1);
    await openAt(page, '/?choose', 1280, 800, { reducedMotion: true });
    await startHeld(page, DATA);
    expect(await made(page)).toBe(0);
    await openAt(page, '/?choose', 1280, 800);
    await page.evaluate(() => localStorage.setItem('sb:sound', 'off'));
    await page.reload();
    await startHeld(page, DATA);
    expect(await made(page)).toBe(0);
  });

  test('mute button: ≥ 44×44 px, keyboard-operable, focus ring ≥ 3:1, label in ko and en', async ({ page }) => {
    for (const [route, label] of [['/?choose', '효과음'], ['/en/?choose', 'Sound']] as const) {
      await openAt(page, route, 1280, 800);
      const b = page.locator('[data-sound-toggle]');
      await expect(b).toBeVisible();
      await expect(b).toContainText(label);
      const r = await b.evaluate((el) => el.getBoundingClientRect().toJSON() as DOMRect);
      expect(r.width).toBeGreaterThanOrEqual(44);
      expect(r.height).toBeGreaterThanOrEqual(44);
      await expect(b).toHaveAttribute('aria-pressed', 'true');
      // beside the caption, never over its words
      const over = await page.evaluate(() => {
        const bb = document.querySelector('[data-sound-toggle]')!.getBoundingClientRect();
        return [...document.querySelectorAll('.chooser__cap > span')].some((s) => { const r = s.getBoundingClientRect(); return r.right > bb.left && r.left < bb.right && r.bottom > bb.top && r.top < bb.bottom; });
      });
      expect(over).toBe(false);
      await b.focus();
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      await expect(b).toBeFocused();
      const ring = await b.evaluate((el) => [getComputedStyle(el).outlineStyle, getComputedStyle(el).outlineColor, getComputedStyle(el).outlineWidth]);
      expect(ring).toEqual(['solid', 'rgb(255, 230, 0)', '2px']); // yellow on the felt: ≥ 3:1 (tokens test)
      await page.keyboard.press('Enter');
      await expect(b).toHaveAttribute('aria-pressed', 'false');
      expect(await page.evaluate(() => localStorage.getItem('sb:sound'))).toBe('off');
      await page.keyboard.press('Space');
      await expect(b).toHaveAttribute('aria-pressed', 'true');
      expect(await page.evaluate(() => localStorage.getItem('sb:sound'))).toBe('on');
      await page.evaluate(() => localStorage.removeItem('sb:sound'));
    }
  });
});

test.describe('MO-42: one intro per session', () => {
  test('MO-42: an exit spends sb:intro, so /game/ after a chooser exit plays no CRT (also after ?choose)', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    await page.goto('/?choose');
    expect(await page.evaluate(() => sessionStorage.getItem('sb:intro'))).toBeNull();
    await page.locator(GAME_HIT).click({ position: { x: 24, y: 12 } });
    await page.waitForURL(/\/game\/$/);
    await expect(page.locator('html')).not.toHaveAttribute('data-intro-played', /.*/);
    expect(await page.evaluate(() => sessionStorage.getItem('sb:intro'))).toBe('1');
    await context.close();
  });
});
