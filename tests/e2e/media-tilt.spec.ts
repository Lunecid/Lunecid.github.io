// GP-7 (game palette v4): research and project media lean slightly on hover (fine pointer) and keyboard focus; only
// the frame's transform moves, never text; reduced motion keeps a static frame highlight; touch never tilts.
import { test, expect, settle } from './helpers';
import type { Locator, Page } from '@playwright/test';

const MEDIA = '.cart:not(.cart--static) .cart__img, .rh .paper__fig .chart__scroll, .interests__fig .interests__img, .interests__fig--chart .chart__scroll';
const CYAN = 'rgb(0, 229, 255)';
const DEEP_CYAN = 'rgb(0, 111, 128)';

const angleOf = (t: string): number => {
  if (!t || t === 'none') return 0;
  const m = /matrix\(([^)]+)\)/.exec(t);
  if (!m) return NaN;
  const [a, b] = m[1]!.split(',').map(Number);
  return (Math.atan2(b!, a!) * 180) / Math.PI;
};

/** The angle each target is meant to lean by: odd cards −2°, even +2°, the wide card ±1.25°, charts and figures −0.8°. */
async function expectedAngle(el: Locator): Promise<number> {
  return el.evaluate((node) => {
    const cart = node.closest('.cart');
    if (!cart) return -0.8;
    const index = Array.from(cart.parentElement!.children).indexOf(cart) + 1;
    const dir = index % 2 === 1 ? -1 : 1;
    return dir * (cart.classList.contains('cart--wide') ? 1.25 : 2);
  });
}

async function targets(page: Page): Promise<Locator[]> {
  const all = page.locator(MEDIA);
  const out: Locator[] = [];
  for (let i = 0; i < (await all.count()); i++) if (await all.nth(i).isVisible()) out.push(all.nth(i));
  return out;
}

const settled = (el: Locator) => el.evaluate((node) => Promise.all(node.getAnimations().map((a) => a.finished)).then(() => getComputedStyle(node).transform));

