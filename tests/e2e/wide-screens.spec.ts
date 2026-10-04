// Batch 4 layout pins in a real browser: D-2 XL steps, D-3 home cartridges, P2-16 hero lines, P2-21 figure frame.
import { test, expect, box, openAt, type Box } from './helpers';

test.describe('D-2 XL steps: the section container widens; every band keeps one left edge (batch 5 item 11)', () => {
  // [viewport, HUD container, gutter, name font size]
  const STEPS = [
    [1440, 1180, 56, 76],
    [1600, 1360, 64, 84],
    [1800, 1440, 72, 90],
    [1920, 1440, 72, 90],
  ] as const;
  for (const [width, container, gutter, nameSize] of STEPS) {
    test(`${width}px: container ${container}px (gutter ${gutter}px) for HUD and light bands, name ${nameSize}px`, async ({ page }) => {
      await openAt(page, '/game/', width);
      for (const selector of ['.hud-nav__bar', '.hero__inner', '.mm-sec__inner', '#featured-projects .container', '.site-footer__inner']) {
        expect((await box(page.locator(selector).first())).width, selector).toBeCloseTo(container, 0);
      }
      const grid = await box(page.locator('#featured-projects .cart-grid'));
      expect(grid.width, 'cartridge grid = container minus gutters').toBeCloseTo(container - 2 * gutter, 0);
      // Item 11: light reading bands share the HUD container's box, so their left edges line up with the nav's.
      const nav = await box(page.locator('.hud-nav__bar').first());
      for (const selector of ['#research-highlight .container', '#patch-notes .container', '#hello .container']) {
        const band = await box(page.locator(selector).first());
        expect(band.width, `${selector} width`).toBeCloseTo(container, 0);
        expect(band.x, `${selector} left edge = nav left edge`).toBeCloseTo(nav.x, 0);
      }
      expect(await page.locator('#hero-name').evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBe(nameSize);

      await openAt(page, '/game/player-log/', width);
      // AL-10 split the row: the container is the grid's parent (the grid is its content box, the accounts slot below it)
      expect((await box(page.locator('.container:has(> .pl-intro__grid)'))).width, 'Player Log first row').toBeCloseTo(container, 0);
      expect((await box(page.locator('.pl-showcase__inner'))).width, 'showcase').toBeCloseTo(container, 0);
    });
  }

  test('reading columns keep their measure and the paper sheet its width at 1920px', async ({ page }) => {
    await openAt(page, '/game/projects/school-zone-blindspots/', 1440);
    const prose1440 = await box(page.locator('.prose.read > p').first());
    await openAt(page, '/game/projects/school-zone-blindspots/', 1920);
    const prose1920 = await box(page.locator('.prose.read > p').first());
    expect(prose1920.width).toBeCloseTo(prose1440.width, 0);
    expect(prose1920.width).toBeLessThanOrEqual(38 * 17 + 1); // 38em at 17px
    expect((await box(page.locator('.pd'))).width, 'PROJECT DETAILS is a HUD panel: it widens').toBeCloseTo(1440, 0);

    await openAt(page, '/game/research/cog-2026-engagement/', 1440);
    const sheet1440 = await box(page.locator('.paper').first());
    await openAt(page, '/game/research/cog-2026-engagement/', 1920);
    const sheet1920 = await box(page.locator('.paper').first());
    expect(sheet1920.width).toBeCloseTo(sheet1440.width, 0);
  });

  test('P2-37: English prose is 36em (about 66 characters) wide; Korean prose stays 38em', async ({ page }) => {
    await openAt(page, '/en/game/projects/school-zone-blindspots/', 1440);
    expect((await box(page.locator('.prose.read > p').first())).width).toBeCloseTo(36 * 17, 0);
    await openAt(page, '/game/projects/school-zone-blindspots/', 1440);
    expect((await box(page.locator('.prose.read > p').first())).width).toBeCloseTo(38 * 17, 0);
  });

  test('/game/projects/ at 1920px: four columns, CoG + five projects fill two complete rows', async ({ page }) => {
    await openAt(page, '/game/projects/', 1920);
    const grid = await box(page.locator('#project-grid'));
    const cards = await Promise.all((await page.locator('#project-grid .cart').all()).map(box));
    expect(cards).toHaveLength(6); // CoG (two columns) + five projects, the last spanning two columns = 8 cells
    const rows = new Map<number, Box[]>();
    for (const c of cards) rows.set(Math.round(c.y), [...(rows.get(Math.round(c.y)) ?? []), c]);
    expect(rows.size).toBe(2);
    for (const row of rows.values()) {
      const right = Math.max(...row.map((c) => c.x + c.width));
      expect(right, 'each row reaches the grid\'s right edge').toBeCloseTo(grid.x + grid.width, 0);
    }
  });

  // P-07 acceptance (F-062, owner decision 13): the double-width project slot holds a linked case study, not a card without a page.
  for (const width of [1440, 1920]) {
    test(`/game/projects/ at ${width}px: the double-width project card is a linked case study`, async ({ page }) => {
      await openAt(page, '/game/projects/', width);
      const projects = page.locator('#project-grid .cart:not(.cart--wide)');
      const widths = await projects.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().width));
      const single = Math.min(...widths);
      const doubles = widths.map((w, i) => (w > 1.5 * single ? i : -1)).filter((i) => i >= 0);
      expect(doubles.length, 'one project card spans two columns').toBe(1);
      const card = projects.nth(doubles[0]!);
      await expect(card.locator('.cart__link')).toHaveCount(1);
      await expect(card).not.toHaveClass(/cart--static/);
    });
  }
});

