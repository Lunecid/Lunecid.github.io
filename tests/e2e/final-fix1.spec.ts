// Final review fix 1 (accessibility items): the hero swap buttons at tablet widths (item 3) and the AUC "view as
// table" on English phones (item 5). Item 2 (focus under the sticky nav) is in keyboard.spec.ts, item 4 (the home
// research highlight disclosures) in interaction.spec.ts.
import { existsSync } from 'node:fs';
import type { Locator } from '@playwright/test';
import { join } from 'node:path';
import { test, expect, horizontalOverflow, settle } from './helpers';

const HERO_ART = ['remielle', 'eula'].some((id) => existsSync(join(process.cwd(), 'src', 'assets', 'characters', `${id}.png`)));

test.describe('item 3: hero character buttons take clicks at tablet and small-laptop widths', () => {
  for (const width of [800, 1000]) {
    test(`${width}px: every swap button and the replay button receive the click`, async ({ page }) => {
      test.skip(!HERO_ART, 'no character art in this build (the no-art hero has no buttons)');
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/', { waitUntil: 'networkidle' });
      await settle(page);
      const stage = page.locator('.char-stage--hero');
      const buttons = stage.locator('.char-stage__swap button');
      await expect(buttons.first()).toBeVisible();
      const count = await buttons.count();
      expect(count).toBeGreaterThanOrEqual(2);
      // Nothing sits on top of the controls: the element at each button's centre is the button itself.
      for (let i = 0; i < count; i += 1) {
        const hit = await buttons.nth(i).evaluate((button) => {
          const r = button.getBoundingClientRect();
          const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return top === button || button.contains(top);
        });
        expect(hit, `button ${i} is the topmost element at its centre`).toBe(true);
      }
      // A real click (Playwright refuses when another element would receive it) swaps the character.
      for (const i of [...Array(count).keys()].reverse()) {
        await expect(stage).toHaveAttribute('data-phase', 'shown', { timeout: 5000 });
        await buttons.nth(i).click({ timeout: 3000 });
        await expect(buttons.nth(i)).toHaveAttribute('aria-pressed', 'true');
      }
      await expect(stage).toHaveAttribute('data-phase', 'shown', { timeout: 5000 });
      await stage.locator('.char-stage__replay').click({ timeout: 3000 });
      await expect(stage).toHaveAttribute('data-phase', 'entering');
    });
  }
});

test.describe('item 5: the AUC table on English phones keeps numbers and model names whole', () => {
  for (const width of [320, 375]) {
    for (const route of ['/en/', '/en/research/']) {
      test(`${route} at ${width}px`, async ({ browser }) => {
        const context = await browser.newContext({ viewport: { width, height: 800 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
        const page = await context.newPage();
        await page.goto(route, { waitUntil: 'networkidle' });
        await settle(page);
        const chart = page.locator('.chart--overall').filter({ has: page.locator('.chart__table') }).last();
        await chart.scrollIntoViewIfNeeded();
        await chart.locator('.chart__summary').click();
        const table = chart.locator('.chart__table table');
        await expect(table).toBeVisible();
        // Each model name and AUC value renders on one line (one client rect for its text).
        const lines = await table.evaluate((t) =>
          Array.from(t.querySelectorAll<HTMLElement>('tbody th, tbody td:last-child')).map((cell) => {
            const range = document.createRange();
            range.selectNodeContents(cell);
            const tops = new Set(Array.from(range.getClientRects()).map((r) => Math.round(r.top)));
            return { text: cell.textContent?.trim() ?? '', lines: tops.size };
          }),
        );
        expect(lines.length).toBeGreaterThanOrEqual(16);
        for (const cell of lines) expect(cell.lines, `"${cell.text}" on one line`).toBe(1);
        expect(lines.map((c) => c.text)).toContain('0.675');
        // The page itself never scrolls sideways; a wide table scrolls inside its own region.
        const overflow = await horizontalOverflow(page);
        expect(overflow.scrollWidth, overflow.offenders.join(', ')).toBeLessThanOrEqual(overflow.width);
        expect(overflow.offenders).toEqual([]);
        const box = chart.locator('.chart__table-scroll');
        expect(await box.evaluate((el) => getComputedStyle(el).overflowX)).toBe('auto');
        await expectRegionOnlyWhenOverflowing(box);
        await context.close();
      });
    }
  }

  // Fix round 2 item 8: where the table fits, the box is not an extra tab stop or landmark.
  test('at 1280 on /research/ the table fits, so its box is no tab stop and no region', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/research/', { waitUntil: 'networkidle' });
    await settle(page);
    const chart = page.locator('.chart--overall').filter({ has: page.locator('.chart__table') }).first();
    await chart.scrollIntoViewIfNeeded();
    await chart.locator('.chart__summary').click();
    const box = chart.locator('.chart__table-scroll');
    await expect(box.locator('table')).toBeVisible();
    expect(await box.evaluate((el) => el.scrollWidth > el.clientWidth + 1)).toBe(false);
    await expect(box).not.toHaveAttribute('tabindex');
    await expect(box).not.toHaveAttribute('role');
    // Squeeze the box (a stand-in for a narrow phone): it becomes a focusable region named by the table caption,
    // and goes back to a plain box once the table fits again.
    await box.evaluate((el) => {
      el.style.width = '180px';
    });
    await expect(box).toHaveAttribute('tabindex', '0');
    await expectRegionOnlyWhenOverflowing(box);
    await box.evaluate((el) => {
      el.style.width = '';
    });
    await expect(box).not.toHaveAttribute('tabindex');
    await expect(box).not.toHaveAttribute('role');
    await expect(box).not.toHaveAttribute('aria-labelledby');
  });
});

/** The scroll box is a focusable region exactly when it overflows, named by the summary (final fix 2 item 23: the table's
 *  caption stays the table's own name, heard once). */
async function expectRegionOnlyWhenOverflowing(box: Locator): Promise<void> {
  const overflows = await box.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
  if (overflows) {
    await expect(box).toHaveAttribute('tabindex', '0');
    await expect(box).toHaveAttribute('role', 'region');
    const labelId = await box.getAttribute('aria-labelledby');
    const name = await box.evaluate((el, id) => (id ? el.closest('details')?.querySelector(`summary#${id}`)?.textContent : null), labelId);
    expect(name, 'named by the "view as table" summary').toMatch(/View as table|표로 보기/);
  } else {
    await expect(box).not.toHaveAttribute('tabindex');
    await expect(box).not.toHaveAttribute('role');
  }
}
