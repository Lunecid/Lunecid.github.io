// LINKED ACCOUNTS row (account-link spec §3.1, §3.5, §11.1; plan AL-10 static part). Two builds:
// - dist (the default server, no feeds — today's real build): the row is a zero-height empty frame, no tile, and
//   #acct-status lists the five enabled tiles as absent;
// - dist-e2e-accounts (SB_E2E_ACCOUNTS=1, the third web server, never deployed): the synthetic fixture feeds of
//   tests/fixtures/generated. The expected tile set is computed here with the view model's pure part (the same
//   accountStatus the page uses, spec §11.1 "same pure function"), with the feeds stamped fresh as that build does.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { load } from 'js-yaml';
import type { FavoriteGameData } from '../../src/content/schemas';
import { adminCopy } from '../../src/i18n/accounts-admin';
import { ui } from '../../src/i18n/ui';
import { TILE_SLOTS, accountStatus, type AccountStatus } from '../../src/lib/account-state';
import { containsTrademark } from '../../src/lib/seo';
import type { AccountFeed, RiotLinks } from '../../src/lib/generated';
import { FAKE_HANDLE, FAKE_STEAM, FAKE_TICKET, RELAY, collectViolations, expect, mockRelay, test, watchViolations } from './helpers';
import { ACCOUNTS_ORIGIN, ORIGIN } from './ports';

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

  // PL-6 (named change): the tiles are small character cards now — three per row on a phone (was: all five on one
  // row at 375), one row at 1280; never a horizontal scroll.
  for (const width of [320, 375]) {
    test(`no horizontal scroll with five tiles at ${width}; rows of three at 375`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(`${ACCOUNTS_ORIGIN}/game/player-log/`, { waitUntil: 'load' });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      if (width === 375) {
        const tops = await page.locator('#membership ul.acct-row > li').evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
        expect(tops.slice(0, 3).every((t) => t === tops[0])).toBe(true);
        expect(tops.slice(3).every((t) => t === tops[3])).toBe(true);
        expect(tops[3]).toBeGreaterThan(tops[0] as number);
      }
    });
  }

  test('PL-6: five character cards at 1280 in one row and at 375 in rows of three; no horizontal scroll at 320', async ({ page }) => {
    const rows = async () => {
      const tops = await page.locator('#membership ul.acct-row > li').evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
      const lines = [...new Set(tops)];
      return lines.map((top) => tops.filter((t) => t === top).length);
    };
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${ACCOUNTS_ORIGIN}/game/player-log/`, { waitUntil: 'load' });
    await expect(page.locator('#membership ul.acct-row > li > button.acct-tile')).toHaveCount(5);
    expect(await rows()).toEqual([5]);
    // every card: an art window in the 128:140 portrait box, at most 136px wide on the desktop track
    const frames = await page.locator('#membership .acct-tile__frame').evaluateAll((els) => els.map((el) => el.getBoundingClientRect()).map((r) => ({ w: r.width, h: r.height })));
    expect(frames).toHaveLength(5);
    for (const f of frames) {
      expect(f.w).toBeLessThanOrEqual(136);
      expect(Math.abs(f.h / f.w - 140 / 128)).toBeLessThan(0.02);
    }
    await page.setViewportSize({ width: 375, height: 800 });
    expect(await rows()).toEqual([3, 2]);
    await page.setViewportSize({ width: 320, height: 800 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    // every tile keeps a ≥ 44px target
    for (const box of await page.locator('#membership ul.acct-row > li > button.acct-tile').evaluateAll((els) => els.map((el) => el.getBoundingClientRect()))) {
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
  });

  test('PL-6: no layout shift when the card art loads (width/height reserve)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    // the art is lazy: hold every image response until the row has been measured without it
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    await page.route(/\/_astro\/.*\.(webp|avif|png)(\?.*)?$/, async (route) => {
      await gate;
      await route.continue();
    });
    await page.goto(`${ACCOUNTS_ORIGIN}/game/player-log/`, { waitUntil: 'domcontentloaded' });
    const row = page.locator('#membership ul.acct-row');
    await row.scrollIntoViewIfNeeded();
    const before = await page.locator('#membership ul.acct-row > li').evaluateAll((els) => els.map((el) => el.getBoundingClientRect()).map((r) => [r.width, r.height]));
    // nothing has loaded yet: the boxes measured above are the reserved ones
    expect(await page.locator('#membership img.acct-tile__art').evaluateAll((imgs) => imgs.some((img) => (img as HTMLImageElement).naturalWidth > 0))).toBe(false);
    release();
    await expect.poll(() => page.locator('#membership img.acct-tile__art').evaluateAll((imgs) => imgs.every((img) => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0))).toBe(true);
    const after = await page.locator('#membership ul.acct-row > li').evaluateAll((els) => els.map((el) => el.getBoundingClientRect()).map((r) => [r.width, r.height]));
    expect(after).toEqual(before);
    // the whole page: no layout shift entry attributed to the row
    const shift = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          let sum = 0;
          new PerformanceObserver((list) => {
            for (const e of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean; sources?: { node?: Node | null }[] })[]) {
              if (!e.hadRecentInput && e.sources?.some((s) => s.node instanceof Element && s.node.closest('#membership .acct-row'))) sum += e.value;
            }
          }).observe({ type: 'layout-shift', buffered: true });
          setTimeout(() => resolve(sum), 300);
        }),
    );
    expect(shift).toBe(0);
  });

  test('PL-6: every card art URL is a /_astro/ file without a trademark term; no request leaves 127.0.0.1', async ({ page }) => {
    const outside: string[] = [];
    page.on('request', (req) => {
      const url = new URL(req.url());
      if (url.protocol !== 'data:' && url.hostname !== '127.0.0.1') outside.push(req.url());
    });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${ACCOUNTS_ORIGIN}/game/player-log/`, { waitUntil: 'load' });
    const imgs = page.locator('#membership .acct-tile__frame img.acct-tile__art');
    await expect(imgs).toHaveCount(5);
    const urls = await page.locator('#membership .acct-tile__frame').evaluateAll((frames) =>
      frames.flatMap((f) => [...f.querySelectorAll('img, source')].flatMap((el) => [el.getAttribute('src') ?? '', ...(el.getAttribute('srcset') ?? '').split(',').map((part) => part.trim().split(/\s+/)[0] ?? '')]).filter(Boolean)),
    );
    expect(urls.length).toBeGreaterThanOrEqual(5 * 3);
    for (const url of urls) {
      expect(url, url).toMatch(/^\/_astro\/[^/]+$/);
      expect(containsTrademark(url), url).toBe(false);
    }
    for (const img of await imgs.all()) {
      await img.scrollIntoViewIfNeeded();
      await expect.poll(() => img.evaluate((el) => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0)).toBe(true);
    }
    expect(outside).toEqual([]);
  });

  test('PL-6: with a Riot card shown the footer carries the Riot assets notice', async ({ page }) => {
    for (const route of ROUTES) {
      await page.goto(`${ACCOUNTS_ORIGIN}${route}`, { waitUntil: 'load' });
      await expect(page.locator('#membership ul.acct-row [data-skin="lol"] img.acct-tile__art')).toHaveCount(1);
      await expect(page.locator('#membership ul.acct-row [data-skin="tft"] img.acct-tile__art')).toHaveCount(1);
      const notices = page.locator('.site-footer__notices');
      await expect(notices).toContainText(ui.en['notice.riotAssets']);
      // the API disclaimer stays off this page (no Riot API is used)
      await expect(notices).not.toContainText(ui.en['notice.riot']);
    }
  });

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

