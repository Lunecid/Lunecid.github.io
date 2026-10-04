import type { Page } from '@playwright/test';
import { test, expect, NO_ART_ORIGIN, settle } from './helpers';

// PL-2: the site-achievement list and the meter show medals. The list mints a medal only on a live unlock (never at a
// page load); the meter keeps its single pop after the fill bar; reduced motion fades, print does not animate.
// The no-art build is used because only there the Player Log's first row carries the meter beside the list.
const URL = `${NO_ART_ORIGIN}/game/player-log/`;
const SECRET = 'konami';
const listMedal = (id: string) => `#site-achievements [data-ach-id="${id}"] .medal`;
const meterMedal = (id: string) => `[data-ach-meter] [data-ach-slot="${id}"] .medal`;

type Anim = { name: string; delay: number; duration: number; props: string[] };

async function open(page: Page, stored: string[] = []): Promise<void> {
  await page.addInitScript((ids: string[]) => {
    // only on the first load of this test (a reload must not undo a live unlock)
    if (sessionStorage.getItem('pl2-seeded')) return;
    sessionStorage.setItem('pl2-seeded', '1');
    localStorage.clear();
    if (ids.length) localStorage.setItem('sb:achievements', JSON.stringify(Object.fromEntries(ids.map((id) => [id, new Date().toISOString()]))));
  }, stored);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(URL, { waitUntil: 'networkidle' });
  await settle(page);
}

/** Writes the unlock to the shared store and fires the live event, as unlock() in src/lib/achievements does. */
async function unlockLive(page: Page, id: string): Promise<void> {
  await page.evaluate((key) => {
    const stored = JSON.parse(localStorage.getItem('sb:achievements') ?? '{}') as Record<string, string>;
    localStorage.setItem('sb:achievements', JSON.stringify({ ...stored, [key]: new Date().toISOString() }));
    window.dispatchEvent(new CustomEvent('sb:achievement-unlocked', { detail: { id: key } }));
  }, id);
}

const animationsOf = (page: Page, selector: string): Promise<Anim[]> =>
  page.locator(selector).evaluate((el) =>
    el.getAnimations().map((a) => {
      const effect = a.effect as KeyframeEffect;
      const timing = effect.getComputedTiming();
      const props = new Set<string>();
      for (const frame of effect.getKeyframes()) {
        for (const key of Object.keys(frame)) if (!['offset', 'computedOffset', 'easing', 'composite'].includes(key)) props.add(key);
      }
      return { name: (a as CSSAnimation).animationName, delay: Number(timing.delay), duration: Number(timing.duration), props: [...props].sort() };
    }),
  );

const firstLocked = (page: Page): Promise<string> =>
  page.evaluate(
    (secret) =>
      [...document.querySelectorAll<HTMLElement>('#site-achievements [data-ach-id][data-unlocked="false"]')].map((li) => li.dataset.achId ?? '').find((id) => id !== secret) ?? '',
    SECRET,
  );

