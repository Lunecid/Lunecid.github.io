import type { Page } from '@playwright/test';
import { test, expect, collectProblems } from './helpers';
import { STORAGE_KEYS } from '../../src/config';

/** Scrolls the whole page once so client:visible islands hydrate, then returns to the top. */
async function scrollThrough(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const step = Math.max(200, Math.floor(window.innerHeight * 0.8));
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    window.scrollTo(0, 0);
  });
}

// Pin the OS preference so a local Windows "animation effects off" setting cannot change the default-motion tests.
test.use({ reducedMotion: 'no-preference' });

test('without reduced motion the CRT intro plays once per session on the home page', async ({ page }) => {
  const html = page.locator('html');
  await page.goto('/', { waitUntil: 'load' });
  // The head script marks a played intro with data-intro-played (kept) and removes data-intro after 700 ms.
  await expect(html).toHaveAttribute('data-intro-played', '');
  await expect(html).not.toHaveAttribute('data-intro');
  await expect(html).toHaveAttribute('data-motion', 'full');
  expect(await page.evaluate((key) => sessionStorage.getItem(key), STORAGE_KEYS.intro)).toBe('1');
  await page.reload({ waitUntil: 'load' });
  await expect(html, 'no intro on the second load of the session').not.toHaveAttribute('data-intro-played');
  await expect(html).not.toHaveAttribute('data-intro');
});

test.describe('with the OS reduced-motion setting', () => {
  test.use({ reducedMotion: 'reduce' });

  test('reduced motion: no CRT and data-motion=reduce', async ({ page }) => {
    const html = page.locator('html');
    await page.goto('/', { waitUntil: 'load' });
    await expect(html).toHaveAttribute('data-motion', 'reduce');
    await expect(html, 'the intro never started').not.toHaveAttribute('data-intro-played');
    await expect(html).not.toHaveAttribute('data-intro');
    await expect(page.locator('.crt')).toBeHidden();
  });

  test('reduced motion: no .char-stage__streak animation', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    const names = await page
      .locator('.char-stage__streak')
      .evaluateAll((streaks) => streaks.map((s) => getComputedStyle(s).animationName));
    expect(names.filter((name) => name !== 'none'), 'animated streaks').toEqual([]);
  });
});

test('footer toggle stores sb:motion, flips data-motion; visible label is constant (fix round 2 item 1)', async ({
  page,
}) => {
  await page.goto('/records/', { waitUntil: 'networkidle' });
  const html = page.locator('html');
  const toggle = page.locator('[data-motion-toggle]');
  const chip = page.locator('[data-motion-chip]');
  const stored = () => page.evaluate((key) => localStorage.getItem(key), STORAGE_KEYS.motion);

  await expect(html).toHaveAttribute('data-motion', 'full');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  // WCAG 2.5.3: the accessible name is the visible text, and neither changes with state — only aria-pressed and
  // the aria-hidden chip do.
  await expect(toggle).toHaveAccessibleName('모션 줄이기');
  await expect(chip).toHaveText('OFF');
  // Fix round 3 item 1: no OS-forced description in the ordinary default state (aria-describedby is only ever
  // added when osPrefersReduce() is actually true — see sync() in SiteFooter.astro).
  await expect(toggle).toHaveAccessibleDescription('');

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(toggle).toHaveAccessibleName('모션 줄이기');
  await expect(chip).toHaveText('ON');
  // Fix round 3 item 1: still no description once the user (not the OS) turns it on — "기기 설정에서 모션을
  // 줄였습니다"/"Motion reduced by your device setting" would be false here.
  await expect(toggle).toHaveAccessibleDescription('');
  await expect(html).toHaveAttribute('data-motion', 'reduce');
  expect(await stored()).toBe('off');

  await page.reload({ waitUntil: 'networkidle' });
  await expect(html).toHaveAttribute('data-motion', 'reduce');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(chip).toHaveText('ON');

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(chip).toHaveText('OFF');
  await expect(html).toHaveAttribute('data-motion', 'full');
  expect(await stored()).toBe('on');
});

