import type { Page } from '@playwright/test';
import { test, expect } from './helpers';

/** Waits for the CRT intro (home only) to finish and for web fonts. */
async function settle(page: Page): Promise<void> {
  await page.waitForFunction(() => !document.documentElement.hasAttribute('data-intro'));
  await page.evaluate(() => document.fonts.ready.then(() => true));
}

test('MAIN MENU arrow keys move focus and Enter follows', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'keyboard check runs on desktop');
  await page.goto('/', { waitUntil: 'load' });
  await settle(page);
  const items = page.locator('#main-menu li.mm__item');
  const links = page.locator('#main-menu a.mm__link');
  await expect(links).toHaveCount(4);
  const hrefs = await links.evaluateAll((anchors) => anchors.map((a) => a.getAttribute('href') ?? ''));

  await links.nth(0).focus();
  await expect(items.nth(0)).toHaveAttribute('data-selected', '');
  await page.keyboard.press('ArrowDown');
  await expect(links.nth(1)).toBeFocused();
  await expect(items.nth(1)).toHaveAttribute('data-selected', '');
  await expect(items.nth(0)).not.toHaveAttribute('data-selected');
  await page.keyboard.press('ArrowUp');
  await expect(links.nth(0)).toBeFocused();
  await page.keyboard.press('End');
  await expect(links.nth(3)).toBeFocused();
  await page.keyboard.press('Home');
  await expect(links.nth(0)).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(links.nth(2)).toBeFocused();

  const target = new URL(hrefs[2], page.url()).href;
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(target);
});

test('certificate modal opens with Enter, traps Tab, closes with Esc and restores focus', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'keyboard check runs on desktop');
  await page.goto('/records/', { waitUntil: 'load' });
  await settle(page);
  // Before hydration the trigger is a plain link to the image (no-JS fallback); wait for the island.
  await expect(page.locator('astro-island:not([ssr]) dialog.cert-modal')).toHaveCount(1);
  const dialog = page.locator('dialog.cert-modal');
  const trigger = page.locator('#awards a[data-cert-id]').first();
  const focusInDialog = () =>
    page.evaluate(() => {
      const active = document.activeElement;
      return !!active && active !== document.body && active.closest('dialog.cert-modal') !== null;
    });

  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(dialog).toHaveAttribute('open', '');
  await expect.poll(focusInDialog).toBe(true);
  expect(await page.evaluate(() => document.activeElement?.tagName), 'focus starts on the close button').toBe('BUTTON');

  await page.keyboard.press('Tab');
  expect(await focusInDialog(), 'Tab stays inside the dialog').toBe(true);
  await page.keyboard.press('Shift+Tab');
  expect(await focusInDialog(), 'Shift+Tab stays inside the dialog').toBe(true);

  await page.keyboard.press('Escape');
  await expect(dialog).not.toHaveAttribute('open');
  await expect(trigger).toBeFocused();
  await expect(page).toHaveURL(/\/records\/$/);
});

test('showcase tabs move with arrows (only the unlocked games are listed, D-13)', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'keyboard check runs on desktop');
  await page.goto('/player-log/', { waitUntil: 'load' });
  await settle(page);
  const section = page.locator('#favorite-games');
  await section.scrollIntoViewIfNeeded();
  await expect(page.locator('astro-island:not([ssr]) [role="tablist"]')).toHaveCount(1);
  const tabs = section.getByRole('tab');
  // favorites.yaml has 5 games; the 3 locked ones stay out of the tabs until an account feed exists.
  await expect(tabs).toHaveCount(2);
  await expect(section.locator('[role="tab"][aria-disabled="true"]')).toHaveCount(0);

  await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'true');
  await tabs.nth(0).focus();
  await page.keyboard.press('ArrowDown');
  await expect(tabs.nth(1)).toBeFocused();
  await expect(tabs.nth(0), 'arrows move focus only (manual activation)').toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Enter');
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'false');

  await page.keyboard.press('Home');
  await expect(tabs.nth(0)).toBeFocused();
  await page.keyboard.press('End');
  await expect(tabs.nth(1)).toBeFocused();
});

