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
  for (const route of ['/game/', '/en/game/']) {
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
    for (const route of ['/game/player-log/', '/en/game/player-log/']) {
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
    await page.goto('/game/', { waitUntil: 'networkidle' });
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
    await page.goto('/game/', { waitUntil: 'networkidle' });
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
    for (const route of ['/game/', '/game/records/', '/game/player-log/', '/en/game/research/']) {
      await page.goto(route, { waitUntil: 'networkidle' });
      const numbered = await page.locator('main .hud-label, main .sec-head, main .fg__top').evaluateAll((els) =>
        els.map((el) => el.textContent ?? '').filter((text) => /\[\s*\d+\s*\]/.test(text)),
      );
      expect(numbered, `${route}: numbered labels`).toEqual([]);
    }
  });
});

// N09 / F-024: sticky nav is near-opaque (or keeps a real backdrop blur).
test('N09: hud-nav background alpha ≥ .97 or backdrop-filter is active', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/game/records/', { waitUntil: 'networkidle' });
  await settle(page);
  const result = await page.locator('.hud-nav').evaluate((el) => {
    const s = getComputedStyle(el);
    const bg = s.backgroundColor;
    const m = bg.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/);
    const alpha = m ? (m[4] === undefined ? 1 : Number(m[4])) : 1;
    return { alpha, backdropFilter: s.backdropFilter || (s as CSSStyleDeclaration & { webkitBackdropFilter?: string }).webkitBackdropFilter || 'none' };
  });
  const ok = result.alpha >= 0.97 || (result.backdropFilter !== 'none' && result.backdropFilter !== '');
  expect(ok, `alpha=${result.alpha} backdropFilter=${result.backdropFilter}`).toBe(true);
});

// N09 / F-023: brand left edge matches the content column gutter at wide widths.
test.describe('N09: hud-nav brand aligns with content gutter', () => {
  for (const width of [1440, 2560] as const) {
    test(`brand vs heading at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/game/records/', { waitUntil: 'networkidle' });
      await settle(page);
      const brandLeft = await page.locator('.hud-nav__brand').evaluate((el) => el.getBoundingClientRect().left);
      const heading = page.locator('main h1').first();
      await expect(heading).toBeVisible();
      const headingLeft = await heading.evaluate((el) => el.getBoundingClientRect().left);
      expect(Math.abs(brandLeft - headingLeft), 'brand left ≈ content heading left').toBeLessThanOrEqual(1);
    });
  }
});

// N09 / F-023: EN bar stays one row without sideways scroll at mid widths.
test.describe('N09: EN hud-nav fits one row', () => {
  for (const width of [768, 1068, 1200] as const) {
    test(`/en/game/ at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/en/game/', { waitUntil: 'networkidle' });
      await settle(page);
      const nav = page.locator('.hud-nav');
      const metrics = await nav.evaluate((el) => ({
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
      }));
      expect(metrics.scrollWidth, 'nav does not scroll sideways').toBeLessThanOrEqual(metrics.clientWidth + 1);
      const bar = page.locator('.hud-nav__bar');
      // One visual row: every direct child's vertical centre lines up with the brand's (wrap blows centre
      // delta and bar height — a forced wrap measured ~148px bar with ~104px centre delta vs nav-h 52).
      const row = await bar.evaluate((el) => {
        const tallestDescendantHeight = (node: Element): number => {
          let max = node.getBoundingClientRect().height;
          for (const d of node.querySelectorAll('*')) {
            max = Math.max(max, d.getBoundingClientRect().height);
          }
          return max;
        };
        const brand = el.querySelector('.hud-nav__brand');
        if (!brand) return { ok: false, barH: 0, navH: 0, maxCenterDelta: Infinity, diag: '' };
        const navH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 52;
        const barH = el.getBoundingClientRect().height;
        const brandRect = brand.getBoundingClientRect();
        const brandCy = brandRect.top + brandRect.height / 2;
        let maxCenterDelta = 0;
        const childDiag: string[] = [];
        for (const child of Array.from(el.children)) {
          const r = child.getBoundingClientRect();
          if (r.width === 0 && r.height === 0) continue;
          const cy = r.top + r.height / 2;
          maxCenterDelta = Math.max(maxCenterDelta, Math.abs(cy - brandCy));
          if (barH > navH + 1) {
            const lh = getComputedStyle(child).lineHeight;
            childDiag.push(
              `${(child as HTMLElement).className || child.tagName} h=${r.height.toFixed(1)} lh=${lh} maxDesc=${tallestDescendantHeight(child).toFixed(1)}`,
            );
          }
        }
        const maxBarH = navH * 1.5;
        return {
          ok: maxCenterDelta <= 6 && barH < maxBarH,
          barH,
          navH,
          maxCenterDelta,
          diag: barH > navH + 1 ? childDiag.join('; ') : '',
        };
      });
      // Printed from the test process (not the page), so it shows in the CI log when the bar is taller than --nav-h.
      // eslint-disable-next-line no-console
      if (row.diag) console.log(`N09 hud-nav__bar barH=${row.barH} navH=${row.navH}: ${row.diag}`);
      expect(
        row.ok,
        `bar one row barH=${row.barH} navH=${row.navH} maxCenterDelta=${row.maxCenterDelta}`,
      ).toBe(true);
    });
  }
});