// Owner mode (?manage; spec §4.1–§4.8, §11.1). The management copy is the panel's (src/i18n/accounts-admin.ts); the row's
// words ("연동 관리", the state words) are visitor copy from ui.ts.
const A = adminCopy.ko;
const PANEL_CONTROLS = 'dialog#acct-dlg button, dialog#acct-dlg a[href], dialog#acct-dlg summary, dialog#acct-dlg input:not([type="checkbox"])';

/** Management copy a page must not carry: every sentence and longer label not shared with ui.ts (as the dist check in
 *  tests/unit/accounts-admin-i18n.test.ts), cut to its longest literal part between placeholders. Matched against the
 *  page outside <style>: every stylesheet is inlined, the lazy panel's too, and its selectors are not copy. */
function managementLiterals(lang: 'ko' | 'en'): string[] {
  const shared = new Set(Object.values(ui[lang]) as string[]);
  return Object.entries(adminCopy[lang])
    .filter(([key, value]) => !shared.has(value) && !(key.startsWith('label:') && ([...value].length < 6 || (lang === 'en' && !/\s/.test(value)))))
    .map(([, value]) => value.split(/\{\w+\}/).sort((a, b) => b.length - a.length)[0]?.trim() ?? '')
    .filter((literal) => literal.length >= 4);
}

