// LINKED ACCOUNTS row (account-link spec §3.1, §3.5, §11.1; plan AL-10 static part). Two builds:
// - dist (the default server, no feeds — today's real build): the row is a zero-height empty frame, no tile, and
//   #acct-status lists the five enabled tiles as absent;
// - dist-e2e-accounts (SB_E2E_ACCOUNTS=1, the third web server, never deployed): the synthetic fixture feeds of
//   tests/fixtures/generated. The expected tile set is computed here with the view model's pure part (the same
//   accountStatus the page uses, spec §11.1 "same pure function"), with the feeds stamped fresh as that build does.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { load } from 'js-yaml';
import type { FavoriteGameData } from '../../src/content/schemas';
import { TILE_SLOTS, accountStatus, type AccountStatus } from '../../src/lib/account-state';
import type { AccountFeed, RiotLinks } from '../../src/lib/generated';
import { collectViolations, expect, test, watchViolations } from './helpers';

const ACCOUNTS_ORIGIN = `http://127.0.0.1:${Number(process.env.E2E_ACCOUNTS_PORT ?? 4332)}`;
const ROUTES = ['/game/player-log/', '/en/game/player-log/'];
const FIXTURES = join(process.cwd(), 'tests/fixtures/generated');

function fixtureStatus(): AccountStatus {
  const games = (load(readFileSync(join(process.cwd(), 'src/data/favorites.yaml'), 'utf8')) as { games: FavoriteGameData[] }).games;
  const now = new Date().toISOString();
  const read = <T>(rel: string): T => ({ ...(JSON.parse(readFileSync(join(FIXTURES, rel), 'utf8')) as object), fetchedAt: now }) as T;
  const feeds: Record<string, AccountFeed> = {};
  for (const platform of ['enka-genshin', 'enka-zzz', 'steam']) feeds[platform] = read<AccountFeed>(`accounts/${platform}.json`);
  return accountStatus(games, feeds, read<RiotLinks>('links/riot.json'), Date.now(), null);
}

async function statusOf(page: Page): Promise<AccountStatus> {
  return JSON.parse((await page.locator('script#acct-status').textContent()) ?? 'null') as AccountStatus;
}

test.describe('LINKED ACCOUNTS row — real build without feeds (dark)', () => {
  for (const route of ROUTES) {
    test(`${route}: zero-height empty frame, no tile, no caption, the showcase unchanged, #acct-status all absent`, async ({ page }) => {
      await page.goto(route, { waitUntil: 'load' });
      const empty = page.locator('#membership .container.container--hud > astro-island .acct-row.acct-row--empty');
      await expect(empty).toHaveCount(1);
      expect((await empty.boundingBox())?.height).toBe(0);
      await expect(page.locator('details.acct-tile')).toHaveCount(0);
      await expect(page.locator('.acct-links__cap')).toHaveCount(0);
      await expect(page.locator('#favorite-games [role="tab"]')).toHaveCount(6);
      await expect(page.locator('.fg-acct')).toHaveCount(0);
      // the HUD container is exactly as tall as the card grid: the empty frame adds no space
      const heights = await page.evaluate(() => {
        const c = document.querySelector('#membership > .container.container--hud') as HTMLElement;
        const g = c.querySelector('.pl-intro__grid') as HTMLElement;
        return { container: c.clientHeight, grid: g.getBoundingClientRect().height };
      });
      expect(heights.container).toBeCloseTo(heights.grid, 0);
      const status = await statusOf(page);
      expect(status.platforms).toEqual(TILE_SLOTS.map((_, slot) => ({ slot, state: 'absent' })));
      expect(Object.keys(status).sort()).toEqual(['platforms', 'runId']);
    });
  }
});

