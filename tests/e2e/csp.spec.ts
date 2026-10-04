// Content-Security-Policy in the browser (account-link C0, part 2): every built page, the 404 as served, the print
// pages, the legacy redirect stubs and the player log in ?manage mode load without a single `securitypolicyviolation`.
// This spec is the CSP check; no other spec bypasses the policy (tests/e2e/final-fix2.spec.ts sets its test-only
// overrides as inline styles, which `style-src-attr 'unsafe-inline'` allows).
import { PRINT_ROUTES } from '../../src/config';
import { adminCopy } from '../../src/i18n/accounts-admin';
import { FAKE_TICKET, builtRoutes, collectViolations, expect, legacyPaths, mockRelay, test, watchViolations } from './helpers';
import { ACCOUNTS_ORIGIN, ORIGIN } from './ports';

test.beforeEach(async ({ page }) => {
  await watchViolations(page);
});

// '/en/no-such-page/' is the 404 as served, with its EN_404_SCRIPT rewrite; '?manage' is the owner's management mode.
const ROUTES = [...builtRoutes(), '/404.html', '/en/no-such-page/', ...Object.values(PRINT_ROUTES), '/game/player-log/?manage'];

test('named pages exist in the list', () => {
  for (const r of ['/', '/game/player-log/', '/game/projects/school-zone-blindspots/', '/print/resume-ko/']) expect(ROUTES).toContain(r);
  expect(legacyPaths().length, 'legacy redirect stubs').toBeGreaterThan(0);
});

for (const route of ROUTES) {
  test(`no CSP violation on ${route}`, async ({ page }) => {
    await page.goto(route, { waitUntil: 'load' });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); // hydrate client:visible islands
    await page.waitForTimeout(400);
    expect(await collectViolations(page)).toEqual([]);
  });
}

// AL-16: the popup relay page runs its inline script and calls window.close(); a tab with one history entry would
// close, so it is opened after another page (the close is then refused) and checked with each message kind.
for (const path of ['/link-return/', '/link-return/?s=abc&openid.mode=id_res', '/link-return/#gh-error=denied']) {
  test(`no CSP violation on ${path}`, async ({ page }) => {
    await page.goto('/404.html');
    await page.goto(path, { waitUntil: 'load' });
    await page.waitForTimeout(300);
    expect(await collectViolations(page)).toEqual([]);
    await expect(page.locator('html')).toHaveAttribute('data-utility-page', '');
  });
}

for (const stub of legacyPaths()) {
  test(`the legacy stub ${stub} forwards under its CSP`, async ({ page }) => {
    const seen: string[] = [];
    page.on('console', (msg) => {
      if (/Content.Security.Policy/i.test(msg.text())) seen.push(msg.text());
    });
    await page.goto(stub);
    await expect(page).toHaveURL(/\/game\//);
    await page.waitForLoadState('load');
    expect(await collectViolations(page)).toEqual([]);
    expect(seen, 'CSP console reports while the stub ran').toEqual([]);
  });
}

test('PL-4: no CSP violation with the evidence viewer open on the Player Log', async ({ page }) => {
  await page.goto('/game/player-log/', { waitUntil: 'load' });
  const trigger = page.locator('#game-achievements [data-viewer="game-records"]').first();
  await trigger.scrollIntoViewIfNeeded();
  await trigger.click();
  await expect(page.locator('dialog.image-viewer[open]')).toHaveCount(1);
  await expect(page.locator('dialog.image-viewer .image-viewer__img')).toHaveAttribute('data-ready', 'true');
  expect(await collectViolations(page)).toEqual([]);
});

// Owner mode with the management chunk rendered (spec §8.2): on the real build (no relay: the relay-unset screen) and
// on the fixture build (the relay mocked: the panel's heading, signed in after the same-tab return).
for (const [build, origin] of [['dist', ORIGIN], ['fixture', ACCOUNTS_ORIGIN]] as const) {
  for (const query of ['?manage', `?manage#gh=${FAKE_TICKET}`]) {
    const shown = query === '?manage' ? query : '?manage#gh=<fake>';
    test(`no CSP violation in owner mode: ${build} /game/player-log/${shown}`, async ({ context, page }) => {
      if (origin === ACCOUNTS_ORIGIN) await mockRelay(context);
      await page.goto(`${origin}/game/player-log/${query}`, { waitUntil: 'load' });
      if (query === '?manage') await page.locator('button.acct-manage').click();
      const dialog = page.locator('dialog#acct-dlg');
      await expect(dialog).toHaveAttribute('data-state', 'open');
      if (origin === ACCOUNTS_ORIGIN) await expect(dialog.locator('h3.mp__title')).toBeVisible();
      else await expect(dialog.locator('.mp__unset')).toContainText(adminCopy.ko['relay-unset']);
      if (query !== '?manage' && origin === ACCOUNTS_ORIGIN) await expect(dialog.locator('.mp__perms')).toBeVisible();
      await page.waitForTimeout(400);
      expect(await collectViolations(page)).toEqual([]);
    });
  }
}

test('interactive paths: the image viewer on /game/records/, a showcase tab on /game/player-log/', async ({ page }) => {
  await page.goto('/game/records/');
  await page.locator('[data-viewer="certificates"]').first().click();
  await expect(page.locator('dialog.image-viewer[open]')).toHaveCount(1);
  expect(await collectViolations(page)).toEqual([]);
  await page.goto('/game/player-log/');
  await page.locator('#favorite-games').scrollIntoViewIfNeeded();
  await page.locator('#favorite-games [role="tab"]').nth(1).click();
  await page.waitForTimeout(400);
  expect(await collectViolations(page)).toEqual([]);
});
