import { test, expect, legacyPaths } from './helpers';
import { legacyRedirects, variantBasePaths } from '../../src/lib/routes';

test.describe('legacy URLs (R-6, success criterion 4)', () => {
  for (const { from, to } of legacyRedirects()) {
    test(`${from} → ${to}`, async ({ page }) => {
      await page.goto(from);
      await expect(page).toHaveURL(new RegExp(`${to.replace(/\//g, '\\/')}$`));
      await expect(page.locator('html')).not.toHaveAttribute('data-legacy-redirect', '');
    });
  }

  test('the hash survives with JavaScript', async ({ page }) => {
    await page.goto('/records/#job-fit');
    await expect(page).toHaveURL(/\/game\/records\/#job-fit$/);
    await page.goto('/en/research/#in-progress');
    await expect(page).toHaveURL(/\/en\/game\/research\/#in-progress$/);
    // A shareable image-viewer link (site-v1 0b2d199/2ad74ff, published f5946aa) keeps opening the viewer through the stub.
    await page.goto('/records/#view-busan-mayor-award');
    await expect(page).toHaveURL(/\/game\/records\/#view-busan-mayor-award$/);
    await expect(page.locator('dialog.image-viewer[open]')).toHaveCount(1);
  });

  test('without JavaScript the meta refresh still moves the visitor', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('/projects/kickick-park/');
    await expect(page).toHaveURL(/\/game\/projects\/kickick-park\/$/, { timeout: 10_000 });
    await context.close();
  });

  test('the stubs cover exactly the pages of the published (pre-move) game site, ko and en', () => {
    // The published site served every game page at its base path (ko) and under /en/ (en), the home aside (it is the
    // chooser now). Compared as sets with the redirect table, so a missing or extra old URL fails here.
    const published = variantBasePaths('game').filter((base) => base !== '/').flatMap((base) => [base, `/en${base}`]);
    expect(new Set(legacyPaths())).toEqual(new Set(published));
    expect(legacyPaths()).toHaveLength(published.length); // no old URL twice
  });
});