test.describe('LINKED ACCOUNTS row — fixture build (SB_E2E_ACCOUNTS=1)', () => {
  const expected = fixtureStatus();
  const shown = expected.platforms.filter((p) => p.state === 'shown').length;

  test('the fixture feeds make all five tiles', () => {
    expect(shown).toBe(5);
  });

  for (const route of ROUTES) {
    test(`${route}: details.acct-tile count = the view model's shown tiles; #acct-status matches it`, async ({ page }) => {
      await page.goto(`${ACCOUNTS_ORIGIN}${route}`, { waitUntil: 'load' });
      // <details> before hydration, <button> after (AL-11): the same count either way
      await expect(page.locator('#membership ul.acct-row[role="list"] > li > .acct-tile')).toHaveCount(shown);
      await expect(page.locator('#membership .acct-links__cap')).toBeVisible();
      await expect(page.locator('#favorite-games [role="tab"]')).toHaveCount(6);
      await expect(page.locator('.fg-acct')).toHaveCount(0);
      const status = await statusOf(page);
      expect(status.platforms.map(({ slot, state }) => ({ slot, state }))).toEqual(expected.platforms.map(({ slot, state }) => ({ slot, state })));
      for (const p of status.platforms) expect(typeof p.fetchedAt === 'string' || p.fetchedAt === undefined).toBe(true);
    });
  }

  for (const width of [375, 1280]) {
    test(`the row's left edge equals the membership card's left edge at ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${ACCOUNTS_ORIGIN}/game/player-log/`, { waitUntil: 'load' });
      const row = await page.locator('#membership ul.acct-row').boundingBox();
      const card = await page.locator('#membership .mcard').boundingBox();
      expect(row).not.toBeNull();
      expect(Math.abs((row?.x ?? 0) - (card?.x ?? -99))).toBeLessThanOrEqual(0.5);
    });
  }

  for (const width of [320, 375]) {
    test(`no horizontal scroll with five tiles at ${width}; five tiles on one row at 375`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(`${ACCOUNTS_ORIGIN}/game/player-log/`, { waitUntil: 'load' });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      if (width === 375) {
        const tops = await page.locator('#membership ul.acct-row > li').evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
        expect(new Set(tops).size).toBe(1);
      }
    });
  }

  test('JavaScript off at 375×667: an opened <details> spans the full row and shows the numbers', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 375, height: 667 } });
    const page = await context.newPage();
    await page.goto(`${ACCOUNTS_ORIGIN}/game/player-log/`, { waitUntil: 'load' });
    const second = page.locator('#membership ul.acct-row > li').nth(1);
    await second.locator('summary').click();
    await expect(second.locator('details.acct-tile')).toHaveAttribute('open', '');
    await expect(second.locator('.acct-card dl dd').first()).toBeVisible();
    const [li, row] = await Promise.all([second.boundingBox(), page.locator('#membership ul.acct-row').boundingBox()]);
    expect(Math.abs((li?.width ?? 0) - (row?.width ?? -1))).toBeLessThanOrEqual(0.5);
    expect(Math.abs((li?.x ?? 0) - (row?.x ?? -1))).toBeLessThanOrEqual(0.5);
    await context.close();
  });
});