/** Every control of the row and the dialog that is shown (closed <details> content is laid out but hidden), with its box. */
const controlSizes = (page: Page) =>
  page.evaluate((sel) =>
    [...document.querySelectorAll<HTMLElement>(`#membership ul.acct-row button, ${sel}`)]
      .filter((el) => el.checkVisibility())
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { what: `${el.tagName.toLowerCase()}.${el.className} "${(el.textContent ?? '').trim().slice(0, 24)}"`, w: r.width, h: r.height };
      }),
  PANEL_CONTROLS);

/** Neither the page nor the dialog body scrolls sideways (the command block scrolls inside itself). */
const noSideScroll = (page: Page) =>
  page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.querySelector('dialog#acct-dlg .acct-dlg__body') as HTMLElement | null;
    return doc.scrollWidth <= doc.clientWidth && (body === null || body.scrollWidth <= body.clientWidth);
  });

test.describe('owner mode — real build, relay not set (dark)', () => {
  test('?manage: five status tiles with their state word and "연동 관리"; the region shows relay-unset and the no-login steps; nothing leaves 127.0.0.1', async ({ context, page }) => {
    const seen: string[] = [];
    context.on('request', (req) => seen.push(req.url()));
    await watchViolations(page);
    await page.goto(`${ORIGIN}/game/player-log/?manage`, { waitUntil: 'load' });
    const tiles = page.locator('#membership ul.acct-row > li > button.acct-tile');
    await expect(tiles).toHaveCount(5);
    await expect(tiles.locator('.acct-tile__state')).toHaveText(['미연동', '미연동', '미연동', '미연동', '미연동']);
    const manage = page.locator('#membership ul.acct-row > li:last-child > button.acct-manage');
    await expect(manage).toHaveText('연동 관리');
    expect(await page.evaluate(() => location.href)).toBe(`${ORIGIN}/game/player-log/`);
    await manage.click();
    const dialog = page.locator('dialog#acct-dlg');
    await expect(dialog).toHaveAttribute('data-state', 'open');
    await expect(dialog.locator('.mp__unset')).toContainText(A['relay-unset']);
    await expect(dialog.locator('.mp__unset a')).toBeFocused();
    await expect(dialog.getByRole('button', { name: A['label:login'] })).toHaveCount(0);
    await expect(dialog.locator('details[data-mp="no-login"]')).toHaveAttribute('open', '');
    await expect(dialog.locator('pre')).toHaveText('gh workflow run deploy.yml --ref main -R Lunecid/Lunecid.github.io');
    await expect(dialog.locator('pre')).toBeVisible();
    // the copy button works without a login: the command lines reach the clipboard and the note says so
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: ORIGIN });
    await dialog.getByRole('button', { name: A['label:copy'] }).click();
    await expect(dialog.locator('.mp-nologin__copy [role="status"]')).toHaveText(A.copied);
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('gh workflow run deploy.yml --ref main -R Lunecid/Lunecid.github.io');
    // the management chunk came only now, from this origin; no request left the preview host
    expect(seen.some((url) => /\/_astro\/ManagePanel\.[\w-]+\.js$/.test(url))).toBe(true);
    expect(seen.filter((url) => /^https?:/.test(url) && new URL(url).hostname !== '127.0.0.1')).toEqual([]);
    expect(await collectViolations(page)).toEqual([]);
  });

  test('visitor page: the served HTML carries no management copy, and no modulepreload or request names the management chunks', async ({ page, request }) => {
    for (const [route, lang] of [['/game/player-log/', 'ko'], ['/en/game/player-log/', 'en']] as const) {
      const html = (await (await request.get(`${ORIGIN}${route}`)).text()).replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, '');
      const literals = managementLiterals(lang);
      expect(literals.length).toBeGreaterThan(50);
      for (const literal of literals) expect(html.includes(literal), `${lang}: "${literal}"`).toBe(false);
      expect(html).not.toMatch(/ManagePanel|account-admin/);
    }
    // the chunks exist in this build, so their absence below is meaningful
    const chunks = readdirSync(join(process.cwd(), 'dist/_astro'));
    expect(chunks.some((f) => /^ManagePanel\.[\w-]+\.js$/.test(f))).toBe(true);
    expect(chunks.some((f) => /^account-admin\.[\w-]+\.js$/.test(f))).toBe(true);
    const seen: string[] = [];
    page.on('request', (req) => seen.push(req.url()));
    await page.goto(`${ORIGIN}/game/player-log/`, { waitUntil: 'load' });
    await expect(page.locator('astro-island[component-url*="AccountLinks"]:not([ssr])')).toHaveCount(1); // hydrated
    await page.waitForTimeout(300);
    const preloads = await page.locator('link[rel="modulepreload"]').evaluateAll((links) => links.map((l) => l.getAttribute('href') ?? ''));
    expect(preloads.filter((href) => /ManagePanel|account-admin/.test(href))).toEqual([]);
    expect(seen.filter((url) => /ManagePanel|account-admin/.test(url))).toEqual([]);
  });
});

