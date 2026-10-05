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
  await page.goto('/game/', { waitUntil: 'load' });
  // The head script marks a played intro with data-intro-played (kept) and removes data-intro after 700 ms.
  await expect(html).toHaveAttribute('data-intro-played', '');
  await expect(html).not.toHaveAttribute('data-intro');
  await expect(html).toHaveAttribute('data-motion', 'full');
  expect(await page.evaluate((key) => sessionStorage.getItem(key), STORAGE_KEYS.intro)).toBe('1');
  await page.reload({ waitUntil: 'load' });
  await expect(html, 'no intro on the second load of the session').not.toHaveAttribute('data-intro-played');
  await expect(html).not.toHaveAttribute('data-intro');
});

/** t: ms since the key press; ct: currentTime of the running opacity transition on .crt (null when none). */
type CrtSample = { t: number; ct: number | null; intro: string | null; opacity: number; display: string };

test('F1: after a key press the CRT overlay is below 0.5 opacity within 100 ms and gone by 200 ms', async ({ page }) => {
  // Registered before the head script, so this window capture listener runs before its skip listener: the first
  // sample is the state at the press, and every later one is one animation frame of the skip fade.
  await page.addInitScript(() => {
    window.addEventListener(
      'keydown',
      () => {
        const w = window as Window & { __crtSamples?: CrtSample[] };
        const d = document.documentElement;
        const crt = document.querySelector('.crt') as HTMLElement;
        const t0 = performance.now();
        const read = (): CrtSample => {
          const cs = getComputedStyle(crt);
          const fade = crt.getAnimations().find((a) => a instanceof CSSTransition && a.transitionProperty === 'opacity');
          const ct = fade && fade.currentTime !== null ? Number(fade.currentTime) : null;
          return { t: performance.now() - t0, ct, intro: d.getAttribute('data-intro'), opacity: Number(cs.opacity), display: cs.display };
        };
        const s = [read()];
        const tick = (): void => {
          s.push(read());
          if (performance.now() - t0 < 260) requestAnimationFrame(tick);
          else w.__crtSamples = s;
        };
        requestAnimationFrame(tick);
      },
      { capture: true, once: true },
    );
  });
  // A loaded container sometimes presses only after the 400 ms release, or renders no frame at all during the
  // 150 ms skip; such an attempt measures the machine, not the fade, so it is retried in a fresh session (max 4).
  let samples: CrtSample[] = [];
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) await page.evaluate(() => sessionStorage.clear());
    await page.goto('/game/', { waitUntil: 'commit' });
    // Press once the overlay is on screen (after FCP, which also arms the 400 ms release).
    await page.waitForFunction(
      () =>
        document.documentElement.getAttribute('data-intro') === 'playing' &&
        performance.getEntriesByName('first-contentful-paint').length > 0,
      null,
      { polling: 'raf' },
    );
    await page.keyboard.press('Shift');
    const handle = await page.waitForFunction(() => (window as Window & { __crtSamples?: CrtSample[] }).__crtSamples, null, {
      polling: 'raf',
    });
    samples = (await handle.jsonValue()) as CrtSample[];
    if (samples[0].intro === 'playing' && samples.some((x) => x.ct !== null && x.ct > 0)) break;
  }
  const log = JSON.stringify(
    samples.map((x) => [Math.round(x.t), x.ct === null ? null : Math.round(x.ct), x.intro, x.display, x.opacity.toFixed(2)]),
  );
  expect(samples[0].intro, `the press came while the intro was playing ${log}`).toBe('playing');
  // "Within 100 ms" is read on the fade's own clock: a container's headless Chromium starts a transition only at its
  // next committed frame (often 60-100 ms after the style change here), which says nothing about the curve. The old
  // --dur-exit/--ease-in exit was still at about 0.9 at 100 ms; the skip fade is well below 0.5.
  expect(samples.some((x) => x.ct !== null && x.ct <= 100 && x.display !== 'none' && x.opacity < 0.5), log).toBe(true);
  const late = samples.filter((x) => x.t >= 200);
  expect(late.length, log).toBeGreaterThan(0);
  expect(late.every((x) => x.display === 'none'), log).toBe(true);
});

