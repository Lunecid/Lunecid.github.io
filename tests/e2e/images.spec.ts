import type { Page } from '@playwright/test';
import { test, expect } from './helpers';

// Batch 2 (DIAGNOSIS P2-39): LCP images load eagerly with high priority, everything below the fold stays lazy.
// P1-8 (P-01/F-045, owner decision 11): the CoG cartridge on / shows the KDE figure (kill-gap-kde) as its cover instead
// of the inline AUC chart; the research highlight keeps its inline AUC chart, so no research figure other than
// kill-gap-kde (e.g. label-horizon) is fetched on / at any size.

async function scrollThrough(page: Page): Promise<void> {
  await page.evaluate(async () => {
    for (let y = 0; y < document.documentElement.scrollHeight; y += 300) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
  });
  await page.waitForLoadState('networkidle');
}

for (const device of [
  { name: 'phone 412px at 1.75x', viewport: { width: 412, height: 915 }, deviceScaleFactor: 1.75 },
  { name: 'desktop 1350px', viewport: { width: 1350, height: 940 }, deviceScaleFactor: 1 },
  { name: '4K at 1.5x', viewport: { width: 2560, height: 1300 }, deviceScaleFactor: 1.5 },
]) {
  test.describe(`${device.name}`, () => {
    test.use({ viewport: device.viewport, deviceScaleFactor: device.deviceScaleFactor });

    test('/ shows the KDE figure as the CoG cartridge cover: no other research figure image is fetched', async ({ page }) => {
      const urls: string[] = [];
      page.on('request', (request) => {
        const figure = /\/_astro\/(label-horizon|kill-gap-kde)\./.exec(request.url());
        if (figure && figure[1] !== 'kill-gap-kde') urls.push(request.url());
      });
      await page.goto('/', { waitUntil: 'networkidle' });
      await scrollThrough(page);
      expect(urls, urls.join('\n')).toEqual([]);
      // one visible cover img whose src is the KDE figure, in a CoG cartridge that holds no inline .auc-label svg
      await expect(page.locator('#featured-projects .cart--wide:not(:has(.auc-label svg)) img[src*="kill-gap-kde"]').filter({ visible: true })).toHaveCount(1);
    });
  });
}

test('LCP images are eager with fetchpriority high; the other cartridges stay lazy', async ({ page }) => {
  await page.goto('/projects/');
  const carts = page.locator('.cart__img');
  expect(await carts.count()).toBeGreaterThan(2);
  await expect(carts.first()).toHaveAttribute('loading', 'eager');
  await expect(carts.first()).toHaveAttribute('fetchpriority', 'high');
  for (const img of (await carts.all()).slice(1)) await expect(img).toHaveAttribute('loading', 'lazy');

  await page.goto('/records/');
  await expect(page.locator('img.rhead__photo')).toHaveAttribute('fetchpriority', 'high'); // the short records head (P2-19)
  await expect(page.locator('img.rhead__photo')).toHaveAttribute('loading', 'eager');

  await page.goto('/');
  await expect(page.locator('img.hello__photo')).toHaveAttribute('loading', 'lazy'); // bottom of the home page

  await page.goto('/player-log/');
  await expect(page.locator('.mcard__photo img')).toHaveAttribute('loading', 'eager');
});

// N06 code parts: duplicate alt cleared; caption inset; srcset ladders near 1x slot.
test.describe('N06: research figures code parts (F-057, F-066, F-081)', () => {
  test('/research/: Fig. 1 alt appears once (pub thumb is decorative)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/research/');
    const alts = await page.locator('img[alt]').evaluateAll((imgs) =>
      imgs
        .map((img) => img.getAttribute('alt') ?? '')
        .filter((a) => /Figure 1 of the paper|\uB17C\uBB38 \uADF8\uB9BC 1/.test(a)),
    );
    // Publication thumb is alt=""; the interest-row label-horizon keeps the long alt once.
    expect(alts.length, alts.join(' | ')).toBe(1);
    await expect(page.locator('.pub__media img')).toHaveAttribute('alt', '');
  });

  test('at 375 chart caption starts 12px inside the frame', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/research/');
    const report = await page.evaluate(() => {
      const fig = document.querySelector('.interests__fig--chart');
      const cap = fig?.querySelector('.chart__caption');
      if (!fig || !cap) return { ok: false, reason: 'missing' };
      const fr = fig.getBoundingClientRect();
      const text = cap.querySelector('.chart__caption-text') ?? cap;
      const cr = text.getBoundingClientRect();
      const inset = Math.round(cr.left - fr.left);
      return { ok: inset >= 11 && inset <= 14, inset };
    });
    expect(report.ok, JSON.stringify(report)).toBe(true);
  });

  test('at 1440 DPR1 figure currentSrc natural width / slot <= 1.15', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/research/', { waitUntil: 'networkidle' });
    const report = await page.evaluate(async () => {
      const imgs = [...document.querySelectorAll('.interests__fig img')] as HTMLImageElement[];
      await Promise.all(
        imgs.map((img) => (img.complete ? Promise.resolve() : new Promise((r) => { img.onload = () => r(null); }))),
      );
      return imgs.map((img) => {
        const slot = img.getBoundingClientRect().width;
        const natural = img.naturalWidth;
        return { slot, natural, ratio: slot > 0 ? natural / slot : 0, src: img.currentSrc };
      });
    });
    for (const row of report) {
      expect(row.ratio, JSON.stringify(row)).toBeLessThanOrEqual(1.15);
    }
  });
});