test.describe('PL-2: medals in the list and the meter', () => {
  test('a stored unlock shows a gold medal at load without a pop in the list; the meter pops after its fill', async ({ page }) => {
    await open(page, ['abstract-reader']);
    const list = page.locator(listMedal('abstract-reader'));
    await expect(list).toHaveAttribute('data-state', 'unlocked');
    await expect(list).not.toHaveAttribute('data-pop', /.*/);
    expect(await list.evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
    expect(await animationsOf(page, listMedal('abstract-reader'))).toEqual([]);
    expect(await page.locator(`${listMedal('abstract-reader')} .medal__disc`).evaluate((el) => getComputedStyle(el).fill)).toBe('rgb(245, 179, 1)');
    // the meter: the same medal, minted once the fill bar (--dur-enter) has arrived
    const meter = page.locator(meterMedal('abstract-reader'));
    await expect(meter).toHaveAttribute('data-state', 'unlocked');
    const fillMs = await page.locator('.ach-meter__fill').evaluate((el) => parseFloat(getComputedStyle(el).transitionDuration) * 1000);
    expect(fillMs).toBeGreaterThan(0);
    const style = await meter.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { name: cs.animationName, delay: parseFloat(cs.animationDelay) * 1000, duration: parseFloat(cs.animationDuration) * 1000 };
    });
    expect(style).toEqual({ name: 'medal-mint', delay: fillMs, duration: 360 });
    // locked medals elsewhere stay outlines with no animation
    const other = await firstLocked(page);
    await expect(page.locator(listMedal(other))).toHaveAttribute('data-state', 'locked');
    await expect(page.locator(meterMedal(other))).toHaveAttribute('data-state', 'locked');
    expect(await page.locator(meterMedal(other)).evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
  });

  test('a live unlock pops the list medal once within 400 ms (transform and opacity only)', async ({ page }) => {
    await open(page);
    const id = await firstLocked(page);
    const medal = page.locator(listMedal(id));
    await expect(medal).toHaveAttribute('data-state', 'locked');
    await unlockLive(page, id);
    await expect(medal).toHaveAttribute('data-state', 'unlocked');
    const [pop, ...rest] = await animationsOf(page, listMedal(id));
    expect(rest, 'a single animation').toEqual([]);
    expect(pop?.name).toBe('medal-mint');
    expect(pop!.delay).toBe(0);
    expect(pop!.duration).toBeGreaterThan(0);
    expect(pop!.duration).toBeLessThanOrEqual(400);
    expect(pop!.props).toEqual(['opacity', 'transform']);
    // the pop ends, data-pop goes, and another event does not replay it
    await expect(medal).not.toHaveAttribute('data-pop', /.*/, { timeout: 2000 });
    expect(await animationsOf(page, listMedal(id))).toEqual([]);
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('sb:achievement-unlocked', { detail: { id: 'x' } })));
    expect(await animationsOf(page, listMedal(id))).toEqual([]);
    await expect(medal).not.toHaveAttribute('data-pop', /.*/);
    // a reload finds the stored unlock: gold, no pop
    await page.reload({ waitUntil: 'networkidle' });
    await settle(page);
    await expect(medal).toHaveAttribute('data-state', 'unlocked');
    expect(await animationsOf(page, listMedal(id))).toEqual([]);
  });

  test('the secret medal is a ? until unlocked, then its emblem', async ({ page }) => {
    await open(page);
    for (const selector of [listMedal(SECRET), meterMedal(SECRET)]) {
      await expect(page.locator(selector)).toHaveAttribute('data-state', 'hidden');
      await expect(page.locator(`${selector} .medal__q`)).toBeVisible();
      await expect(page.locator(`${selector} .medal__emblem`)).toBeHidden();
    }
    await unlockLive(page, SECRET);
    for (const selector of [listMedal(SECRET), meterMedal(SECRET)]) {
      await expect(page.locator(selector)).toHaveAttribute('data-state', 'unlocked');
      await expect(page.locator(`${selector} .medal__q`)).toBeHidden();
      await expect(page.locator(`${selector} .medal__emblem`)).toBeVisible();
    }
  });

  test('reduced motion: the pop is an opacity fade only', async ({ page }) => {
    await open(page);
    // the site's switch
    await page.evaluate(() => document.documentElement.setAttribute('data-motion', 'reduce'));
    const first = await firstLocked(page);
    await unlockLive(page, first);
    const [fade, ...more] = await animationsOf(page, listMedal(first));
    expect(more).toEqual([]);
    expect(fade?.name).toBe('medal-fade');
    expect(fade!.props).toEqual(['opacity']);
    expect(await animationsOf(page, meterMedal(first)), 'the meter does not pop').toEqual([]);
    // the OS setting (data-motion pinned to 'full' so only the media query is tested)
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate(() => document.documentElement.setAttribute('data-motion', 'full'));
    const second = await firstLocked(page);
    await unlockLive(page, second);
    const [fade2, ...more2] = await animationsOf(page, listMedal(second));
    expect(more2).toEqual([]);
    expect(fade2?.name).toBe('medal-fade');
    expect(fade2!.props).toEqual(['opacity']);
    expect(await animationsOf(page, meterMedal(second)), 'the meter does not pop').toEqual([]);
  });

  test('forced colors: locked and unlocked medals stay visible', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await open(page, ['abstract-reader']);
    const locked = await firstLocked(page);
    for (const [selector, state] of [
      [listMedal('abstract-reader'), 'unlocked'],
      [listMedal(locked), 'locked'],
      [meterMedal('abstract-reader'), 'unlocked'],
      [meterMedal(locked), 'locked'],
    ] as const) {
      const medal = page.locator(selector);
      await expect(medal).toHaveAttribute('data-state', state);
      await expect(medal).toBeVisible();
      const box = await medal.boundingBox();
      expect(box!.width, selector).toBeGreaterThanOrEqual(16);
      const paint = await page.locator(`${selector} .medal__rim`).evaluate((el) => {
        const cs = getComputedStyle(el);
        return { stroke: cs.stroke, width: parseFloat(cs.strokeWidth) };
      });
      expect(paint.stroke, `${selector}: the rim is drawn`).not.toMatch(/^(none|transparent|rgba\(0, 0, 0, 0\))$/);
      expect(paint.width).toBeGreaterThan(0);
      const emblem = await page.locator(`${selector} .medal__emblem`).evaluate((el) => getComputedStyle(el).stroke);
      expect(emblem, `${selector}: the emblem is drawn`).toBe(paint.stroke);
    }
  });

  test('print: no medal animates; the secret item stays hidden', async ({ page }) => {
    await open(page, ['abstract-reader']);
    await page.emulateMedia({ media: 'print' });
    const id = await firstLocked(page);
    await unlockLive(page, id);
    await expect(page.locator(listMedal(id))).toHaveAttribute('data-state', 'unlocked');
    const running = await page.evaluate(() => [...document.querySelectorAll('.medal')].filter((el) => el.getAnimations().length > 0).length);
    expect(running, 'no medal animates on paper').toBe(0);
    for (const secret of await page.locator('#site-achievements [data-secret]').all()) await expect(secret).toBeHidden();
  });
});
