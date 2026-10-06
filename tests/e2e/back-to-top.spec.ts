// "맨 위로" (owner request 2026-10-06): on game and data pages a translucent button, centred horizontally at the foot of
// the screen, appears once the footer is on screen and takes the reader back to the top, focus on <main>. It is hidden
// at the top of the page, covers no footer control at the very bottom, and stays absent from the chooser.
import AxeBuilder from '@axe-core/playwright';
import { test, expect, openAt, AXE_TAGS } from './helpers';

const PAGES = [
  ['/game/', 'ko', '맨 위로'],
  ['/data/', 'ko', '맨 위로'],
  ['/en/game/research/', 'en', 'Back to top'],
  ['/en/data/projects/', 'en', 'Back to top'],
] as const;

for (const [route, , label] of PAGES) {
  for (const width of [375, 1280]) {
    test(`${route} @${width}: hidden at the top, centred at the bottom, back to the top on click`, async ({ page }) => {
      await openAt(page, route, width, 800);
      const button = page.getByRole('button', { name: label });
      await expect(button).toBeHidden();

      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await expect(button).toBeVisible();
      await expect(button).toHaveAttribute('data-shown', '');
      await expect.poll(() => button.evaluate((el) => getComputedStyle(el).opacity)).toBe('1');

      const b = (await button.boundingBox())!;
      // centred on the page column: the footer spans the layout viewport less the stable scrollbar gutter (base.css)
      const mid = await page.locator('[data-to-top-dock]').evaluate((el) => { const r = el.getBoundingClientRect(); return r.left + r.width / 2; });
      expect(Math.abs(b.x + b.width / 2 - mid), 'horizontally centred').toBeLessThanOrEqual(1);
      expect(b.y + b.height, 'inside the screen').toBeLessThanOrEqual(800);

      // at the very bottom the button floats over the empty dock, not over a footer control
      const covered = await button.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const footer = el.closest('footer')!;
        return [...footer.querySelectorAll<HTMLElement>('a, button:not([data-to-top]), p')]
          .filter((c) => getComputedStyle(c).display !== 'none')
          .filter((c) => {
            const o = c.getBoundingClientRect();
            return o.width > 0 && o.left < r.right && o.right > r.left && o.top < r.bottom && o.bottom > r.top;
          })
          .map((c) => c.outerHTML.slice(0, 80));
      });
      expect(covered).toEqual([]);

      // the button itself (contrast over whatever it floats above, name, role); the rest of each page has its own axe
      // runs, and a scroll-reveal section mid-animation at the bottom would read as low contrast here
      const axe = await new AxeBuilder({ page }).include('[data-to-top]').withTags(AXE_TAGS).analyze();
      expect(axe.violations.map((v) => v.id)).toEqual([]);

      await button.click();
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
      await expect(page.locator('#main')).toBeFocused();
      await expect(button).toBeHidden();
    });
  }
}

test('reduced motion: the jump is instant', async ({ page }) => {
  await openAt(page, '/data/', 1280, 800, { reducedMotion: true });
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const button = page.getByRole('button', { name: '맨 위로' });
  await expect(button).toBeVisible();
  await button.click();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test('the chooser has no back-to-top button', async ({ page }) => {
  await openAt(page, '/?choose', 1280, 800);
  await expect(page.locator('[data-to-top]')).toHaveCount(0);
});
