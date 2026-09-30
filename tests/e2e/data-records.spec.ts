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
