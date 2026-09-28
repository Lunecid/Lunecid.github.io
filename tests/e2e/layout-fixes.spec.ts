import type { Page } from '@playwright/test';
import { test, expect } from './helpers';

/** Waits for the CRT intro (home only) to finish and for web fonts, so layout and font fallback are final. */
async function settle(page: Page): Promise<void> {
  await page.waitForFunction(() => !document.documentElement.hasAttribute('data-intro'));
  await page.evaluate(() => document.fonts.ready.then(() => true));
}

interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

// P0-1 (CoG AUC charts on phones) was pinned on the CoG story page. D-15 removed the story; batch 4 put the
// overall AUC chart in the no-art home hero (D-1), and its 375/390px phone check lives in art-variants.spec.ts.

// P1-1: the hero player card sits under the copy column (left-aligned with it), not floated to the far right.
test.describe('P1-1: hero player card sits under the copy, not at the far right', () => {
  for (const route of ['/', '/en/']) {
    test(route, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(route, { waitUntil: 'networkidle' });
      await settle(page);
      const copy = page.locator('.hero__copy');
      const pcard = page.locator('.hero__pcard');
      await expect(copy).toBeVisible();
      await expect(pcard).toBeVisible();
      const copyBox = (await copy.boundingBox())!;
      const pcardBox = (await pcard.boundingBox())!;
      // Same left edge as the copy column (the bug pushed it to align-self: end, i.e. the far right).
      expect(Math.abs(pcardBox.x - copyBox.x), 'player card shares the copy column\'s left edge').toBeLessThanOrEqual(4);
      // Not hugging the viewport's right edge.
      expect(pcardBox.x + pcardBox.width, 'player card does not extend to the far right of the viewport').toBeLessThan(1440 - 400);
      // Below the copy's contact row, not overlapping it.
      expect(pcardBox.y, 'player card sits below the copy').toBeGreaterThanOrEqual(copyBox.y + copyBox.height - 4);
    });
  }
});

