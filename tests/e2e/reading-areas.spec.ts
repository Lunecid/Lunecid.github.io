// Batch 5 pins in a real browser: the light HUD reading areas (P1-9), job-fit cards and table (P1-11, P2-18), case-study
// figures in one reading column (P1-7), cartridge labels and stickers (P1-6, P2-23), the records head (P2-19) and the
// re-cropped photo (P2-22).
import type { Locator, Page } from '@playwright/test';
import { test, expect, horizontalOverflow, settle } from './helpers';

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}
async function box(locator: Locator): Promise<Box> {
  const b = await locator.boundingBox();
  expect(b, 'element has a layout box').toBeTruthy();
  return b as Box;
}
async function open(page: Page, route: string, width: number, height = 900): Promise<void> {
  await page.setViewportSize({ width, height });
  await page.goto(route, { waitUntil: 'networkidle' });
  await settle(page);
}

test.describe('P1-9: the reading bands are light HUD, not rounded card grids', () => {
  for (const route of ['/game/research/', '/game/records/', '/en/game/records/', '/game/projects/', '/game/player-log/']) {
    test(`${route}: no rounded boxes in the light bands`, async ({ page }) => {
      await open(page, route, 1440);
      const rounded = await page.evaluate(() => {
        const found: string[] = [];
        for (const el of Array.from(document.querySelectorAll('main .read *, main .read-section *, main .read-sec *'))) {
          const s = getComputedStyle(el);
          if (parseFloat(s.borderTopLeftRadius) > 0 || parseFloat(s.borderBottomRightRadius) > 0) {
            found.push(`${el.tagName.toLowerCase()}.${Array.from(el.classList).join('.')}`);
          }
        }
        return [...new Set(found)];
      });
      expect(rounded).toEqual([]);
    });
  }

  test('/game/: PATCH NOTES is a dark band; ▶ shows on hover; one link per row; the research highlight shows the AUC chart', async ({ page }) => {
    await open(page, '/game/', 1440);
    const pn = page.locator('#patch-notes');
    expect(await pn.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(11, 13, 17)'); // --hud-bg
    const row = pn.locator('.pn__item').first();
    const ptr = row.locator('.pn__ptr');
    expect(await ptr.evaluate((el) => getComputedStyle(el).opacity)).toBe('0');
    await row.hover();
    await expect.poll(() => ptr.evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
    for (const item of await pn.locator('.pn__item').all()) expect(await item.locator('a').count()).toBeLessThanOrEqual(1);
    await expect(pn.locator('.pn__ver').first()).toHaveText(/^v\d{4}\.\d{2}(\.\d+)?$/);
    const rh = page.locator('#research-highlight');
    await expect(rh.locator('img')).toHaveCount(0);
    await expect(rh.locator('.chart__scroll--wide svg')).toBeVisible();
  });
});

test.describe('P1-11 / P2-18: job-fit reads on a phone, fits as a table from 734px', () => {
  for (const lang of ['ko', 'en'] as const) {
    const route = lang === 'en' ? '/en/game/records/' : '/game/records/';
    test(`${lang} 375px: one card per row, status on the first line, 44px evidence rows, nothing off-screen`, async ({ page }) => {
      await open(page, route, 375, 812);
      const overflow = await horizontalOverflow(page);
      expect(overflow.scrollWidth, overflow.offenders.join(', ')).toBeLessThanOrEqual(overflow.width);
      const rows = page.locator('#job-fit .jobfit__row');
      expect(await rows.count()).toBe(13);
      for (const row of await rows.all()) {
        const [req, status, card] = await Promise.all([box(row.locator('.jobfit__req')), box(row.locator('.jobfit__status')), box(row)]);
        expect(status.y, 'the badge is on the requirement line').toBeLessThan(req.y + req.height);
        expect(status.x + status.width, 'the badge is inside the card').toBeLessThanOrEqual(card.x + card.width + 0.5);
        expect(card.x + card.width).toBeLessThanOrEqual(375);
      }
      for (const link of await page.locator('#job-fit .jobfit__ev').all()) expect((await box(link)).height).toBeGreaterThanOrEqual(44);
    });

    for (const width of [768, 1068, 1440]) {
      test(`${lang} ${width}px: a fixed-layout table; evidence links and badges stay inside their cells`, async ({ page }) => {
        await open(page, route, width);
        const table = page.locator('#job-fit table');
        expect(await table.evaluate((el) => getComputedStyle(el).tableLayout)).toBe('fixed');
        await expect(page.locator('#job-fit thead th').first()).toBeVisible();
        const spill = await page.evaluate(() => {
          const out: string[] = [];
          for (const el of Array.from(document.querySelectorAll('#job-fit .jobfit__ev, #job-fit .jobfit__status'))) {
            const cell = el.closest('td')!.getBoundingClientRect();
            const r = el.getBoundingClientRect();
            if (r.right > cell.right + 0.5) out.push(`${el.textContent} (${Math.round(r.right - cell.right)}px)`);
          }
          return out;
        });
        expect(spill).toEqual([]);
        // one line of text per evidence link, but >= 44px tall (P2-24: a real touch target, via padding + a
        // matching negative margin so the table's row rhythm does not visibly grow).
        for (const link of await page.locator('#job-fit .jobfit__ev').all()) {
          const linkBox = await box(link);
          expect(linkBox.height, 'touch target height').toBeGreaterThanOrEqual(44);
          expect(linkBox.height, 'still one line of text, not wrapped').toBeLessThan(60);
        }
      });
    }
  }

  test('status badges differ at a glance: filled, outlined, gold dashed, grey', async ({ page }) => {
    await open(page, '/game/records/', 1440);
    const look = (status: string) =>
      page.locator(`#job-fit .jobfit__status--${status}`).first().evaluate((el) => {
        const s = getComputedStyle(el);
        return { bg: s.backgroundColor, color: s.color, border: s.borderTopStyle, borderColor: s.borderTopColor };
      });
    const [met, partial, progress, later] = await Promise.all(['met', 'partial', 'in-progress', 'later'].map(look));
    expect(met.bg).toBe('rgb(79, 107, 0)');
    expect(met.color).toBe('rgb(255, 255, 255)');
    expect(partial.borderColor).toBe('rgb(79, 107, 0)');
    expect(partial.bg).not.toBe(met.bg);
    expect(progress.border).toBe('dashed');
    expect(progress.color).toBe('rgb(138, 90, 0)');
    expect(later.color).toBe('rgb(110, 110, 115)');
  });
});

test.describe('P1-7: case-study figures in one reading column, after the paragraph that cites them', () => {
  test('school-zone at 1440: each figure right after the block citing it, centred on the column, 760px; one left edge', async ({ page }) => {
    await open(page, '/game/projects/school-zone-blindspots/', 1440);
    const figures = page.locator('.prose.read > .figure--inline');
    expect(await figures.count()).toBe(4);
    const pairs = await figures.evaluateAll((els) =>
      els.map((el) => {
        let prev = el.previousElementSibling;
        while (prev && prev.classList.contains('figure--inline')) prev = prev.previousElementSibling;
        return { num: el.querySelector('.figure__num')?.textContent ?? '', prev: prev?.textContent ?? '' };
      }),
    );
    for (const { num, prev } of pairs) expect(prev, `${num} follows the block that cites it`).toContain(num);
    const p = await box(page.locator('.prose.read > p').first());
    for (const fig of await figures.all()) {
      const f = await box(fig);
      expect(f.width).toBeCloseTo(760, 0);
      expect(f.x + f.width / 2, 'centred on the reading column').toBeCloseTo(p.x + p.width / 2, 0);
    }
    await expect(page.locator('#figures')).toHaveCount(0); // every figure is inline
    // F-040 / decision 9 (b): at ≥1068 the audience band breaks out beyond the reading column.
    const audience = await box(page.locator('.audience'));
    expect(audience.x + audience.width / 2, 'audience centred on the reading column').toBeCloseTo(p.x + p.width / 2, 0);
    expect(audience.width, 'audience wider than the prose column').toBeGreaterThan(p.width);
    const pageBox = await box(page.locator('.pd.container, .container.container--hud').first());
    expect(audience.x, 'audience stays inside the page container').toBeGreaterThanOrEqual(pageBox.x - 0.5);
    expect(audience.x + audience.width, 'audience stays inside the page container').toBeLessThanOrEqual(pageBox.x + pageBox.width + 0.5);
    for (const selector of ['#links .sec-head', '#links .plinks__list']) {
      expect((await box(page.locator(selector))).x, `${selector} shares the prose's left edge`).toBeCloseTo(p.x, 0);
    }
  });

  test('school-zone below 1068: audience shares the prose\'s left edge', async ({ page }) => {
    await open(page, '/game/projects/school-zone-blindspots/', 1024);
    const p = await box(page.locator('.prose.read > p').first());
    expect((await box(page.locator('#for-game-teams'))).x, '#for-game-teams shares the prose\'s left edge').toBeCloseTo(p.x, 0);
  });

  for (const route of ['/game/projects/youth-startup-location/', '/en/game/projects/youth-startup-location/']) {
    test(`fix round 1 ${route}: the cover that is figure 1 is shown once, numbered and captioned in PROJECT DETAILS`, async ({ page }) => {
      await open(page, route, 1440);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      const heatmaps = await page.locator('main img').evaluateAll((imgs) =>
        imgs.filter((img) => (img as HTMLImageElement).currentSrc.includes('cluster-zscore-heatmap')).length,
      );
      expect(heatmaps).toBe(1);
      await expect(page.locator('.figure--inline')).toHaveCount(0);
      await expect(page.locator('#figures')).toHaveCount(0);
      await expect(page.locator('.pd__figcap-tag')).toHaveText('FIG');
      await expect(page.locator('.pd__figcap-text')).toContainText(route.startsWith('/en/') ? 'Figure 1' : '그림 1');
      await expect(page.locator('.prose.read')).toContainText(route.startsWith('/en/') ? '(Figure 1)' : '(그림 1)');
    });
  }
});

test.describe('P1-6 / P2-23: cartridge labels and stickers', () => {
  for (const [route, width] of [['/game/projects/', 375], ['/game/projects/', 1440], ['/en/game/projects/', 375], ['/en/game/projects/', 1440], ['/en/game/', 768]] as const) {
    test(`${route} ${width}px: every label has a real figure or a filled plate; stickers stay on the band, inside the card`, async ({ page }) => {
      await open(page, route, width);
      for (const label of await page.locator('.cart__label').all()) {
        const hasImg = (await label.locator('img.cart__img').count()) > 0;
        const hasChart = (await label.locator('.auc-label').count()) > 0;
        if (!hasImg && !hasChart) await expect(label.locator('.cart__plate-id')).not.toBeEmpty();
      }
      for (const cart of await page.locator('.cart').all()) {
        const sticker = cart.locator('.cart__sticker');
        if ((await sticker.count()) === 0) continue;
        const [s, c, img] = await Promise.all([box(sticker), box(cart), cart.locator('img.cart__img, .cart__chart').first().evaluate((el) => {
          const r = el.getBoundingClientRect();
          return { top: r.top + window.scrollY, pad: parseFloat(getComputedStyle(el).paddingTop) };
        })]);
        // P2-23: the English award words stay inside the card (ORAL and the Korean stickers keep the mockup's 4px overhang)
        if (route.startsWith('/en/') && (await sticker.getAttribute('class'))?.includes('--award')) {
          expect(s.x + s.width, 'the English award sticker stays inside the card').toBeLessThanOrEqual(c.x + c.width + 1);
          expect(await sticker.evaluate((el) => el.getClientRects().length > 0 && el.getBoundingClientRect().height > 30), 'two lines').toBe(true);
        }
        expect(img.pad).toBeGreaterThanOrEqual(28);
        // the sticker's (rotated) box ends within the band above the figure, give or take its tilt
        expect(s.y + s.height).toBeLessThanOrEqual(img.top + img.pad + 6);
      }
    });
  }

  test('the chart labels (youth start-up, CoG KDE figure) are drawn whole (contain), never cropped', async ({ page }) => {
    await open(page, '/game/projects/', 1440);
    const fits = await page.locator('img.cart__img--contain').evaluateAll((els) => els.map((el) => getComputedStyle(el).objectFit));
    expect(fits).toEqual(['contain', 'contain']);
  });

  // P1-8 (F-045, owner decision 11 and the 2026-09-29 answer): the CoG label on home and /projects/ is the paper's
  // KDE figure (kill-gap-kde), shown whole as a contained cover; the inline AUC chart is gone from the card.
  for (const [route, width] of [['/game/', 320], ['/game/', 375], ['/en/game/', 768], ['/game/', 1068], ['/game/projects/', 1440], ['/en/game/projects/', 1920]] as const) {
    test(`${route} ${width}px: the CoG label is the KDE figure: one visible image, whole in its label, no inline chart`, async ({ page }) => {
      await open(page, route, width);
      const cart = page.locator('.cart--wide').first();
      const img = cart.locator('img.cart__img').filter({ visible: true });
      await expect(img).toHaveCount(1);
      await expect(img).toHaveAttribute('src', /kill-gap-kde/);
      await expect(cart.locator('.auc-label svg')).toHaveCount(0);
      const [i, label] = await Promise.all([box(img), box(cart.locator('.cart__label'))]);
      expect(i.x).toBeGreaterThanOrEqual(label.x - 0.5);
      expect(i.y).toBeGreaterThanOrEqual(label.y - 0.5);
      expect(i.x + i.width).toBeLessThanOrEqual(label.x + label.width + 0.5);
      expect(i.y + i.height).toBeLessThanOrEqual(label.y + label.height + 0.5);
      // the figure is loaded and drawn whole (contain), not cropped
      expect(await img.evaluate((el) => (el as HTMLImageElement).naturalWidth > 0 && getComputedStyle(el).objectFit === 'contain')).toBe(true);
    });
  }
});

test.describe('P2-19 / P2-22: the records head and the photo', () => {
  test('375px: the photo (96–120px) sits beside the greeting; the three PDFs and the in-page bar follow', async ({ page }) => {
    await open(page, '/game/records/', 375, 812);
    const [photo, hello] = await Promise.all([box(page.locator('.rhead__photo')), box(page.locator('#profile-title'))]);
    expect(photo.width).toBeGreaterThanOrEqual(96);
    expect(photo.width).toBeLessThanOrEqual(120);
    expect(hello.x).toBeGreaterThan(photo.x + photo.width);
    await expect(page.locator('#profile .doc-btns a')).toHaveCount(3);
    await expect(page.locator('#profile .rnav__link')).toHaveText(['학력', '논문', '수상', '기술', '지원 요건 대응', 'PDF']);
    // the head repeats no education list (QUEST LOG below is the only one)
    await expect(page.locator('#profile')).not.toContainText('나노메카트로닉스');
    expect(await page.locator('.rhead__photo').evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe('1px');
  });

  // Fix round 1: the PDF buttons' "PDF" affix had opacity .85 (≈4.39:1). axe cannot see the cut-corner buttons' fill
  // (it is drawn on ::before/::after), so the contrast is computed here: the text colour, with every ancestor's opacity,
  // blended over the fill layer, against WCAG AA 4.5:1.
  for (const route of ['/game/records/', '/en/game/records/']) {
    test(`${route}: every text in the PDF buttons meets AA contrast against the button's own fill`, async ({ page }) => {
      await open(page, route, 1440);
      const ratios = await page.locator('#profile .doc-btns a, #documents .doc-btns a').evaluateAll((buttons) => {
        const rgb = (c: string): number[] => (c.match(/[\d.]+/g) ?? []).map(Number);
        const lum = ([r, g, b]: number[]): number => {
          const ch = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
          return 0.2126 * ch(r!) + 0.7152 * ch(g!) + 0.0722 * ch(b!);
        };
        const out: { text: string; ratio: number; size: number }[] = [];
        for (const btn of buttons) {
          const line = btn.classList.contains('cut--line');
          const fill = rgb(getComputedStyle(btn, line ? '::after' : '::before').backgroundColor);
          for (const el of [btn, ...Array.from(btn.querySelectorAll('span'))]) {
            const own = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent!.trim() !== '');
            if (!own) continue;
            let alpha = 1;
            for (let p: Element | null = el; p && p !== document.body; p = p.parentElement) alpha *= parseFloat(getComputedStyle(p).opacity);
            const [r, g, b, a = 1] = rgb(getComputedStyle(el).color);
            const k = a * alpha;
            const fg = [r! * k + fill[0]! * (1 - k), g! * k + fill[1]! * (1 - k), b! * k + fill[2]! * (1 - k)];
            const [hi, lo] = [lum(fg), lum(fill)].sort((x, y) => y - x);
            out.push({ text: el.textContent!.trim(), ratio: (hi! + 0.05) / (lo! + 0.05), size: parseFloat(getComputedStyle(el).fontSize) });
          }
        }
        return out;
      });
      expect(ratios.length).toBeGreaterThanOrEqual(6);
      for (const { text, ratio, size } of ratios) {
        expect(ratio, `"${text}" ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
        expect(size, `"${text}" size`).toBeGreaterThanOrEqual(13);
      }
    });
  }

  test('the re-cropped photo file: 354×472, framed with a hairline on the home profile', async ({ page }) => {
    await open(page, '/game/', 1440);
    const photo = page.locator('img.hello__photo');
    await photo.scrollIntoViewIfNeeded();
    await expect.poll(() => photo.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    expect(await photo.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeLessThanOrEqual(354);
    expect(await photo.evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe('1px');
  });
});