// N02 / F-017: EN patch-note tags stay one line from 734px.
test.describe('N02: EN patch-note tags stay one line', () => {
  for (const width of [768, 1024, 1440, 2560] as const) {
    test(`/en/game/ at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/en/game/', { waitUntil: 'networkidle' });
      await settle(page);
      const tags = page.locator('.pn__tag');
      const count = await tags.count();
      expect(count, 'at least one patch tag').toBeGreaterThan(0);
      for (let i = 0; i < count; i++) {
        const metrics = await tags.nth(i).evaluate((el) => {
          const r = el.getBoundingClientRect();
          const text = el.textContent ?? '';
          // Mid-word break: a soft wrap that splits a letter-run (no whitespace at the break).
          const lines = el.getClientRects();
          return { height: r.height, lineCount: lines.length, text };
        });
        expect(metrics.height, `"${metrics.text}" one line height`).toBeLessThanOrEqual(26);
        expect(metrics.lineCount, `"${metrics.text}" single client rect`).toBe(1);
      }
    });
  }
});

// N02 / F-018: hero credit must not intersect the player card at mid desktop widths.
test.describe('N02: hero credit clears the player card', () => {
  for (const width of [1068, 1080, 1100, 1120, 1140] as const) {
    test(`/en/game/ at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/en/game/', { waitUntil: 'networkidle' });
      await settle(page);
      const credit = page.locator('.hero__credit');
      const pcard = page.locator('.hero__pcard');
      await expect(credit).toBeVisible();
      await expect(pcard).toBeVisible();
      const creditBox = (await credit.boundingBox())!;
      const pcardBox = (await pcard.boundingBox())!;
      expect(
        overlaps(
          { left: creditBox.x, right: creditBox.x + creditBox.width, top: creditBox.y, bottom: creditBox.y + creditBox.height, width: creditBox.width, height: creditBox.height },
          { left: pcardBox.x, right: pcardBox.x + pcardBox.width, top: pcardBox.y, bottom: pcardBox.y + pcardBox.height, width: pcardBox.width, height: pcardBox.height },
        ),
        'credit does not intersect pcard',
      ).toBe(false);
    });
  }
});