// P1-4: the membership card renders near its intended 440px width, the sticker never overlaps the CLASS
// field's value (the bug: the card was squeezed to ~358px and the sticker covered "연구자"/"Researcher"),
// and the title no longer touches the photo frame (the bug: 0-width gap between the two grid columns).
test.describe('P1-4: membership card sticker and title do not overlap the field text / the photo', () => {
  const toRect = (b: { x: number; y: number; width: number; height: number }): Rect => ({
    left: b.x,
    right: b.x + b.width,
    top: b.y,
    bottom: b.y + b.height,
    width: b.width,
    height: b.height,
  });

  for (const width of [375, 1440]) {
    for (const route of ['/player-log/', '/en/player-log/']) {
      test(`${route} at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 1000 });
        await page.goto(route, { waitUntil: 'networkidle' });
        await settle(page);
        const card = page.locator('.mcard');
        await expect(card).toBeVisible();
        if (width >= 1068) {
          const cardBox = (await card.boundingBox())!;
          expect(cardBox.width, 'card renders near its intended 440px width, not squeezed by an auto grid track').toBeGreaterThan(400);
        }

        const title = card.locator('.mcard__title');
        const photo = card.locator('.mcard__photo');
        const titleBox = (await title.boundingBox())!;
        const photoBox = (await photo.boundingBox())!;
        expect(overlaps(toRect(titleBox), toRect(photoBox)), 'title does not touch/overlap the photo').toBe(false);
        expect(photoBox.x - (titleBox.x + titleBox.width), 'a real gap separates the title column from the photo').toBeGreaterThan(2);

        const classValue = card.locator('.mcard__field', { has: page.locator('dt', { hasText: 'CLASS' }) }).locator('dd');
        await expect(classValue).toBeVisible();
        const sticker = card.locator('.mcard__sticker');
        await expect(sticker).toBeVisible();
        const classBox = (await classValue.boundingBox())!;
        const stickerBox = (await sticker.boundingBox())!;
        expect(overlaps(toRect(classBox), toRect(stickerBox)), 'sticker does not cover the CLASS value').toBe(false);
      });
    }
  }
});

// P1-10: Hangul set in a mono HUD element renders in the sans font with no letter-spacing, on Korean pages.
test.describe('P1-10: Hangul labels in HUD mono elements use the sans font with no letter-spacing', () => {
  // The CoG story step labels and the chart "표로 보기" button left with the story page (D-15).

  test('the "모션 줄이기" motion-toggle button in the footer', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await settle(page);
    const button = page.locator('[data-motion-toggle]');
    await expect(button).toBeVisible();
    const style = await button.evaluate((el) => getComputedStyle(el).fontFamily);
    expect(style.toLowerCase()).not.toContain('jetbrains');
  });

  // Regression for a fix-round-1 bug: `lang="en"` on the [ NN ] index span was meant to keep it out of the
  // .hud-label:lang(ko) sans-font override, but lang="en" only changes which :lang() selectors match - it
  // does not stop the (inherited) font-family/letter-spacing from a `.hud-label:lang(ko)` ancestor reaching
  // it. Both the bracket and the trailing English half of a bilingual heading (.hud-label__en) rendered in
  // the sans font on Korean pages until `.hud-label:lang(ko) :lang(en) { font-family: var(--font-mono); … }`
  // was added to explicitly reassert mono for real Latin/numeric content inside a Korean label.
  // D-8 (batch 5): the label is the numberless "[ ■ ] CAPTION" line; the same rule keeps the bracket mark and the
  // English caption mono inside a Korean page's label. Fix round 1: the dark MAIN MENU band shows the caption only;
  // its Korean title stays the heading, visually hidden.
  test('a section head on a Korean page: the [ ■ ] mark and the English caption stay mono; MAIN MENU is caption-only', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await settle(page);
    const head = page.locator('#main-menu .sec-head');
    await expect(head).toBeVisible();
    const bracket = head.locator('.hud-label__mark');
    const en = head.locator('.hud-label__en');
    const title = page.locator('#main-menu-title');
    await expect(bracket).toHaveText('[]'); // the square is drawn in CSS, not a glyph
    await expect(head.locator('.hud-label__sq')).toBeVisible();
    await expect(en).toHaveText('MAIN MENU');
    await expect(title).toHaveText('사이트 메뉴');
    expect(await title.evaluate((el) => el.getBoundingClientRect().width), 'the title is visually hidden').toBeLessThanOrEqual(1);
    await expect(page.getByRole('heading', { level: 2, name: '사이트 메뉴' })).toHaveCount(1);
    const styleOf = (loc: typeof bracket) => loc.evaluate((el) => {
      const s = getComputedStyle(el);
      return { fontFamily: s.fontFamily.toLowerCase(), letterSpacing: s.letterSpacing };
    });
    const bracketStyle = await styleOf(bracket);
    const enStyle = await styleOf(en);
    const titleStyle = await styleOf(title);

    expect(bracketStyle.fontFamily, '[ ■ ] mark stays in the mono font').toContain('jetbrains');
    expect(enStyle.fontFamily, 'English caption (MAIN MENU) stays in the mono font').toContain('jetbrains');
    expect(enStyle.letterSpacing, 'English caption keeps the label\'s normal tracking').not.toBe('0px');
    expect(titleStyle.fontFamily, 'Korean title uses the sans font').not.toContain('jetbrains');
    expect(['0px', 'normal']).toContain(titleStyle.letterSpacing);
    // light reading sections keep the visible Korean title under the caption (D-8)
    const rh = page.locator('#rh-title');
    expect((await rh.boundingBox())?.height ?? 0).toBeGreaterThan(20);
  });

  test('D-8: no [ NN ] section numbers outside the nav on any page of the home, records and player log', async ({ page }) => {
    for (const route of ['/', '/records/', '/player-log/', '/en/research/']) {
      await page.goto(route, { waitUntil: 'networkidle' });
      const numbered = await page.locator('main .hud-label, main .sec-head, main .fg__top').evaluateAll((els) =>
        els.map((el) => el.textContent ?? '').filter((text) => /\[\s*\d+\s*\]/.test(text)),
      );
      expect(numbered, `${route}: numbered labels`).toEqual([]);
    }
  });
});