test('mobile menu opens and closes with Esc (375px)', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-375', 'the menu button exists below 734px');
  await page.goto('/', { waitUntil: 'load' });
  await settle(page);
  const toggle = page.locator('button[aria-controls="hud-menu"]');
  const firstLink = page.locator('#hud-menu a').first();
  const html = page.locator('html');
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toHaveText('메뉴');
  await expect(firstLink).toBeHidden();
  await expect(html).not.toHaveClass(/is-scroll-locked/);

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  // P2-3 (controller ruling 2): the open state is visible in the button's own text, not only aria-expanded.
  await expect(toggle).toHaveText('닫기 ×');
  // Fix round 1 minor: the "×" is visual only — a screen reader must not announce it as part of the name.
  await expect(toggle).toHaveAccessibleName('닫기');
  await expect(firstLink).toBeVisible();
  await expect(html).toHaveClass(/is-scroll-locked/);

  await page.keyboard.press('Escape');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toHaveText('메뉴');
  await expect(firstLink).toBeHidden();
  await expect(toggle).toBeFocused();
  await expect(html, 'scroll is restored on close').not.toHaveClass(/is-scroll-locked/);
});

test('mobile menu: a scrim sits behind the panel and closes it on click (375px)', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-375', 'the menu button exists below 734px');
  await page.goto('/', { waitUntil: 'load' });
  await settle(page);
  const toggle = page.locator('button[aria-controls="hud-menu"]');
  const scrim = page.locator('[data-nav-scrim]');
  await expect(scrim).toBeHidden();

  await toggle.click();
  await expect(scrim).toBeVisible();
  const box = (await scrim.boundingBox())!;
  expect(box.height, 'the scrim reaches the bottom of the viewport').toBeGreaterThan(400);

  // Click near the scrim's bottom edge: the panel (opaque, painted above the scrim) covers its own top portion.
  await scrim.click({ position: { x: 5, y: box.height - 5 } });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(scrim).toBeHidden();
  await expect(toggle, 'focus returns to the toggle button, same as Escape').toBeFocused();
});

test('mobile menu: focus is trapped in [toggle, ...panel links] while open; Escape always closes (fix round 1 item 3)', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-375', 'the menu button exists below 734px');
  await page.goto('/', { waitUntil: 'load' });
  await settle(page);
  const toggle = page.locator('button[aria-controls="hud-menu"]');
  const panelLinks = page.locator('#hud-menu a');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const count = await panelLinks.count();
  expect(count, 'at least the 4 section links').toBeGreaterThanOrEqual(4);

  await toggle.focus();
  // Shift+Tab from the toggle (first in the trap) wraps to the last panel link, not out to the brand/BGM/CV.
  await page.keyboard.press('Shift+Tab');
  await expect(panelLinks.nth(count - 1)).toBeFocused();
  // Tab from the last panel link wraps forward to the toggle.
  await page.keyboard.press('Tab');
  await expect(toggle).toBeFocused();
  // Tab from the toggle re-enters the panel at its first link (a full closed loop).
  await page.keyboard.press('Tab');
  await expect(panelLinks.nth(0)).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(panelLinks.nth(1)).toBeFocused();

  // Escape closes regardless of where focus is inside the trap, and returns it to the toggle.
  await page.keyboard.press('Escape');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toBeFocused();
});

