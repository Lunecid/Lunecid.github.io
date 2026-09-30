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
import { expect, test } from './helpers';

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
      await expect(page.locator('#membership ul.acct-row[role="list"] > li > details.acct-tile')).toHaveCount(shown);
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
