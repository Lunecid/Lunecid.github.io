// LINKED ACCOUNTS row (account-link spec §3.1, §3.5, §11.1; plan AL-10 static part). Two builds:
// - dist (the default server, no feeds — today's real build): the row is a zero-height empty frame, no tile, and
//   #acct-status lists the five enabled tiles as absent;
// - dist-e2e-accounts (SB_E2E_ACCOUNTS=1, the third web server, never deployed): the synthetic fixture feeds of
//   tests/fixtures/generated. The expected tile set is computed here with the view model's pure part (the same
//   accountStatus the page uses, spec §11.1 "same pure function"), with the feeds stamped fresh as that build does.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { load } from 'js-yaml';
import type { FavoriteGameData } from '../../src/content/schemas';
import { TILE_SLOTS, accountStatus, type AccountStatus } from '../../src/lib/account-state';
import type { AccountFeed, RiotLinks } from '../../src/lib/generated';
import { collectViolations, expect, test, watchViolations } from './helpers';

const ACCOUNTS_ORIGIN = `http://127.0.0.1:${Number(process.env.E2E_ACCOUNTS_PORT ?? 4332)}`;
const ROUTES = ['/game/player-log/', '/en/game/player-log/'];
const FIXTURES = join(process.cwd(), 'tests/fixtures/generated');
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
/** The open timeline's last step ends at 1400 ms (TL.foot, spec §3.6); wait a little past it before measuring. */
const SETTLED_MS = 1600;

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

