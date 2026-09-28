// D-1 (batch 4): every art slot has a finished no-art layout, and with art the art shows.
// The no-art pages come from dist-no-art/ (built with the test-only SB_NO_ART=1 switch, served at NO_ART_ORIGIN by
// playwright.config.ts); the with-art pages come from the normal dist/ at the default baseURL.
import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page } from '@playwright/test';
import { test, expect, NO_ART_ORIGIN, horizontalOverflow, settle, textBelow12px } from './helpers';
import { overallAuc } from '../../src/data/research/cog-2026';

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const noArt = (route: string): string => `${NO_ART_ORIGIN}${route}`;

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
async function open(page: Page, url: string, width: number, height = 900): Promise<void> {
  await page.setViewportSize({ width, height });
  await page.goto(url, { waitUntil: 'networkidle' });
  await settle(page);
}
/** Scrolls through the page so client:visible islands hydrate, then back to the top. */
async function hydrateAll(page: Page): Promise<void> {
  const total = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < total; y += 600) await page.evaluate((top) => window.scrollTo(0, top), y);
  await page.evaluate(() => window.scrollTo(0, 0));
}

test.describe('D-1 no-art build', () => {
  test('the no-art build has no character art anywhere, and its variants are the ones rendered', async ({ page }) => {
    await open(page, noArt('/'), 1440);
    await expect(page.locator('.char-stage')).toHaveCount(0);
    await expect(page.locator('section.hero.hero--no-art')).toHaveCount(1);
    await expect(page.locator('#main-menu.mm-sec--no-art')).toHaveCount(1);
    await open(page, noArt('/player-log/'), 1440);
    await hydrateAll(page);
    await expect(page.locator('.fav-tile')).toHaveCount(0);
    await expect(page.locator('#membership.pl-intro--meter [data-ach-meter]')).toBeVisible();
    await expect(page.locator('section.fg.fg--no-art')).toBeVisible();
    await expect(page.locator('.fg__chr')).toHaveCount(0);
  });

  // P0-1 returns: wherever the AUC chart renders, phones see every model's dot and value without horizontal scroll.
  for (const width of [375, 390]) {
    for (const route of ['/', '/en/']) {
      test(`P0-1: the hero AUC chart at ${width}px shows every model's dot and value inside the box (${route})`, async ({ browser }) => {
        const context = await browser.newContext({ viewport: { width, height: 800 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
        const page = await context.newPage();
        await page.goto(noArt(route), { waitUntil: 'networkidle' });
        await settle(page);
        const chart = page.locator('.hero__artifact .chart--overall');
        await chart.scrollIntoViewIfNeeded();
        const scroll = chart.locator('.chart__scroll').filter({ visible: true });
        await expect(scroll).toHaveCount(1);
        const frame = await box(scroll);
        expect(frame.x, 'chart box starts inside the viewport').toBeGreaterThanOrEqual(0);
        expect(frame.x + frame.width, 'chart box ends inside the viewport').toBeLessThanOrEqual(width);
        expect(await scroll.evaluate((el) => el.scrollWidth - el.clientWidth), 'no horizontal scroll inside the chart').toBeLessThanOrEqual(1);
        for (const row of overallAuc) {
          const g = scroll.locator(`[data-model="${row.id}"]`);
          const dot = g.locator('.chart__dot');
          const value = g.locator('.chart__value');
          await expect(dot, row.model).toBeVisible();
          await expect(value, row.model).toHaveText(row.auc.toFixed(3));
          for (const [what, part] of [['dot', dot], ['value', value]] as const) {
            const b = await box(part);
            expect(b.x, `${row.model} ${what} left edge inside the chart box`).toBeGreaterThanOrEqual(frame.x - 1);
            expect(b.x + b.width, `${row.model} ${what} right edge inside the chart box`).toBeLessThanOrEqual(frame.x + frame.width + 1);
          }
        }
        await context.close();
      });
    }
  }

  // Same checks as responsive.spec.ts for the no-art pages; phones are emulated as phones (overlay scrollbars, like
  // the mobile-320/375 projects), wider sizes as desktop Chrome.
  for (const width of [320, 375, 768, 1068, 1440]) {
    for (const route of ['/', '/en/', '/player-log/', '/en/player-log/']) {
      test(`no horizontal overflow and no text below 12px at ${width}px (${route})`, async ({ browser }) => {
        const phone = width < 734;
        const context = await browser.newContext({ viewport: { width, height: 800 }, isMobile: phone, hasTouch: phone, deviceScaleFactor: phone ? 2 : 1 });
        const page = await context.newPage();
        await page.goto(noArt(route), { waitUntil: 'networkidle' });
        await settle(page);
        await hydrateAll(page);
        const overflow = await horizontalOverflow(page);
        expect(overflow.scrollWidth, `${route} scrolls sideways: ${overflow.offenders.join(', ')}`).toBeLessThanOrEqual(overflow.width);
        expect(await textBelow12px(page), `${route}: text below 12px`).toEqual([]);
        await context.close();
      });
    }
  }

  for (const route of ['/', '/en/', '/player-log/', '/en/player-log/']) {
    test(`axe clean (${route})`, async ({ page }) => {
      await open(page, noArt(route), 1280, 720);
      await hydrateAll(page);
      const axe = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      expect(axe.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
    });
  }

  for (const [width, dpr] of [[1440, 1], [1920, 1], [2560, 1.5]] as const) {
    test(`hero at ${width}px: copy left, the chart frame fills the right column, no overlap, one-line English name`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, deviceScaleFactor: dpr });
      const page = await context.newPage();
      for (const route of ['/', '/en/']) {
        await page.goto(noArt(route), { waitUntil: 'networkidle' });
        await settle(page);
        const inner = await box(page.locator('.hero__inner'));
        const copy = await box(page.locator('.hero__copy'));
        const artifact = await box(page.locator('.hero__artifact'));
        const pcard = await box(page.locator('.hero__pcard'));
        expect(artifact.x, `${route}: artifact right of the copy`).toBeGreaterThan(copy.x + copy.width + 24);
        expect(artifact.x + artifact.width, `${route}: artifact reaches the container's right gutter`).toBeGreaterThan(inner.x + inner.width - 80);
        expect(artifact.x, `${route}: artifact sits in the right half`).toBeGreaterThan(inner.x + inner.width / 2);
        expect(pcard.x, `${route}: player card under the copy`).toBeLessThan(copy.x + 2);
        // The frame spans most of the hero's height: no empty half-screen beside the copy.
        expect(artifact.height, `${route}: artifact height`).toBeGreaterThan(0.6 * (pcard.y + pcard.height - copy.y));
        const name = page.locator('#hero-name');
        const size = await name.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
        expect((await box(name)).height, `${route}: the name stays on one line`).toBeLessThan(size * 1.6);
      }
      await context.close();
    });
  }

  test('tablet (768px): one column — the copy, then the chart frame, then the player card', async ({ page }) => {
    await open(page, noArt('/'), 768, 1024);
    const copy = await box(page.locator('.hero__copy'));
    const artifact = await box(page.locator('.hero__artifact'));
    const pcard = await box(page.locator('.hero__pcard'));
    expect(artifact.y).toBeGreaterThan(copy.y + copy.height - 1);
    expect(pcard.y).toBeGreaterThan(artifact.y + artifact.height - 1);
    expect(artifact.width).toBeGreaterThan(560); // the wide chart layout fits
    await expect(page.locator('.hero__artifact .chart__scroll--wide')).toBeVisible();
    const title = await box(page.locator('.hero__titlecard'));
    expect(title.width, 'title card spans the row').toBeGreaterThan(700);
  });

  test('MAIN MENU at 1440px: rows span the full container, captions on the right of the same line', async ({ page }) => {
    await open(page, noArt('/'), 1440);
    const inner = await box(page.locator('.mm-sec__inner'));
    const menu = await box(page.locator('.mm'));
    expect(menu.width).toBeGreaterThan(inner.width - 2 * 56 - 2);
    for (const item of await page.locator('.mm__link').all()) {
      const link = await box(item);
      const title = await box(item.locator('.mm__title'));
      const cap = await box(item.locator('.mm__cap'));
      expect(link.x + link.width - (cap.x + cap.width), 'caption ends at the row\'s right padding').toBeLessThan(24);
      expect(cap.y, 'caption on the title\'s line').toBeLessThan(title.y + title.height);
    }
  });

  test('showcase: tint on without art; no fixed 760px/600px stage; tabs on top below 1068px, list column from 1068px', async ({ page }) => {
    for (const width of [375, 768, 1440]) {
      await open(page, noArt('/player-log/'), width);
      const fg = page.locator('section.fg');
      await fg.scrollIntoViewIfNeeded();
      await expect(page.locator('.fg__scene')).toBeVisible();
      await expect(page.locator('.fg__tint--remielle')).toHaveAttribute('data-on', 'true');
      const stage = await box(page.locator('.fg__stage'));
      const copy = await box(page.locator('.fg__copy'));
      expect(stage.height, `${width}px: stage is about the copy's height, no empty block`).toBeLessThan(copy.height + 120);
      const tabs = await page.locator('.fg__tab').all();
      const tabBoxes = await Promise.all(tabs.map(box));
      if (width < 1068) {
        expect(new Set(tabBoxes.map((b) => Math.round(b.y))).size, `${width}px: tabs in one top row`).toBe(1);
        expect(copy.y, `${width}px: copy under the tabs`).toBeGreaterThan(tabBoxes[0].y + tabBoxes[0].height);
      } else {
        expect(tabBoxes[0].width).toBeCloseTo(190, 0);
        expect(new Set(tabBoxes.map((b) => Math.round(b.x))).size, 'tabs stacked in the list column').toBe(1);
        const facts = await box(page.locator('.fg__meta--panel'));
        const why = await box(page.locator('.fg__why'));
        expect(facts.x, 'facts panel beside the copy').toBeGreaterThan(why.x + why.width);
      }
    }
    // Switching games moves the tint.
    await page.locator('.fg__tab').nth(1).click();
    await expect(page.locator('.fg__tint--eula')).toHaveAttribute('data-on', 'true');
  });

  test('Player Log first row: the membership card pairs with the achievement progress (1440px), stacked on phones', async ({ page }) => {
    await open(page, noArt('/player-log/'), 1440);
    const card = await box(page.locator('.mcard'));
    const meter = await box(page.locator('[data-ach-meter]'));
    const grid = await box(page.locator('.pl-intro__grid'));
    expect(meter.x).toBeGreaterThan(card.x + card.width);
    expect(meter.y).toBeLessThan(card.y + card.height);
    expect(meter.y + meter.height).toBeGreaterThan(card.y);
    expect(meter.x + meter.width, 'the panel fills the row to the right edge').toBeGreaterThan(grid.x + grid.width - 56 - 2);
    await expect(page.locator('[data-ach-meter-count]')).toHaveText(/^0 \/ \d 달성$/);
    await open(page, noArt('/player-log/'), 375);
    const cardM = await box(page.locator('.mcard'));
    const meterM = await box(page.locator('[data-ach-meter]'));
    expect(meterM.y).toBeGreaterThan(cardM.y + cardM.height - 1);
  });
});

test.describe('with art (dist): the art shows and replaces the no-art layouts', () => {
  test('hero: the character stage is shown, not the chart; the art stays clear of the copy column', async ({ page }) => {
    for (const width of [1068, 1440, 1600, 1920]) {
      await open(page, '/en/', width);
      await expect(page.locator('section.hero.hero--art')).toHaveCount(1);
      await expect(page.locator('.hero__artifact')).toHaveCount(0);
      await expect(page.locator('.char-stage--hero .char-stage__img')).toBeVisible();
      const frame = await box(page.locator('.char-stage--hero .char-stage__frame'));
      const img = await box(page.locator('.char-stage--hero .char-stage__img'));
      const copy = await box(page.locator('.hero__copy'));
      // Left fade stops are measured in lengths of the designed width (img box), not the possibly-shrunk frame.
      expect(copy.x + copy.width, `${width}px: copy ends before the art's visible part`).toBeLessThanOrEqual(frame.x + 0.32 * img.width + 1);
      const name = page.locator('#hero-name');
      const size = await name.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
      expect((await box(name)).height, `${width}px: "Seongeun Baek" on one line`).toBeLessThan(size * 1.6);
    }
  });

  test('tablet (768px): copy and art in two columns; the title card spans the whole row', async ({ page }) => {
    await open(page, '/', 768, 1024);
    const copy = await box(page.locator('.hero__copy'));
    expect(copy.width).toBeLessThan(768 * 0.6);
    await expect(page.locator('.char-stage--hero .char-stage__img')).toBeVisible();
    expect((await box(page.locator('.hero__titlecard'))).width).toBeGreaterThan(700);
  });

  test('MAIN MENU: the side art sits next to the menu inside the HUD container, also at 1920px', async ({ page }) => {
    for (const width of [1440, 1920]) {
      await open(page, '/', width);
      await expect(page.locator('#main-menu.mm-sec--art')).toHaveCount(1);
      await page.locator('#main-menu').scrollIntoViewIfNeeded();
      const frame = await box(page.locator('.char-stage--side .char-stage__frame'));
      const inner = await box(page.locator('.mm-sec__inner'));
      expect(frame.x + frame.width, `${width}px: art ends by the container edge`).toBeLessThanOrEqual(inner.x + inner.width + 40 + 1);
      expect(frame.x).toBeGreaterThan(inner.x + inner.width / 2);
    }
  });

  test('Player Log: tiles and the showcase art show; the showcase keeps its fixed art stage (520px with two games)', async ({ page }) => {
    await open(page, '/player-log/', 1440);
    await hydrateAll(page);
    await expect(page.locator('.fav-tile')).toHaveCount(3);
    await expect(page.locator('[data-ach-meter]')).toHaveCount(0);
    await page.locator('section.fg').scrollIntoViewIfNeeded();
    await expect(page.locator('.fg__chr img')).toBeVisible();
    // final fix 2 item 8: D-13 leaves two games, so the tabs sit in a row and the art stage is 520px (600px with 4+)
    expect((await box(page.locator('section.fg'))).height).toBeCloseTo(520, 0);
    await open(page, '/player-log/', 1920);
    for (const tile of await page.locator('.fav-tile').all()) {
      const b = await box(tile);
      expect(b.width).toBeGreaterThan(176);
      expect(b.width).toBeLessThanOrEqual(250.5);
    }
  });
});