// Final review fix 1 item 2 (WCAG 2.2 2.4.11 Focus Not Obscured): moving backwards puts the previous stop above the
// viewport, and the browser used to scroll it to the very top edge, right under the 92%-opaque sticky nav. With the
// root scroll-padding it lands below the nav. Runs at 1280 (desktop) and 375 (mobile-375).
for (const route of ['/records/', '/en/records/', '/credits/']) {
  test(`Shift+Tab never leaves the focused element under the sticky nav (${route})`, async ({ page }, testInfo) => {
    test.skip(!['desktop', 'mobile-375'].includes(testInfo.project.name), 'desktop and phone only');
    test.setTimeout(90_000);
    await page.goto(route, { waitUntil: 'load' });
    await settle(page);
    // Start from the last tab stop of the page (the footer), then walk backwards up to the nav.
    await page.evaluate(() => {
      const stops = Array.from(document.querySelectorAll<HTMLElement>('a[href], button, summary, [tabindex="0"]')).filter(
        (el) => el.getClientRects().length > 0 && !el.closest('[inert], [hidden]'),
      );
      stops.at(-1)?.focus();
    });
    let checked = 0;
    for (let i = 0; i < 150; i += 1) {
      await page.keyboard.press('Shift+Tab');
      const stop = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        const nav = document.querySelector('.hud-nav');
        if (!el || el === document.body || !nav) return { kind: 'none' as const };
        if (nav.contains(el) || el.classList.contains('skip-link')) return { kind: 'nav' as const };
        const r = el.getBoundingClientRect();
        return {
          kind: 'stop' as const,
          top: r.top,
          height: r.height,
          navBottom: nav.getBoundingClientRect().bottom,
          label: `${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40)}"`,
        };
      });
      if (stop.kind === 'nav') break;
      if (stop.kind !== 'stop' || stop.height === 0) continue;
      expect(stop.top, `${route}: ${stop.label} sits below the nav`).toBeGreaterThanOrEqual(stop.navBottom - 1);
      checked += 1;
    }
    expect(checked, 'walked through the page').toBeGreaterThan(10);
  });
}

// Final review fix 1, round 2 item 1: the sticky nav is always in view, so focusing or using its controls must never
// scroll the page (a root scroll-padding made the browser "reveal" the nav's focused control by scrolling up).
test('focusing or using the nav controls never scrolls the page', async ({ page }, testInfo) => {
  test.skip(!['desktop', 'mobile-375'].includes(testInfo.project.name), 'desktop and phone only');
  await page.goto('/records/', { waitUntil: 'load' });
  await settle(page);
  // Wait for the BGM island (client:idle) so its button is the real, hydrated one.
  await page.waitForFunction(() => !document.querySelector('.hud-nav astro-island[ssr]'));
  await page.evaluate(() => window.scrollTo(0, 1200));
  const scrollY = () => page.evaluate(() => Math.round(window.scrollY));
  const start = await scrollY();
  expect(start).toBeGreaterThan(1000);

  // Every visible control in the bar takes focus without moving the page.
  const controls = page.locator('.hud-nav a, .hud-nav button').filter({ visible: true });
  const count = await controls.count();
  expect(count).toBeGreaterThanOrEqual(3);
  for (let i = 0; i < count; i += 1) {
    const label = await controls.nth(i).evaluate((el) => `${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().replace(/\s+/g, ' ')}"`);
    await controls.nth(i).focus();
    expect(await scrollY(), `focus ${label}`).toBe(start);
  }
  // The BGM button (when the track ships) toggles on and off by click without moving the page.
  const bgm = page.locator('.hud-nav button').filter({ hasText: /BGM/ }).filter({ visible: true });
  if ((await bgm.count()) > 0) {
    await bgm.first().click();
    expect(await scrollY(), 'BGM on').toBe(start);
    await bgm.first().click();
    expect(await scrollY(), 'BGM off').toBe(start);
  }
  // Phone: the menu toggle, Tab through the open panel, Escape.
  const toggle = page.locator('button[aria-controls="hud-menu"]');
  if (await toggle.isVisible()) {
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(await scrollY(), 'menu open').toBe(start);
    for (let i = 0; i < 6; i += 1) {
      await page.keyboard.press('Tab');
      expect(await scrollY(), `Tab ${i + 1} in the open menu`).toBe(start);
    }
    await page.keyboard.press('Escape');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(await scrollY(), 'menu closed with Escape').toBe(start);
  }
});

test('mobile menu: Escape closes even when focus has landed on <body> (fix round 2 item 2)', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-375', 'the menu button exists below 734px');
  await page.goto('/', { waitUntil: 'load' });
  await settle(page);
  const toggle = page.locator('button[aria-controls="hud-menu"]');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');

  // A keydown listener bound only on `nav` never sees an event whose target is <body> (body is not inside nav,
  // so the event never bubbles through it) — Escape used to silently do nothing here.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await expect(page.locator(':focus')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toBeFocused();
});