test('H1: the hero copy rises on the first game-home view of the session only', async ({ page }) => {
  // No CRT in this session, so the rise is not suppressed by data-intro-played.
  await page.addInitScript((key) => sessionStorage.setItem(key, '1'), STORAGE_KEYS.intro);
  // A fill-mode "both" animation stays in getAnimations() after it ends, so a finished rise still counts as played.
  const rises = () =>
    page.locator('.hero__copy > *').evaluateAll((els) => {
      const all = els.flatMap((el) => el.getAnimations()).filter((a) => (a as CSSAnimation).animationName === 'hero-rise');
      return { all: all.length, running: all.filter((a) => a.playState === 'running').length };
    });
  const html = page.locator('html');
  const lines = page.locator('.hero__copy > *');
  await page.goto('/game/', { waitUntil: 'domcontentloaded' });
  await expect(html).not.toHaveAttribute('data-hero-seen');
  expect((await rises()).all, 'first view: every copy line rises').toBe(await lines.count());
  // let the first rise end, so a back/forward-cache restore cannot show it still running
  await lines.evaluateAll((els) => Promise.all(els.flatMap((el) => el.getAnimations()).map((a) => a.finished)));

  await page.locator('.hud-nav a[href="/game/projects/"]').first().click();
  await expect(page).toHaveURL(/\/game\/projects\/$/);
  await page.goBack({ waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/game\/$/);
  expect((await rises()).running, 'back to the home: no rise').toBe(0);

  await page.locator('.hud-nav a[href="/game/projects/"]').first().click();
  await expect(page).toHaveURL(/\/game\/projects\/$/);
  await page.locator('.hud-nav__brand').click();
  await expect(page).toHaveURL(/\/game\/$/);
  await expect(html).toHaveAttribute('data-hero-seen', '');
  expect(await rises(), 'nav click to the home: no rise').toEqual({ all: 0, running: 0 });
});

test.describe('with the OS reduced-motion setting', () => {
  test.use({ reducedMotion: 'reduce' });

  test('reduced motion: no CRT and data-motion=reduce', async ({ page }) => {
    const html = page.locator('html');
    await page.goto('/game/', { waitUntil: 'load' });
    await expect(html).toHaveAttribute('data-motion', 'reduce');
    await expect(html, 'the intro never started').not.toHaveAttribute('data-intro-played');
    await expect(html).not.toHaveAttribute('data-intro');
    await expect(page.locator('.crt')).toBeHidden();
  });

  test('reduced motion: no .char-stage__streak animation', async ({ page }) => {
    await page.goto('/game/', { waitUntil: 'networkidle' });
    const names = await page
      .locator('.char-stage__streak')
      .evaluateAll((streaks) => streaks.map((s) => getComputedStyle(s).animationName));
    expect(names.filter((name) => name !== 'none'), 'animated streaks').toEqual([]);
  });
});

test('footer toggle stores sb:motion, flips data-motion; visible label is constant (fix round 2 item 1)', async ({
  page,
}) => {
  await page.goto('/game/records/', { waitUntil: 'networkidle' });
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
    await page.goto('/en/game/records/', { waitUntil: 'networkidle' });
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
    await page.goto('/game/records/', { waitUntil: 'networkidle' });
    const toggle = page.locator('[data-motion-toggle]');
    await expect(toggle).toHaveAccessibleName('모션 줄이기');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await toggle.click();
    await expect(toggle).toHaveAccessibleName('모션 줄이기');
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  });

  test('en: name/pressed pairs in every state, including OS-reduced', async ({ page }) => {
    await page.goto('/en/game/records/', { waitUntil: 'networkidle' });
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
      await page.goto('/game/records/', { waitUntil: 'networkidle' });
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
  for (const route of ['/game/', '/game/player-log/', '/game/records/']) {
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