test.describe('GP-7: media tilt', () => {
  for (const route of ['/game/', '/game/projects/', '/game/research/', '/en/game/']) {
    test(`GP-7: hover tilts each target by its angle (matrix → degrees ±0.05) and only transform moves (box unchanged) — ${route}`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(route, { waitUntil: 'networkidle' });
      await settle(page);
      const list = await targets(page);
      expect(list.length, route).toBeGreaterThan(0);
      for (const el of list) {
        await el.scrollIntoViewIfNeeded();
        const before = await el.evaluate((n) => { const h = n as HTMLElement; return [h.offsetLeft, h.offsetTop, h.offsetWidth, h.offsetHeight].join(','); });
        await el.hover({ force: true });
        const t = await settled(el);
        const want = await expectedAngle(el);
        expect(Math.abs(angleOf(t) - want), `${route} angle ${angleOf(t).toFixed(2)} vs ${want}`).toBeLessThanOrEqual(0.05);
        const after = await el.evaluate((n) => { const h = n as HTMLElement; return [h.offsetLeft, h.offsetTop, h.offsetWidth, h.offsetHeight].join(','); });
        expect(after, 'layout box').toBe(before);
        await page.mouse.move(2, 2);
      }
    });
  }

  test('GP-7: keyboard focus gives the same tilt and the cyan keyline', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/game/', { waitUntil: 'networkidle' });
    await settle(page);
    await page.keyboard.press('Tab');
    const cart = page.locator('.cart:not(.cart--static)').filter({ has: page.locator('.cart__img') }).first();
    await cart.locator('.cart__link').evaluate((el) => (el as HTMLElement).focus());
    const img = cart.locator('.cart__img');
    const t = await settled(img);
    expect(Math.abs(angleOf(t) - (await expectedAngle(img)))).toBeLessThanOrEqual(0.05);
    expect(await img.evaluate((el) => getComputedStyle(el).outlineColor)).toBe(CYAN);
    // the research chart: focus inside the figure (its table toggle); the keyline is deep cyan on the white panel
    const fig = page.locator('.rh .paper__fig');
    await fig.locator('summary, button, a').first().evaluate((el) => (el as HTMLElement).focus());
    const chart = fig.locator('.chart__scroll:visible');
    expect(Math.abs(angleOf(await settled(chart)) + 0.8)).toBeLessThanOrEqual(0.05);
    expect(await chart.evaluate((el) => getComputedStyle(el).outlineColor)).toBe(DEEP_CYAN);
  });

  for (const path of ['os', 'toggle'] as const) {
    test(`GP-7: reduced motion via ${path === 'os' ? 'OS' : 'the site toggle'}: transform none, the frame highlight remains`, async ({ page }) => {
      if (path === 'os') await page.emulateMedia({ reducedMotion: 'reduce' });
      else await page.addInitScript(() => { try { localStorage.setItem('sb:motion', 'off'); } catch { /* storage off */ } });
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto('/game/', { waitUntil: 'networkidle' });
      await settle(page);
      if (path === 'toggle') expect(await page.evaluate(() => document.documentElement.dataset.motion)).toBe('reduce');
      const img = (await targets(page))[0]!;
      await img.scrollIntoViewIfNeeded();
      await img.hover({ force: true });
      await page.waitForTimeout(300);
      const s = await img.evaluate((el) => ({ t: getComputedStyle(el).transform, o: getComputedStyle(el).outlineColor, sh: getComputedStyle(el).boxShadow, wc: getComputedStyle(el).willChange }));
      expect(s.t).toBe('none');
      expect(s.wc).toBe('auto');
      expect(s.o).toBe(CYAN);
      expect(s.sh).toContain('255, 230, 0');
    });
  }

  test('GP-7: touch emulation (hasTouch, 390 px): computed transform stays none during a press', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    await page.goto('/game/', { waitUntil: 'networkidle' });
    const img = (await targets(page))[0]!;
    await img.scrollIntoViewIfNeeded();
    const box = (await img.boundingBox())!;
    const client = await context.newCDPSession(page);
    const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
    await page.waitForTimeout(300);
    expect(await img.evaluate((el) => getComputedStyle(el).transform)).toBe('none');
    await client.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await context.close();
  });

  for (const width of [1280, 1440, 1068, 768]) {
    test(`GP-7: at ${width} the tilted frame + 4 px never meets a text node range rect (stickers excluded)`, async ({ page }) => {
      const problems: string[] = [];
      for (const route of ['/game/', '/game/projects/', '/game/research/', '/en/game/']) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(route, { waitUntil: 'networkidle' });
        await settle(page);
        for (const el of await targets(page)) {
          await el.scrollIntoViewIfNeeded();
          await el.hover({ force: true });
          await settled(el);
          const hits = await el.evaluate((node) => {
            const r = node.getBoundingClientRect();
            const pad = 4;
            const R = { l: r.left - pad, t: r.top - pad, r: r.right + pad, b: r.bottom + pad };
            const scope = node.closest('.cart-grid, .paper, .interests__row, .ed-icard') ?? document.body;
            const out: string[] = [];
            const tw = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
            for (let n = tw.nextNode(); n; n = tw.nextNode()) {
              const par = n.parentElement!;
              if (!n.textContent!.trim() || node.contains(n) || par.closest('.cart__sticker, .sr-only, [hidden]')) continue;
              const cs = getComputedStyle(par);
              if (cs.visibility === 'hidden' || cs.display === 'none') continue;
              const rg = document.createRange();
              rg.selectNodeContents(n);
              for (const q of Array.from(rg.getClientRects())) {
                if (q.width === 0 || q.height === 0) continue;
                if (q.left < R.r && R.l < q.right && q.top < R.b && R.t < q.bottom) out.push(n.textContent!.trim().slice(0, 24));
              }
            }
            return out;
          });
          if (hits.length) problems.push(`${route} @${width}: ${hits.join(' | ')}`);
          await page.mouse.move(2, 2);
        }
      }
      expect(problems).toEqual([]);
    });
  }

  test('GP-7: in-article figures and the ID photo never transform', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    for (const [route, sel] of [['/game/projects/school-zone-blindspots/', '.prose figure img'], ['/game/research/cog-2026-engagement/', '.paper img, .paper svg'], ['/game/records/', '.rhead__photo']] as const) {
      await page.goto(route, { waitUntil: 'networkidle' });
      const items = page.locator(sel);
      const n = await items.count();
      for (let i = 0; i < Math.min(n, 4); i++) {
        const el = items.nth(i);
        if (!(await el.isVisible())) continue;
        await el.scrollIntoViewIfNeeded();
        await el.hover({ force: true });
        await page.waitForTimeout(300);
        expect(await el.evaluate((node) => getComputedStyle(node).transform), `${route} ${sel} #${i}`).toBe('none');
      }
    }
  });
});