test.describe('P2-7 / fix round 2 item 1: the OS reduced-motion setting locks the footer toggle', () => {
  test.use({ reducedMotion: 'reduce' });

  test('the toggle is pressed+disabled; a visible note outside the button explains why', async ({ page }) => {
    await page.goto('/en/records/', { waitUntil: 'networkidle' });
    const toggle = page.locator('[data-motion-toggle]');
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(toggle).toBeDisabled();
    await expect(toggle).toHaveAccessibleName('Reduce motion');
    const note = page.locator('#motion-os-note');
    await expect(note).toBeVisible();
    await expect(note).toHaveText('Motion reduced by your device setting');
    await expect(toggle).toHaveAttribute('aria-describedby', 'motion-os-note');
    // Fix round 3 item 1: this is the one state the note is actually true for, so it is the one state where the
    // computed accessible description equals it.
    await expect(toggle).toHaveAccessibleDescription('Motion reduced by your device setting');
  });
});

// Fix round 2 item 1: fix round 1 gave the toggle a constant *aria-label* independent of its changing visible
// text, which fixed the aria-pressed/name mismatch but broke WCAG 2.5.3 the other way (the name never contained
// the visible label). Now the visible label itself is constant, doubles as the name, and carries no aria-label.
test.describe('P2-7 fix round 2: accessible name equals the (constant) visible label in every state', () => {
  test('ko: name/pressed/chip in every state', async ({ page }) => {
    await page.goto('/records/', { waitUntil: 'networkidle' });
    const toggle = page.locator('[data-motion-toggle]');
    await expect(toggle).toHaveAccessibleName('모션 줄이기');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await toggle.click();
    await expect(toggle).toHaveAccessibleName('모션 줄이기');
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  });

  test('en: name/pressed pairs in every state, including OS-reduced', async ({ page }) => {
    await page.goto('/en/records/', { waitUntil: 'networkidle' });
    const toggle = page.locator('[data-motion-toggle]');
    await expect(toggle).toHaveAccessibleName('Reduce motion');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await toggle.click();
    await expect(toggle).toHaveAccessibleName('Reduce motion');
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  });

  test.describe('OS reduced-motion', () => {
    test.use({ reducedMotion: 'reduce' });
    test('ko: name stays the (still constant) visible label, pressed=true, disabled', async ({ page }) => {
      await page.goto('/records/', { waitUntil: 'networkidle' });
      const toggle = page.locator('[data-motion-toggle]');
      await expect(toggle).toHaveAccessibleName('모션 줄이기');
      await expect(toggle).toHaveAttribute('aria-pressed', 'true');
      await expect(toggle).toBeDisabled();
    });
  });
});

test('pages work when localStorage throws (no page errors on /, /player-log/, /records/)', async ({ page }) => {
  await page.addInitScript(() => {
    const deny = (): never => {
      throw new DOMException('Storage is disabled', 'SecurityError');
    };
    for (const name of ['localStorage', 'sessionStorage']) {
      try {
        Object.defineProperty(window, name, { configurable: true, get: deny });
      } catch {
        // keep the native accessor; the prototype overrides below still throw
      }
    }
    for (const method of ['getItem', 'setItem', 'removeItem', 'clear', 'key'] as const) {
      Object.defineProperty(Storage.prototype, method, { configurable: true, value: deny });
    }
  });
  const problems = collectProblems(page);
  for (const route of ['/', '/player-log/', '/records/']) {
    const response = await page.goto(route, { waitUntil: 'networkidle' });
    expect(response?.status(), route).toBe(200);
    await expect(page.locator('h1')).toHaveCount(1);
    await scrollThrough(page);
    await page.waitForLoadState('networkidle');
    await page.locator('[data-motion-toggle]').click();
  }
  expect(
    await page.evaluate(() => {
      try {
        window.localStorage.getItem('probe');
        return 'readable';
      } catch {
        return 'throws';
      }
    }),
    'the init script really made storage throw',
  ).toBe('throws');
  expect(problems, problems.join('\n')).toEqual([]);
});
