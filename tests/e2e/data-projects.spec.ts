import { test, expect, dataPath } from './helpers';
import { dataVariant } from '../../src/variants/data';

const ITEMS = dataVariant.orders.projectsOrder.length;

test.describe('general projects page (P2-6)', () => {
  test('an editorial list in the version order, filterable by tag', async ({ page }) => {
    await page.goto(dataPath('/projects/'), { waitUntil: 'networkidle' });
    const items = page.locator('#project-grid > li[data-tags]');
    await expect(items).toHaveCount(ITEMS);
    await expect(page.locator('#project-grid .cart, #project-grid .cart__sticker')).toHaveCount(0);
    const first = await items.first().locator('.ed-card__title').textContent(); // DS-5 (named): cards
    expect(first?.trim()).toBe('사각지대를 예측하다'); // projectsOrder starts with school-zone-blindspots (contract §1.7)
    await page.locator('[data-tag-filter] [data-tag="ml"]').click();
    const hidden = await items.evaluateAll((els) => els.filter((el) => (el as HTMLElement).hidden).length);
    expect(hidden).toBeGreaterThan(0);
    // What the visitor sees: a filtered-out item must not render (the hidden property alone proves nothing).
    const shown = await items.evaluateAll((els) => els.filter((el) => getComputedStyle(el).display !== 'none').length);
    expect(shown).toBeLessThan(ITEMS);
    expect(shown).toBe(ITEMS - hidden);
    // The button's background animates over --dur-hover: a retrying assertion reads it after the transition.
    await expect(page.locator('[data-tag="ml"]')).toHaveCSS('background-color', 'rgb(20, 20, 20)');
  });

  test('DS-5: lead card full width at 1280, two columns at 768, one at 375; filtering keeps the lead first; status line counts', async ({ page }) => {
    for (const [width, columns] of [[1280, 2], [768, 2], [375, 1]] as const) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(dataPath('/projects/'), { waitUntil: 'networkidle' });
      const geo = await page.locator('#project-grid > li').evaluateAll((els) => els.map((el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), w: Math.round(r.width), lead: el.classList.contains('ed-card--lead') }; }));
      const grid = await page.locator('#project-grid').evaluate((el) => el.getBoundingClientRect().width);
      expect(geo[0]?.lead, `${width}: card 01 is the lead`).toBe(true);
      expect(geo.filter((g) => g.lead)).toHaveLength(1);
      expect(Math.abs((geo[0]?.w ?? 0) - grid), `${width}: the lead spans the grid`).toBeLessThanOrEqual(1);
      const xs = new Set(geo.slice(1).map((g) => g.x));
      expect(xs.size, `${width}: ${columns} column(s) below the lead`).toBe(columns);
      expect(await page.evaluate(() => document.documentElement.scrollWidth), `${width}: no horizontal scroll`).toBeLessThanOrEqual(width);
      if (width === 1280) {
        await expect(page.locator('.ed-phead .ed-mc--mosaic')).toBeVisible();
        const lcp = page.locator('#project-grid > li').first().locator('img');
        await expect(lcp).toHaveAttribute('fetchpriority', 'high');
      } else if (width === 375) {
        await expect(page.locator('.ed-phead .ed-mc--mosaic')).toBeHidden();
      }
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(dataPath('/projects/'), { waitUntil: 'networkidle' });
    await page.locator('[data-tag-filter] [data-tag="ml"]').click();
    const visible = page.locator('#project-grid > li:not([hidden])');
    await expect(visible.first()).toHaveClass(/ed-card--lead/); // school-zone carries ml: the lead stays first
    const count = await visible.count();
    await expect(page.locator('[data-tag-filter-status]')).toContainText(String(count));
    await expect(page.locator('[data-tag="ml"]')).toHaveText(/머신러닝/);
    expect(await page.locator('[data-tag="ml"]').evaluate((el) => getComputedStyle(el, '::before').content)).toContain('[x]');
  });

  test('without JavaScript every item is listed and the filter is hidden', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(dataPath('/projects/', 'en'));
    await expect(page.locator('#project-grid > li[data-tags]')).toHaveCount(ITEMS);
    await expect(page.locator('[data-tag-filter]')).toBeHidden();
    await context.close();
  });

  test('a general case study: editorial head, no game-team block, the certificate viewer on white, Back-safe', async ({ page }) => {
    await page.goto(dataPath('/projects/school-zone-blindspots/'), { waitUntil: 'networkidle' });
    await expect(page.locator('#details.pd-ed h1[data-serif]')).toHaveCount(1);
    await expect(page.locator('#for-game-teams')).toHaveCount(0);
    // ImageViewer (0b2d199): only an a[data-viewer] is intercepted; the dialog is dialog.image-viewer, with #view-<id> history.
    await page.locator('#details [data-viewer="certificates"]').click();
    const dialog = page.locator('dialog.image-viewer[open]');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('data-state', 'open');
    await expect(page).toHaveURL(/#view-/);
    expect(await dialog.locator('.image-viewer__close').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(255, 255, 255)');
    expect(await dialog.locator('.image-viewer__cap').evaluate((el) => getComputedStyle(el).color)).toBe('rgb(20, 20, 20)');
    await page.keyboard.press('Escape');
    await expect(page).not.toHaveURL(/#view-/);
  });
});