// N02 / F-029: balanced project title + middot units never start a line with '·'.
test.describe('N02: heading balance and middot units', () => {
  for (const width of [320, 1440] as const) {
    test(`youth project title last line has >1 word at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/game/projects/', { waitUntil: 'networkidle' });
      await settle(page);
      const title = page.locator('.cart__title', { hasText: '청년 창업가를 위한 부산 상권 입지 제안' }).first();
      await expect(title).toBeVisible();
      const lastLineWords = await title.evaluate((el) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        const rects = [...range.getClientRects()];
        if (rects.length === 0) return 0;
        const last = rects[rects.length - 1]!;
        // Count whitespace-separated tokens whose vertical centre falls on the last line band.
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let words = 0;
        let node: Node | null;
        while ((node = walker.nextNode())) {
          const value = node.textContent ?? '';
          let offset = 0;
          for (const token of value.split(/(\s+)/)) {
            if (!token || /^\s+$/.test(token)) {
              offset += token.length;
              continue;
            }
            range.setStart(node, offset);
            range.setEnd(node, offset + token.length);
            const r = range.getBoundingClientRect();
            if (Math.abs(r.top - last.top) <= 2) words += 1;
            offset += token.length;
          }
        }
        return words;
      });
      expect(lastLineWords, 'last line has more than one word').toBeGreaterThan(1);
    });
  }

  for (const width of [320, 375] as const) {
    test(`hero meta and MAIN MENU caption lines do not start with '·' at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/game/', { waitUntil: 'networkidle' });
      await settle(page);
      const startsWithDot = await page.evaluate(() => {
        const check = (root: Element | null) => {
          if (!root) return [];
          const bad: string[] = [];
          const parts = root.querySelectorAll('.hero__meta-part, .mm__cap-part');
          for (const part of parts) {
            const r = part.getBoundingClientRect();
            if (r.width === 0) continue;
            const text = (part.textContent ?? '').trimStart();
            // A line starts with '·' when this part's first glyph is · and it is the leftmost on its row
            // among siblings (i.e. the break put · at the start).
            if (!text.startsWith('·')) continue;
            const parent = part.parentElement;
            if (!parent) continue;
            const siblings = [...parent.querySelectorAll(':scope > .hero__meta-part, :scope > .mm__cap-part')];
            const sameRow = siblings.filter((s) => Math.abs(s.getBoundingClientRect().top - r.top) <= 2);
            const leftmost = Math.min(...sameRow.map((s) => s.getBoundingClientRect().left));
            if (Math.abs(r.left - leftmost) <= 1) bad.push(text.slice(0, 12));
          }
          return bad;
        };
        return [...check(document.querySelector('.hero__meta')), ...check(document.querySelector('#main-menu'))];
      });
      expect(startsWithDot, 'no line starts with ·').toEqual([]);
    });
  }
});

// N11 / F-002: Hangul in listed mono labels uses a narrow sans space advance.
test.describe('N11: Korean mono labels use sans space advance', () => {
  const selectors = [
    '.site-footer__copy',
    '.site-footer__updated',
    '.site-footer__links a',
    '.hero__credit-part',
    '.badge--tier',
    '.mm__hint',
  ];

  test('canvas space advance ≤ 0.35em on KO home for Hangul mono labels', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/game/', { waitUntil: 'networkidle' });
    await settle(page);
    const results = await page.evaluate(async (sels) => {
      await document.fonts.ready;
      const out: { sel: string; ok: boolean; ratio: number; family: string }[] = [];
      for (const sel of sels) {
        const els = [...document.querySelectorAll(sel)].filter((el) => /\p{Script=Hangul}/u.test(el.textContent ?? ''));
        for (const el of els) {
          const cs = getComputedStyle(el);
          const family = cs.fontFamily;
          const size = parseFloat(cs.fontSize);
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d')!;
          ctx.font = cs.font;
          const space = ctx.measureText(' ').width;
          const ratio = space / size;
          out.push({ sel, ok: ratio <= 0.35, ratio, family });
        }
      }
      return out;
    }, selectors);
    expect(results.length, 'found Hangul mono labels').toBeGreaterThan(0);
    for (const r of results) {
      expect(r.ok, `${r.sel} space/em=${r.ratio.toFixed(3)} family=${r.family}`).toBe(true);
    }
  });
});

// N03 / F-009: Player Log tiles are a 3-column grid that stays inside the side panel (no page overflow at 1068–1160).
test.describe('N03: Player Log favorite tiles stay inside the side panel', () => {
  for (const route of ['/game/player-log/', '/en/game/player-log/']) {
    test(`${route} 1068–1160 no overflow; tiles ≤ side edge`, async ({ page }) => {
      // 24 widths, one full load each: about 25 s on an idle machine, so the 30 s default leaves no room under load.
      test.setTimeout(90_000);
      for (let width = 1068; width <= 1160; width += 4) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(route, { waitUntil: 'networkidle' });
        await settle(page);
        const report = await page.evaluate(() => {
          const doc = document.documentElement;
          const side = document.querySelector('.pl-intro__side');
          const tiles = [...document.querySelectorAll('.fav-tile')];
          if (!side || tiles.length === 0) return { ok: false, reason: 'missing side or tiles' };
          const sideRight = side.getBoundingClientRect().right;
          const tileRight = Math.max(...tiles.map((t) => t.getBoundingClientRect().right));
          return {
            ok: doc.scrollWidth <= doc.clientWidth && tileRight <= sideRight + 0.5,
            scrollWidth: doc.scrollWidth,
            clientWidth: doc.clientWidth,
            tileRight,
            sideRight,
          };
        });
        expect(report.ok, `w=${width} ${JSON.stringify(report)}`).toBe(true);
      }
    });

    test(`${route} at 1440 tiles end within 2px of the panel edge`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(route, { waitUntil: 'networkidle' });
      await settle(page);
      const gap = await page.evaluate(() => {
        const side = document.querySelector('.pl-intro__side');
        const tiles = [...document.querySelectorAll('.fav-tile')];
        if (!side || tiles.length === 0) return Number.POSITIVE_INFINITY;
        const sideRight = side.getBoundingClientRect().right;
        const tileRight = Math.max(...tiles.map((t) => t.getBoundingClientRect().right));
        return Math.abs(sideRight - tileRight);
      });
      expect(gap).toBeLessThanOrEqual(2);
    });
  }
});