// AL-11: the dialog shell on the fixture build (spec §3.1 mount swap, §3.2, §3.7).
test.describe('account dialog shell — fixture build', () => {
  const tiles = (page: Page) => page.locator('#membership ul.acct-row > li > button.acct-tile');
  const dialog = (page: Page) => page.locator('dialog#acct-dlg');
  const KO_GAMES = ['젠레스 존 제로', '원신', '리그 오브 레전드', '전략적 팀 전투', 'Steam'];

  async function ready(page: Page, width: number, height: number): Promise<void> {
    await page.setViewportSize({ width, height });
    await page.goto(`${ACCOUNTS_ORIGIN}/game/player-log/`, { waitUntil: 'load' });
    await expect(tiles(page)).toHaveCount(5); // hydrated (client:idle): the <details> became buttons
  }

  for (const [width, height] of [[1280, 800], [375, 667]] as const) {
    test(`keyboard at ${width}×${height}: Enter opens with focus on close, ←/→ switch, Esc closes and focus returns to the current tile`, async ({ page }) => {
      await watchViolations(page);
      await ready(page, width, height);
      await tiles(page).nth(1).focus();
      await page.keyboard.press('Enter');
      await expect(dialog(page)).toBeVisible();
      await expect(dialog(page)).toHaveAttribute('data-state', 'open');
      await expect(page.locator('#acct-game')).toHaveText(KO_GAMES[1]!);
      await expect(page.locator('.acct-dlg__close')).toBeFocused();
      expect(await page.evaluate(() => document.documentElement.classList.contains('is-scroll-locked'))).toBe(true);
      // the dialog fits the viewport: max(560, vw - 32) wide, 100dvh - 32 tall at most, no page scroll sideways
      const box = await dialog(page).boundingBox();
      expect(box?.width ?? 999).toBeLessThanOrEqual(Math.min(560, width - 32) + 0.5);
      expect(box?.height ?? 999).toBeLessThanOrEqual(height - 32 + 0.5);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await expect(page.locator('#acct-game')).toHaveText(KO_GAMES[3]!);
      await expect(page.locator('.acct-dlg__pos')).toHaveText('4 / 5');
      await expect(dialog(page).locator('[role="status"]')).toHaveText(/^4 \/ 5 · 전략적 팀 전투 · /);
      await expect(page.locator('.acct-dlg__close')).toBeFocused();

      // Tab stays inside the dialog
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press('Tab');
        expect(await page.evaluate(() => document.activeElement?.closest('dialog#acct-dlg') !== null)).toBe(true);
      }

      await page.keyboard.press('Escape');
      await expect(dialog(page)).toBeHidden();
      await expect(tiles(page).nth(3)).toBeFocused();
      expect(await page.evaluate(() => document.documentElement.classList.contains('is-scroll-locked'))).toBe(false);
      // the island sets its styles through the CSSOM only: no CSP violation with the dialog opened and switched
      expect(await collectViolations(page)).toEqual([]);
    });

    test(`pointer at ${width}×${height}: tile click opens, ‹ › switch with focus kept on the arrow, backdrop and close button close`, async ({ page }) => {
      await ready(page, width, height);
      await tiles(page).nth(4).click();
      await expect(dialog(page)).toBeVisible();
      await expect(page.locator('#acct-game')).toHaveText('Steam');
      const next = page.locator('.acct-dlg__next');
      await expect(next).toHaveAttribute('aria-label', `다음 계정: ${KO_GAMES[0]}`);
      await next.click();
      await expect(page.locator('#acct-game')).toHaveText(KO_GAMES[0]!);
      await expect(next).toBeFocused();
      // a click on the backdrop (outside the dialog box): pointerdown and click both hit the <dialog>
      await page.mouse.click(4, height - 4);
      await expect(dialog(page)).toBeHidden();
      await expect(tiles(page).nth(0)).toBeFocused();

      await tiles(page).nth(2).click();
      await expect(dialog(page)).toBeVisible();
      // a drag that starts inside the dialog and ends on the backdrop does not close
      const title = await page.locator('#acct-title').boundingBox();
      await page.mouse.move((title?.x ?? 0) + 4, (title?.y ?? 0) + 4);
      await page.mouse.down();
      await page.mouse.move(4, height - 4);
      await page.mouse.up();
      await expect(dialog(page)).toHaveAttribute('data-state', 'open');
      await page.locator('.acct-dlg__close').click();
      await expect(dialog(page)).toBeHidden();
      await expect(tiles(page).nth(2)).toBeFocused();
    });

    test(`every control in the row and the dialog is at least 44×44 at ${width}×${height}`, async ({ page }) => {
      await ready(page, width, height);
      await tiles(page).first().click();
      await expect(dialog(page)).toHaveAttribute('data-state', 'open');
      const sizes = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('#membership ul.acct-row button, dialog#acct-dlg button, dialog#acct-dlg a[href]')].map((el) => {
          const r = el.getBoundingClientRect();
          return { what: el.className || el.tagName, w: r.width, h: r.height };
        }),
      );
      expect(sizes.length).toBeGreaterThanOrEqual(5 + 3);
      for (const s of sizes) {
        expect(s.w, s.what).toBeGreaterThanOrEqual(44);
        expect(s.h, s.what).toBeGreaterThanOrEqual(44);
      }
    });
  }

  test('reduced motion: the dialog opens and closes with the short fade', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await ready(page, 1280, 800);
    expect(await page.evaluate(() => document.documentElement.getAttribute('data-motion'))).toBe('reduce');
    await tiles(page).first().click();
    await expect(dialog(page)).toHaveAttribute('data-state', 'open');
    expect(await dialog(page).evaluate((el) => getComputedStyle(el).transitionDuration)).toBe('0.15s');
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toBeHidden({ timeout: 1000 });
  });

  test('forced colours: the open dialog keeps a visible 1px edge (G-012)', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await ready(page, 1280, 800);
    await tiles(page).first().click();
    await expect(dialog(page)).toBeVisible();
    const edge = await dialog(page).evaluate((el) => {
      const cs = getComputedStyle(el);
      return [cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth].map(parseFloat);
    });
    for (const w of edge) expect(w).toBeGreaterThanOrEqual(1);
  });

  test('English page: English head and arrow labels', async ({ page }) => {
    await page.goto(`${ACCOUNTS_ORIGIN}/en/game/player-log/`, { waitUntil: 'load' });
    await expect(tiles(page)).toHaveCount(5);
    await tiles(page).nth(0).click();
    await expect(page.locator('#acct-game')).toHaveText('Zenless Zone Zero');
    await expect(page.locator('.acct-dlg__profile')).toHaveText('INTER-KNOT PROFILE');
    await expect(page.locator('.acct-dlg__prev')).toHaveAttribute('aria-label', 'Previous account: Steam');
    await expect(page.locator('.acct-dlg__close')).toContainText('Close');
  });
});
