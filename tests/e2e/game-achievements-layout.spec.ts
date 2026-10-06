// The Player Log's "내 게임 업적 / GAME ACHIEVEMENTS" band lines up with the page: its container is the shared section
// container (centred, same box as the page head, the membership row, the showcase and the site achievements), and the
// showcases fill that container's content box at every width — no column hugging the left.
import { test, expect, box, openAt } from './helpers';

const WIDTHS = [375, 768, 1280, 1440, 1536, 1920, 2560] as const;
const ROUTES = ['/game/player-log/', '/en/game/player-log/'] as const;

for (const route of ROUTES) {
  for (const width of WIDTHS) {
    test(`${route} at ${width}px: the game achievements band shares the page container's edges`, async ({ page }) => {
      await openAt(page, route, width);
      const section = await box(page.locator('#game-achievements > .container'));
      // the neighbouring bands, above and below
      for (const selector of ['.container:has(> .pl-intro__grid)', '#site-achievements > .container']) {
        const other = await box(page.locator(selector));
        expect(Math.abs(section.x - other.x), `${selector} left edge`).toBeLessThanOrEqual(1);
        expect(Math.abs(section.x + section.width - (other.x + other.width)), `${selector} right edge`).toBeLessThanOrEqual(1);
      }
      // centred in the viewport (the scrollbar, if any, excluded)
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(Math.abs(section.x - (clientWidth - (section.x + section.width))), 'centred').toBeLessThanOrEqual(1);

      // the content column: list and showcases span the container's content box, like the site achievements list
      const pad = await page.locator('#game-achievements > .container').evaluate((el) => parseFloat(getComputedStyle(el).paddingLeft));
      const left = section.x + pad;
      const right = section.x + section.width - pad;
      const siteList = await box(page.locator('#site-achievements .site-ach__list'));
      expect(Math.abs(siteList.x - left), 'site achievements list = content box').toBeLessThanOrEqual(1);
      const list = await box(page.locator('.game-ach__list'));
      expect(Math.abs(list.x - left), 'list left edge').toBeLessThanOrEqual(1);
      expect(Math.abs(list.x + list.width - right), 'list right edge').toBeLessThanOrEqual(1);
      const items = page.locator('.game-ach__item');
      await expect(items).toHaveCount(2);
      const first = await box(items.nth(0));
      const last = await box(items.nth(1));
      expect(Math.abs(first.x - left), 'first showcase left edge').toBeLessThanOrEqual(1);
      expect(Math.abs(last.x + last.width - right), 'last showcase right edge').toBeLessThanOrEqual(1);
      if (width < 980) {
        expect(Math.abs(first.x + first.width - right), 'one column: the first showcase spans the content box').toBeLessThanOrEqual(1);
        expect(Math.abs(last.x - left), 'one column: the second showcase spans the content box').toBeLessThanOrEqual(1);
      }
    });
  }
}