// AL-12: the card in the dialog, the open timeline, reduced motion (spec §3.2–3.7; fix-brief A-01, A-02).
test.describe('account card — fixture build (AL-12)', () => {
  const tiles = (page: Page) => page.locator('#membership ul.acct-row > li > button.acct-tile');
  const dialog = (page: Page) => page.locator('dialog#acct-dlg');

  async function ready(page: Page, width: number, height: number, route = '/game/player-log/'): Promise<void> {
    await page.setViewportSize({ width, height });
    await page.goto(`${ACCOUNTS_ORIGIN}${route}`, { waitUntil: 'load' });
    await expect(tiles(page)).toHaveCount(5);
  }

  /** Lines a text box occupies: the distinct tops of its text's client rects (a wrapped value has two or more). */
  const lineCounts = (page: Page, selector: string) =>
    page.locator(selector).evaluateAll((els) =>
      els.map((el) => {
        // a counting value keeps its final text in a 1px sr-only twin: measure the visible part only
        const range = document.createRange();
        range.selectNodeContents(el.querySelector('[aria-hidden="true"]') ?? el);
        const tops = new Set([...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top)));
        return { text: el.textContent ?? '', lines: tops.size };
      }),
    );

  for (const [width, height] of [[375, 667], [1280, 800]] as const) {
    test(`all five cards at ${width}: axe 0, Korean stat labels, no landmark, CSP 0, every request stays on 127.0.0.1`, async ({ page }) => {
      const hosts = new Set<string>();
      page.on('request', (request) => hosts.add(new URL(request.url()).hostname));
      await watchViolations(page);
      await ready(page, width, height);
      await tiles(page).first().click();
      await expect(dialog(page)).toHaveAttribute('data-state', 'open');
      await page.waitForTimeout(SETTLED_MS);
      for (let i = 0; i < 5; i++) {
        if (i > 0) {
          await page.keyboard.press('ArrowRight');
          await expect(page.locator('.acct-dlg__pos')).toHaveText(`${i + 1} / 5`);
          await page.waitForTimeout(400); // past the 180 ms cross-fade
        }
        const axe = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
        expect(axe.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`), `axe, card ${i + 1}`).toEqual([]);
        // G-009: no landmark or labelled region in the dialog
        await expect(dialog(page).locator('section, [role="region"], article, aside, nav, main')).toHaveCount(0);
        // G-006: the ko page's stat labels are Korean
        for (const dt of await dialog(page).locator('.acct-dlg__card:not(.acct-dlg__card--out) dl dt').allTextContents()) expect(dt).toMatch(/[가-힣]/);
      }
      await expect(page.locator('.fg-acct')).toHaveCount(0); // F-050, G-001: no overlay card on the showcase
      expect(await collectViolations(page)).toEqual([]);
      // no relay or GitHub request without ?manage, and nothing leaves the preview host
      expect([...hosts].filter((h) => h.endsWith('workers.dev') || h === 'api.github.com')).toEqual([]);
      expect([...hosts]).toEqual(['127.0.0.1']);
    });
  }

  for (const width of [375, 768, 1440]) {
    test(`no value wraps mid-number and the fetched-at line is one line at ${width} (G-004, G-005)`, async ({ page }) => {
      await ready(page, width, 900);
      await tiles(page).first().click();
      await expect(dialog(page)).toHaveAttribute('data-state', 'open');
      await page.waitForTimeout(SETTLED_MS);
      let checked = 0;
      for (let i = 0; i < 5; i++) {
        if (i > 0) {
          await page.keyboard.press('ArrowRight');
          await page.waitForTimeout(400);
        }
        const card = '#acct-dlg .acct-dlg__card:not(.acct-dlg__card--out)';
        for (const dd of await lineCounts(page, `${card} dl dd`)) {
          expect(dd.lines, `dd "${dd.text}"`).toBe(1);
          checked++;
        }
        for (const line of await lineCounts(page, `${card} .acct-card__asof`)) expect(line.lines, line.text).toBe(1);
      }
      expect(checked).toBe(6); // zzz 1 + genshin 4 + steam 1
    });
  }

  test('JavaScript off: the stat values and Korean labels are in the served HTML (G-010, G-006)', async ({ request }) => {
    const html = await (await request.get(`${ACCOUNTS_ORIGIN}/game/player-log/`)).text();
    for (const pair of ['<dt>모험 등급</dt><dd>57</dd>', '<dt>업적</dt><dd>812</dd>', '<dt>나선 비경</dt><dd>12층 3방</dd>', '<dt>인터노트 레벨</dt><dd>55</dd>', '<dt>Steam 레벨</dt><dd>42</dd>']) {
      expect(html).toContain(pair);
    }
  });

  test('full motion: the ghost frame flies in and is gone once the panel shows; the first open counts up, a switch shows final values', async ({ page }) => {
    await ready(page, 1280, 800);
    await tiles(page).nth(1).click();
    await expect(dialog(page).locator('.acct-dlg__ghost')).toHaveCount(1);
    await expect(dialog(page).locator('.acct-dlg__ghost-corner')).toHaveCount(4);
    const first = dialog(page).locator('.acct-dlg__card:not(.acct-dlg__card--out) dl dd').first();
    await expect(first.locator('[aria-hidden="true"]')).toHaveCount(1); // counting
    await expect(first.locator('.sr-only')).toHaveText('57');
    await expect(dialog(page).locator('.acct-dlg__ghost')).toHaveCount(0);
    await expect(first.locator('[aria-hidden="true"]')).toHaveText('57');
    await page.keyboard.press('ArrowLeft');
    await expect(dialog(page).locator('.acct-dlg__card:not(.acct-dlg__card--out) dl dd').first()).toHaveText('55');
  });

  for (const path of ['os', 'site'] as const) {
    test(`reduced motion (${path === 'os' ? 'OS setting' : 'site toggle'}): no ghost, no count-up, final values at once`, async ({ page }) => {
      if (path === 'os') await page.emulateMedia({ reducedMotion: 'reduce' });
      else await page.addInitScript(() => localStorage.setItem('sb:motion', 'off'));
      let ghostSeen = false;
      await ready(page, 1280, 800);
      expect(await page.evaluate(() => document.documentElement.getAttribute('data-motion'))).toBe('reduce');
      await page.evaluate(() => {
        new MutationObserver(() => {
          if (document.querySelector('.acct-dlg__ghost')) (window as unknown as { __ghost: boolean }).__ghost = true;
        }).observe(document.body, { subtree: true, childList: true });
      });
      await tiles(page).nth(1).click();
      await expect(dialog(page)).toHaveAttribute('data-state', 'open');
      await expect(dialog(page).locator('dl dd').first()).toHaveText('57');
      await expect(dialog(page).locator('dl dd [aria-hidden="true"]')).toHaveCount(0);
      expect(await dialog(page).evaluate((el) => getComputedStyle(el).transitionDuration)).toBe('0.15s');
      await page.keyboard.press('ArrowRight');
      await expect(dialog(page).locator('.acct-dlg__card--out')).toHaveCount(0);
      ghostSeen = await page.evaluate(() => (window as unknown as { __ghost?: boolean }).__ghost === true);
      expect(ghostSeen).toBe(false);
    });
  }
});