test.describe('owner mode — fixture build, mocked relay', () => {
  const dialog = (page: Page) => page.locator('dialog#acct-dlg');
  const manage = (page: Page) => page.locator('button.acct-manage');

  test('the whole flow at 1280×800: ?manage → popup login → fill → Steam popup → save → rebuild → polling (fake clock) → per-game result; nothing reaches the network off 127.0.0.1', async ({ context, page }) => {
    test.slow();
    const relay = await mockRelay(context, { steam: true });
    await watchViolations(page);
    await page.clock.install();
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${ACCOUNTS_ORIGIN}/game/player-log/?manage`, { waitUntil: 'load' });
    await expect(manage(page)).toHaveText('연동 관리');
    expect(await page.evaluate(() => location.href)).not.toContain('manage');
    await manage(page).click();
    await expect(dialog(page)).toHaveAttribute('data-state', 'open');
    await expect(page.locator('#acct-game')).toHaveText('젠레스 존 제로');
    const login = dialog(page).getByRole('button', { name: A['label:login'] });
    await expect(login).toBeFocused();

    // GitHub login in a popup: /gh/login → /link-return/ → BroadcastChannel → /gh/session with the popup's nonce
    // (the popup posts and closes itself within milliseconds: its outcome is awaited, then that it closed)
    const ghPopup = context.waitForEvent('page');
    await login.click();
    const ghWindow = await ghPopup;
    const heading = dialog(page).locator('h3.mp__title');
    await expect(heading).toHaveText(/^GitHub 로그인됨 · Lunecid · \d+분 남음$/);
    await expect(heading).toBeFocused();
    await expect.poll(() => ghWindow.isClosed()).toBe(true);
    expect(relay.logins).toHaveLength(1);
    const ghLogin = relay.logins[0] as URL;
    expect(`${ghLogin.origin}${ghLogin.pathname}`).toBe(`${RELAY}/gh/login`);
    expect([...ghLogin.searchParams.keys()]).toEqual(['lang', 'n']);
    expect(ghLogin.searchParams.get('lang')).toBe('ko');
    expect(relay.sessions).toEqual([{ ticket: FAKE_TICKET, n: ghLogin.searchParams.get('n') }]);
    await expect(dialog(page).locator('.mp__perms')).toHaveText(A['label:perms']);

    // fill
    await dialog(page).getByLabel(A['label:field.ACCOUNT_GENSHIN_UID'], { exact: true }).fill('618285856');
    await dialog(page).getByLabel(A['label:field.ACCOUNT_GENSHIN_NAME'], { exact: true }).fill('Traveler');
    await dialog(page).getByLabel(A['label:field.ACCOUNT_RIOT_ID'], { exact: true }).fill('Hide on bush#KR1');
    await dialog(page).getByLabel(A['label:field.riotConfirm'], { exact: true }).fill('Hide on bush#KR1');

    // Steam in a popup: Steam's login → /link-return/?s=… → BroadcastChannel → /openid/verify with that s
    const steamPopup = context.waitForEvent('page');
    await dialog(page).getByRole('button', { name: 'Sign in through Steam' }).click();
    const steamWindow = await steamPopup;
    await expect(dialog(page).locator('.mp-steam__result')).toHaveText(`Steam: ${FAKE_STEAM.name} · ${FAKE_STEAM.id} · 프로필: 공개`);
    await expect.poll(() => steamWindow.isClosed()).toBe(true);
    expect(relay.verifies).toHaveLength(1);
    expect(relay.verifies[0]).toMatchObject({ 'openid.mode': 'id_res', 'openid.claimed_id': `https://steamcommunity.com/openid/id/${FAKE_STEAM.id}` });

    // save: one vars.set per changed field, in ACCOUNT_VARS order
    await dialog(page).getByRole('button', { name: A['label:save'], exact: true }).click();
    await expect(dialog(page).locator('[data-mp="save-alert"]')).toHaveText(A.saved);
    expect(relay.ops.filter((op) => op.op !== 'vars.list' && op.op !== 'workflow.get')).toEqual([
      { op: 'vars.set', name: 'ACCOUNT_GENSHIN_UID', value: '618285856' },
      { op: 'vars.set', name: 'ACCOUNT_GENSHIN_NAME', value: 'Traveler' },
      { op: 'vars.set', name: 'ACCOUNT_STEAM_ID64', value: FAKE_STEAM.id },
      { op: 'vars.set', name: 'ACCOUNT_STEAM_NAME', value: FAKE_STEAM.name },
      { op: 'vars.set', name: 'ACCOUNT_RIOT_ID', value: 'Hide on bush#KR1' },
    ]);

    // rebuild: the dispatch body carries the op alone; the first poll shows the build stage
    await dialog(page).getByRole('button', { name: A['label:rebuild'] }).click();
    await expect(dialog(page).locator('.mp-build__status')).toHaveText(A['stage.build']);
    expect(relay.ops.filter((op) => op.op === 'dispatch')).toEqual([{ op: 'dispatch' }]);
    // the dialog closed while the run is tracked: the static chip, and polling goes on
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toBeHidden();
    await expect(manage(page).locator('.acct-manage__chip')).toHaveText('빌드 중 · 0분');
    const polls = relay.ops.filter((op) => op.op === 'run.get').length;
    relay.finish();
    await page.clock.fastForward(20_000);
    await expect.poll(() => relay.ops.filter((op) => op.op === 'run.get').length).toBeGreaterThan(polls);
    await expect(manage(page).locator('.acct-manage__chip')).toHaveCount(0);
    await manage(page).click();
    await expect(dialog(page).locator('.mp-build__status > p')).toHaveText([
      '젠레스 존 제로 · 표시 중', '원신 · 표시 중', '리그 오브 레전드 · 표시 중', '전략적 팀 전투 · 표시 중', 'Steam · 표시 안 됨', A['result.reasons'],
    ]);
    await expect(dialog(page).getByRole('button', { name: A['label:refresh'] })).toBeVisible();

    // nothing secret on the page; every request off 127.0.0.1 was a relay or Steam request, and each was routed
    const html = await page.content();
    expect(html).not.toContain(FAKE_TICKET);
    expect(html).not.toContain(FAKE_HANDLE);
    expect(page.url()).toBe(`${ACCOUNTS_ORIGIN}/game/player-log/`);
    const offHost = relay.seen.filter((url) => new URL(url).hostname !== '127.0.0.1');
    expect(offHost.length).toBeGreaterThan(0);
    for (const url of offHost) expect(relay.routed.has(url), url).toBe(true);
    expect([...new Set(offHost.map((url) => new URL(url).origin))].sort()).toEqual([RELAY, 'https://steamcommunity.com'].sort());
    expect(await collectViolations(page)).toEqual([]);
  });

  test('popups blocked: [같은 창에서 로그인] sends this tab to the relay\'s /gh/login with mode=tab (the route cuts it)', async ({ context, page }) => {
    const relay = await mockRelay(context);
    await page.addInitScript(() => {
      window.open = () => null;
    });
    await page.goto(`${ACCOUNTS_ORIGIN}/game/player-log/?manage`, { waitUntil: 'load' });
    await manage(page).click();
    await dialog(page).getByRole('button', { name: A['label:login'] }).click();
    await expect(dialog(page).locator('[data-mp="error"]')).toHaveText(A['popup-blocked']);
    const navigation = page.waitForRequest((req) => req.url().startsWith(`${RELAY}/gh/login`));
    await dialog(page).getByRole('button', { name: A['label:sameTab'] }).click();
    const req = await navigation;
    expect(req.url()).toBe(`${RELAY}/gh/login?lang=ko&mode=tab`);
    expect(req.isNavigationRequest()).toBe(true);
    expect(relay.logins.map((url) => url.href)).toEqual([`${RELAY}/gh/login?lang=ko&mode=tab`]);
    expect(relay.sessions).toEqual([]);
  });

  for (const [width, height] of [[375, 667], [1280, 800]] as const) {
    test(`?manage#gh= at ${width}×${height}: within 2 s and without scrolling, the address loses #gh= and manage and the dialog is open (client:idle)`, async ({ context, page }) => {
      const relay = await mockRelay(context);
      await page.setViewportSize({ width, height });
      const started = Date.now();
      await page.goto(`${ACCOUNTS_ORIGIN}/game/player-log/?manage#gh=${FAKE_TICKET}`, { waitUntil: 'commit' });
      await expect(dialog(page)).toHaveAttribute('open', '', { timeout: 2000 });
      const href = await page.evaluate(() => location.href);
      expect(Date.now() - started).toBeLessThanOrEqual(2000);
      expect(href).not.toContain('#gh=');
      expect(href).not.toContain('manage');
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
      expect(relay.sessions).toEqual([{ ticket: FAKE_TICKET, n: null }]);
      await expect(dialog(page).locator('h3.mp__title')).toBeFocused();
    });
  }

  test('the core chunk fails to load: ?manage and #gh= still leave the address', async ({ context, page }) => {
    await mockRelay(context);
    await context.route(/\/_astro\/account-admin\.[\w-]+\.js$/, (r) => r.abort());
    await page.goto(`${ACCOUNTS_ORIGIN}/game/player-log/?manage#gh=${FAKE_TICKET}`, { waitUntil: 'load' });
    await expect.poll(() => page.evaluate(() => location.href), { timeout: 3000 }).not.toMatch(/manage|#|gh=/);
    await expect(manage(page)).toHaveCount(0);
  });

  test('tiles stale by the visitor clock: owner mode still opens the dialog from "연동 관리"', async ({ context, page }) => {
    await mockRelay(context);
    await page.clock.install({ time: new Date('2030-01-01T00:00:00Z') });
    await page.goto(`${ACCOUNTS_ORIGIN}/game/player-log/?manage`, { waitUntil: 'load' });
    await expect(manage(page)).toBeVisible();
    await expect(page.locator('ul.acct-row button.acct-tile').first().locator('.acct-tile__state')).toHaveText(ui.ko['accounts.state.stale']);
    await manage(page).click();
    await expect(dialog(page)).toHaveAttribute('data-state', 'open', { timeout: 3000 });
  });

  for (const [width, height] of [[320, 640], [375, 667], [768, 1024], [1280, 800]] as const) {
    test(`management region at ${width}×${height}: before login and with a run's progress and results — no sideways scroll, every control 44×44, the last control reachable with the close button in view${width === 320 ? '' : ', axe 0'}`, async ({ context, page }) => {
      test.slow();
      const relay = await mockRelay(context);
      await watchViolations(page);
      await page.clock.install();
      await page.setViewportSize({ width, height });
      const check = async (state: string) => {
        expect(await noSideScroll(page), `${state}: sideways scroll`).toBe(true);
        const sizes = await controlSizes(page);
        expect(sizes.length, state).toBeGreaterThan(8);
        for (const s of sizes) {
          expect(s.w, `${state}: ${s.what}`).toBeGreaterThanOrEqual(44);
          expect(s.h, `${state}: ${s.what}`).toBeGreaterThanOrEqual(44);
        }
        // the last control of the management region scrolls into view inside the dialog; the sticky close stays in view
        const view = await page.evaluate(() => {
          const controls = [...document.querySelectorAll<HTMLElement>('dialog#acct-dlg section.mp :is(button, a[href], summary, input, [tabindex="0"])')].filter((el) => el.checkVisibility());
          const last = controls.at(-1) as HTMLElement;
          last.scrollIntoView({ block: 'nearest' });
          const box = (el: Element) => {
            const r = el.getBoundingClientRect();
            return { top: r.top, bottom: r.bottom };
          };
          return { last: box(last), close: box(document.querySelector('.acct-dlg__close') as Element), height: innerHeight };
        });
        for (const part of [view.last, view.close]) {
          expect(part.top, state).toBeGreaterThanOrEqual(0);
          expect(part.bottom, state).toBeLessThanOrEqual(view.height);
        }
        if (width !== 320) {
          const axe = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
          expect(axe.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`), `${state}: axe`).toEqual([]);
        }
      };

      await page.goto(`${ACCOUNTS_ORIGIN}/game/player-log/?manage`, { waitUntil: 'load' });
      await manage(page).click();
      await expect(dialog(page).getByRole('button', { name: A['label:login'] })).toBeFocused();
      await page.waitForTimeout(SETTLED_MS);
      await check('before login');

      await page.goto(`${ACCOUNTS_ORIGIN}/game/player-log/?manage#gh=${FAKE_TICKET}`, { waitUntil: 'load' });
      await expect(dialog(page).locator('.mp__perms')).toBeVisible();
      await dialog(page).getByRole('button', { name: A['label:rebuild'] }).click();
      await expect(dialog(page).locator('.mp-build__status')).toHaveText(A['stage.build']);
      await expect(dialog(page).locator('.mp-build__meta')).toBeVisible();
      await page.waitForTimeout(SETTLED_MS);
      await check('run in progress');

      relay.finish();
      await page.clock.fastForward(20_000);
      await expect(dialog(page).getByRole('button', { name: A['label:refresh'] })).toBeVisible();
      await check('run results');
      expect(await collectViolations(page)).toEqual([]);
    });
  }
});