// N03 / F-055: site achievement state tags stay 24px tall (not stretched by the grid row).
test.describe('N03: site achievement state tags are 24px', () => {
  for (const width of [768, 1024, 1440]) {
    test(`at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/game/player-log/', { waitUntil: 'networkidle' });
      await settle(page);
      const heights = await page.evaluate(() =>
        [...document.querySelectorAll('.site-ach__state-tag:not([hidden])')].map((el) => el.getBoundingClientRect().height),
      );
      expect(heights.length).toBeGreaterThan(0);
      for (const h of heights) expect(h).toBe(24);
    });
  }
});

// R3 fix: author `display` on .site-ach__state-tag must not beat [hidden] { display: none }.
test.describe('R3: site achievement [hidden] state tags stay invisible', () => {
  for (const route of ['/game/player-log/', '/en/game/player-log/']) {
    for (const width of [375, 1440]) {
      test(`${route} ${width}px fresh storage: one visible state tag; [hidden] not shown`, async ({ page }) => {
        await page.addInitScript(() => {
          localStorage.clear();
        });
        await page.setViewportSize({ width, height: width === 375 ? 812 : 900 });
        await page.goto(route, { waitUntil: 'networkidle' });
        await settle(page);
        const report = await page.evaluate(() => {
          const list = document.querySelector('.site-ach__list');
          if (!list) return { ok: false, reason: 'missing list' };
          const hiddenVisible = [...list.querySelectorAll('[hidden]')].filter((el) => {
            const s = getComputedStyle(el);
            return s.display !== 'none' && s.visibility !== 'hidden' && parseFloat(s.opacity) > 0;
          }).map((el) => ({ tag: el.tagName, className: el.className, display: getComputedStyle(el).display }));
          const perItem = [...list.querySelectorAll('.site-ach__item')].map((item) => {
            const visible = [...item.querySelectorAll('.site-ach__state-tag')].filter((el) => {
              const s = getComputedStyle(el);
              return s.display !== 'none' && s.visibility !== 'hidden';
            });
            return { id: (item as HTMLElement).dataset.achId, visible: visible.map((el) => el.textContent?.trim()) };
          });
          return {
            ok: hiddenVisible.length === 0 && perItem.every((row) => row.visible.length === 1),
            hiddenVisible,
            perItem,
          };
        });
        expect(report.ok, JSON.stringify(report)).toBe(true);
      });
    }

    test(`${route}: unlocking one achievement shows unlocked tag only`, async ({ page }) => {
      await page.addInitScript(() => {
        localStorage.clear();
        localStorage.setItem('sb:achievements', JSON.stringify({ 'abstract-reader': new Date().toISOString() }));
      });
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(route, { waitUntil: 'networkidle' });
      await settle(page);
      const item = page.locator('.site-ach__item[data-ach-id="abstract-reader"]');
      await expect(item).toHaveAttribute('data-unlocked', 'true');
      await expect(item.locator('[data-ach-state="unlocked"]')).toBeVisible();
      await expect(item.locator('[data-ach-state="locked"]')).toBeHidden();
      const unlockedText = route.startsWith('/en/') ? 'Achievement unlocked' : '업적 달성';
      const lockedText = route.startsWith('/en/') ? 'Locked' : '잠김';
      await expect(item.locator('[data-ach-state="unlocked"]')).toHaveText(unlockedText);
      await expect(item.locator('[data-ach-state="locked"]')).toHaveText(lockedText);
    });
  }
});

// R3 fix: fav-tile kickers must fit "FAVORITE" at every mid-width without clipping.
test.describe('R3: favorite tile captions fit FAVORITE at mid widths', () => {
  const widths = [734, 768, 1024, 1068, 1100, 1159, 1280, 1440];
  for (const width of widths) {
    test(`at ${width}px every kicker fits and shows FAVORITE`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/game/player-log/', { waitUntil: 'networkidle' });
      await settle(page);
      const report = await page.evaluate(() => {
        const kickers = [...document.querySelectorAll('.fav-tile__kicker')];
        if (kickers.length === 0) return { ok: false, reason: 'no kickers' };
        const rows = kickers.map((el) => {
          const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
          return {
            text,
            scrollWidth: el.scrollWidth,
            clientWidth: el.clientWidth,
            hasFavorite: /\bFAVORITE\b/.test(text),
            fits: el.scrollWidth <= el.clientWidth + 0.5,
          };
        });
        return { ok: rows.every((r) => r.fits && r.hasFavorite), rows };
      });
      expect(report.ok, `w=${width} ${JSON.stringify(report)}`).toBe(true);
    });
  }
});

// N15: case-study cover height, first h2 gap, cover fetchpriority, audience card width at >=1068.
test.describe('N15: case-study layout (F-006, F-041, F-080, F-040)', () => {
  const caseStudies = [
    '/game/projects/school-zone-blindspots/',
    '/en/game/projects/school-zone-blindspots/',
    '/game/projects/kickick-park/',
    '/en/game/projects/kickick-park/',
    '/game/projects/youth-startup-location/',
    '/en/game/projects/youth-startup-location/',
  ];

  for (const width of [768, 1024, 1067]) {
    for (const route of caseStudies) {
      test(`${route} at ${width}px: cover <=0.65vh and story starts sooner`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(route, { waitUntil: 'networkidle' });
        const report = await page.evaluate((w) => {
          const fig = document.querySelector('.pd__fig');
          const img = document.querySelector('.pd__fig img');
          const h2 = document.querySelector('article.prose h2');
          if (!fig || !img || !h2) return { ok: false, reason: 'missing nodes' };
          const figH = fig.getBoundingClientRect().height;
          const h2Top = h2.getBoundingClientRect().top + window.scrollY;
          const prose = document.querySelector('article.prose');
          const first = prose?.firstElementChild as HTMLElement | null;
          const gap = first ? first.getBoundingClientRect().top - prose!.getBoundingClientRect().top : -1;
          return {
            ok: figH <= 0.65 * window.innerHeight + 1 && (w !== 1024 || h2Top <= 1100) && gap <= 44,
            figH,
            vh: window.innerHeight,
            h2Top,
            gap,
          };
        }, width);
        expect(report.ok, JSON.stringify(report)).toBe(true);
      });
    }
  }

  test('cover img has fetchpriority=high', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/game/projects/kickick-park/');
    await expect(page.locator('.pd__fig img')).toHaveAttribute('fetchpriority', 'high');
  });

  test('at 1440 audience grid breaks out of the reading column', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/game/projects/kickick-park/');
    const report = await page.evaluate(() => {
      const grid = document.querySelector('.audience__grid')?.getBoundingClientRect();
      const prose = document.querySelector('article.prose')?.getBoundingClientRect();
      const measure = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--measure')) || 0;
      // --measure is in em; convert roughly via root font size for comparison of widths.
      const em = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const measurePx = measure * em;
      return {
        gridW: grid?.width ?? 0,
        proseW: prose?.width ?? 0,
        measurePx,
        widerThanMeasure: (grid?.width ?? 0) > measurePx + 40,
      };
    });
    expect(report.widerThanMeasure, JSON.stringify(report)).toBe(true);
  });

  test('at 1800 audience cards are each >=34em', async ({ page }) => {
    await page.setViewportSize({ width: 1800, height: 900 });
    await page.goto('/game/projects/kickick-park/');
    const report = await page.evaluate(() => {
      const em = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const cards = [...document.querySelectorAll('.audience__block')].map((el) => el.getBoundingClientRect().width);
      return { cards, minEm: Math.min(...cards.map((w) => w / em)), em };
    });
    expect(report.cards.length).toBe(2);
    expect(report.minEm, JSON.stringify(report)).toBeGreaterThanOrEqual(34);
  });
});
