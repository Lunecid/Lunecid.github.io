import { test, expect, basePathOf, builtRoutes } from './helpers';

// Review Focus 5: an editorial caption carries the number the body cites ("그림 n" / "Figure n"), once.
const pages = builtRoutes({ variant: 'data' }).filter((route) => /^\/projects\/[a-z0-9-]+\/$/.test(basePathOf(route).base));

for (const route of pages) {
  test(`${route}: every figure the body cites has exactly one caption with that number`, async ({ page }) => {
    await page.goto(route, { waitUntil: 'networkidle' });
    const { lang } = basePathOf(route);
    const word = lang === 'ko' ? '그림' : 'Figure';
    const body = await page.locator('main article.ed-prose').evaluate((el) => {
      const copy = el.cloneNode(true) as HTMLElement;
      copy.querySelectorAll('figcaption').forEach((caption) => caption.remove());
      return copy.textContent ?? '';
    });
    const cited = [...new Set([...body.matchAll(new RegExp(`${word} (\\d+)`, 'g'))].map((m) => Number(m[1])))];
    const captions = await page.locator('main figcaption').allTextContents();
    const numbers = captions.flatMap((c) => [...c.matchAll(/(?:그림|Fig\.|Figure)\s*(\d+)/g)].map((m) => Number(m[1])));
    for (const n of cited) expect(numbers.filter((x) => x === n), `${word} ${n}`).toHaveLength(1);
    expect(new Set(numbers).size, 'no number is used by two captions').toBe(numbers.length);
    for (const label of await page.locator('main .ed-figcap__num').allTextContents()) {
      expect(label.trim()).toMatch(lang === 'ko' ? /^그림 \d+ —$/ : /^Fig\. \d+ —$/);
    }
  });
}

test('there are general project pages to check', () => {
  expect(pages.length).toBeGreaterThan(0);
});