test.describe('D-3 / P1-5: home cartridges', () => {
  for (const width of [1440, 1920]) {
    test(`${width}px: CoG (two columns) + school-zone + kickick-park on one row, one height`, async ({ page }) => {
      await openAt(page, '/game/', width);
      const grid = await box(page.locator('#featured-projects .cart-grid'));
      const cards = page.locator('#featured-projects .cart');
      await expect(cards).toHaveCount(3);
      const boxes = await Promise.all((await cards.all()).map(box));
      expect(new Set(boxes.map((b) => Math.round(b.y))).size, 'one row').toBe(1);
      expect(boxes[2].x + boxes[2].width).toBeCloseTo(grid.x + grid.width, 0);
      expect(boxes[0].width).toBeGreaterThan(1.9 * boxes[1].width);
      // Final fix 2 item 5: one shelf height; the shorter cards' figures take up the extra height (final-fix2.spec.ts)
      expect(Math.max(...boxes.map((b) => b.height)) - Math.min(...boxes.map((b) => b.height)), 'one row height').toBeLessThanOrEqual(1);
      const hrefs = await cards.locator('a.cart__link').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
      expect(hrefs).toEqual(['/game/research/cog-2026-engagement/', '/game/projects/school-zone-blindspots/', '/game/projects/kickick-park/']);
    });
  }

  test('768px: no orphan cell — the wide CoG card, then the two projects side by side', async ({ page }) => {
    await openAt(page, '/en/game/', 768, 1024);
    const grid = await box(page.locator('#featured-projects .cart-grid'));
    const boxes = await Promise.all((await page.locator('#featured-projects .cart').all()).map(box));
    expect(boxes).toHaveLength(3);
    expect(boxes[0].width).toBeCloseTo(grid.width, 0);
    expect(Math.round(boxes[1].y)).toBe(Math.round(boxes[2].y));
    expect(boxes[2].x + boxes[2].width).toBeCloseTo(grid.x + grid.width, 0);
  });
});

test.describe('P2-16: hero copy lines', () => {
  for (const route of ['/game/', '/en/game/']) {
    test(`STATUS value wraps under itself, not under the label (${route}, 375px and 1068px)`, async ({ page }) => {
      for (const width of [375, 1068]) {
        await openAt(page, route, width);
        const label = await box(page.locator('.hero__status-label'));
        const lefts = await page.locator('.hero__status-value').evaluate((el) => {
          const range = document.createRange();
          range.selectNodeContents(el);
          return [...range.getClientRects()].map((r) => Math.round(r.left));
        });
        expect(lefts.length, `${width}px: the value wraps (a real test of the second line)`).toBeGreaterThan(1);
        for (const left of lefts) expect(left, `${width}px`).toBeGreaterThan(label.x + label.width);
      }
    });
  }

  test('the second button is "CV (PDF) ↓" naming its document; the job-fit link comes first in the contact row', async ({ page }) => {
    await openAt(page, '/game/', 1440);
    const cv = page.locator('.hero__ctas a').nth(1);
    await expect(cv).toHaveAccessibleName('CV (PDF) — 이력서 (PDF)');
    await expect(cv).toHaveAttribute('href', '/cv/seongeun-baek-resume-ko.pdf');
    const links = page.locator('.hero__links a');
    await expect(links.first()).toHaveAttribute('href', '/game/records/#job-fit');
    const [jobfit, mail, github] = await Promise.all([0, 1, 2].map((i) => box(links.nth(i))));
    expect(mail.x).toBeGreaterThan(jobfit.x);
    expect(github.x).toBeGreaterThan(mail.x);
  });
});

test.describe('P2-21: PROJECT DETAILS figure frame', () => {
  test('the FIG caption strip sits under the figure, and a short figure is centred beside the taller table', async ({ page }) => {
    await openAt(page, '/game/projects/school-zone-blindspots/', 1440);
    await expect(page.locator('.pd__figcap-strip')).toHaveText('FIG · RISK HEATMAP');
    const fig = await box(page.locator('.pd__fig'));
    const img = await box(page.locator('.pd__fig img'));
    const cap = await box(page.locator('.pd__figcap'));
    const pd = await box(page.locator('.pd'));
    expect(cap.y).toBeGreaterThanOrEqual(img.y + img.height - 1);
    expect(fig.height, 'the figure is shorter than the details column here').toBeLessThan(pd.height);
    expect(Math.abs(fig.y + fig.height / 2 - (pd.y + pd.height / 2)), 'vertically centred').toBeLessThan(3);
  });
});
