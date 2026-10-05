import { test, expect, dataPath } from './helpers';

const HUD_CLASSES = ['read', 'read-sec', 'read-section', 'read-column', 'lh-rows', 'lh-row', 'lh-idx', 'lh-chip', 'lh-chips', 'lh-tag', 'lh-table', 'lh-frame', 'bracket', 'btn', 'cut', 'badge', 'hud-label', 'hud-grid', 'ghost-art'];
const FORBIDDEN_COLOURS = ['rgb(79, 107, 0)', 'rgb(245, 179, 1)', 'rgb(200, 240, 60)']; // accent-deep, gold, lime

for (const route of [dataPath('/records/'), dataPath('/records/', 'en'), dataPath('/research/'), dataPath('/research/', 'en')]) {
  test(`${route}: editorial markup only, and no HUD, gold or green colour on any element of main`, async ({ page }) => {
    await page.goto(route, { waitUntil: 'networkidle' });
    const found = await page.locator('main').evaluate((main, classes) => {
      const hits: string[] = [];
      for (const el of Array.from(main.querySelectorAll('*'))) for (const c of classes) if (el.classList.contains(c)) hits.push(`${el.tagName.toLowerCase()}.${c}`);
      return hits.slice(0, 10);
    }, HUD_CLASSES);
    expect(found).toEqual([]);
    const colours = await page.locator('main').evaluate((main, forbidden) => {
      const hits: string[] = [];
      for (const el of Array.from(main.querySelectorAll('*'))) {
        const s = getComputedStyle(el);
        for (const value of [s.color, s.backgroundColor, s.borderTopColor, s.borderBottomColor, s.fill]) if (forbidden.includes(value)) hits.push(`${el.tagName.toLowerCase()}.${el.className}: ${value}`);
      }
      return hits.slice(0, 10);
    }, FORBIDDEN_COLOURS);
    expect(colours).toEqual([]);
  });
}

test('general records: the page-language data résumé is the one filled button; the job-fit statuses are text', async ({ page }) => {
  await page.goto(dataPath('/records/'), { waitUntil: 'networkidle' });
  await expect(page.locator('main .ed-btn--fill')).toHaveCount(1);
  await expect(page.locator('#profile .ed-btn--fill')).toHaveAttribute('href', /seongeun-baek-resume-data-ko\.pdf$/);
  await expect(page.locator('#job-fit')).toBeVisible();
});

test('general research: the lab block has the neutral title and the Academic CV link', async ({ page }) => {
  await page.goto(dataPath('/research/'), { waitUntil: 'networkidle' });
  await expect(page.locator('#for-labs-title')).toHaveText('연구실 안내');
  await expect(page.locator('#for-labs a[href$="seongeun-baek-cv-academic.pdf"]')).toHaveCount(1);
});

test('DS-7: sidebar sticky ≥ 734, stacked on phones; contents links land below the nav; the résumé is the one filled button', async ({ page }) => {
  for (const [lang, file] of [['ko', 'ko'], ['en', 'en']] as const) {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(dataPath('/records/', lang), { waitUntil: 'networkidle' });
    await expect(page.locator('main .ed-btn--fill')).toHaveCount(1);
    await expect(page.locator('#profile .ed-btn--fill')).toHaveAttribute('href', new RegExp(`seongeun-baek-resume-data-${file}\\.pdf$`));
    const side = page.locator('main aside.ed-side');
    await expect(side).toHaveCount(1);
    expect(await side.evaluate((el) => getComputedStyle(el).position)).toBe('sticky');
    // the sidebar sits left of the main column; the stats are the three award / publication tiles
    const [sideBox, mainBox] = [await side.boundingBox(), await page.locator('#education').boundingBox()];
    expect(sideBox!.x + sideBox!.width).toBeLessThanOrEqual(mainBox!.x + 1);
    await expect(side.locator('.ed-stat')).toHaveCount(3);
    // each contents number equals the section number its target shows in its rail (the page-wide CSS counter counts
    // the openers in DOM order, so the target's number is its opener's position among them)
    const pairs = await side.locator('.ed-toc a').evaluateAll((links) => {
      const openers = Array.from(document.querySelectorAll('main .ed-rail__n'));
      return links.map((a) => {
        const target = document.querySelector((a as HTMLAnchorElement).hash);
        const n = target?.querySelector('.ed-rail__n');
        return { href: (a as HTMLAnchorElement).hash, toc: a.querySelector('.ed-toc__n')?.textContent ?? '', shown: n ? String(openers.indexOf(n) + 1).padStart(2, '0') : 'none' };
      });
    });
    expect(pairs.map((p) => p.href)).toEqual(['#education', '#publications', '#awards', '#skills', '#job-fit', '#documents']);
    for (const p of pairs) expect(p.toc, p.href).toBe(p.shown);
    const navH = await page.locator('.data-nav').evaluate((el) => el.getBoundingClientRect().height);
    for (const href of ['#awards', '#documents']) {
      await side.locator(`.ed-toc a[href="${href}"]`).click();
      await expect.poll(() => page.locator(`${href} .ed-head__title`).evaluate((el) => Math.round(el.getBoundingClientRect().top))).toBeGreaterThanOrEqual(Math.floor(navH));
    }
  }
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(dataPath('/records/'), { waitUntil: 'networkidle' });
  const side = page.locator('main aside.ed-side');
  expect(await side.evaluate((el) => getComputedStyle(el).position)).not.toBe('sticky');
  const [sideBox, mainBox] = [await side.boundingBox(), await page.locator('#education').boundingBox()];
  expect(sideBox!.y + sideBox!.height).toBeLessThanOrEqual(mainBox!.y + 1); // stacked: the sidebar above the main column
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});
