import type { Page } from '@playwright/test';
import { test, expect, settle } from './helpers';

// Batch 6 (interaction and accessibility polish): e2e coverage for rulings not already pinned by an existing spec
// (motion-storage.spec.ts covers P2-7, keyboard.spec.ts covers P2-3, i18n-parity.spec.ts covers P2-6,
// smoke.spec.ts covers P2-8's tag filter). This file covers P2-2 (toast), P2-9 (publication panels), P2-13
// (certificate pre-hydration queue), P2-15 (English 404), P2-24 (touch targets) and P2-25 (legal tables).

test.describe('P2-2: achievement toast', () => {
  test('dark HUD panel (not a cream pill), bottom-right on desktop, close button is 44x44', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/records/', { waitUntil: 'networkidle' });
    await settle(page);
    const trigger = page.locator('#awards a[data-cert-id]').first();
    const dialog = page.locator('dialog.image-viewer');
    await trigger.click();
    await expect(dialog).toHaveAttribute('open', '');
    await page.keyboard.press('Escape');
    await expect(dialog).not.toHaveAttribute('open');

    const toast = page.locator('.ach-toast');
    await expect(toast).toBeVisible();
    // Wait for entrance animation to finish (state, not wall clock) so close hit-target is stable under parallel load.
    await expect
      .poll(async () =>
        toast.evaluate((el) => {
          const anims = el.getAnimations?.() ?? [];
          if (anims.length === 0) return getComputedStyle(el).opacity === '1';
          return anims.every((a) => a.playState === 'finished');
        }),
      )
      .toBe(true);
    await expect(toast.locator('.ach-toast__kicker')).toHaveText('ACHIEVEMENT UNLOCKED');
    await expect(toast).toContainText('상장 확인');
    // The fill is drawn by the shared .cut/.cut--line mechanic's ::after layer, inset 1px inside the ::before
    // line layer (cut-corner panels never set their own background — see src/styles/hud.css), not the element's
    // own background-color.
    const bg = await toast.evaluate((el) => getComputedStyle(el, '::after').backgroundColor);
    // --hud-panel #15181F = rgb(21, 24, 31): a dark panel, not the old cream pill (#F3E3B5-ish).
    expect(bg).toBe('rgb(21, 24, 31)');
    const box = (await toast.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(box.x + box.width, 'sits toward the right edge').toBeGreaterThan(viewport.width - 420);
    expect(box.y + box.height, 'sits toward the bottom edge, clear of the H1').toBeGreaterThan(viewport.height - 200);

    const close = page.locator('.ach-toast__close');
    const closeBox = (await close.boundingBox())!;
    expect(closeBox.width, 'close button width >= 44px').toBeGreaterThanOrEqual(44);
    expect(closeBox.height, 'close button height >= 44px').toBeGreaterThanOrEqual(44);
  });

  test('never shows while the certificate <dialog> is open; appears only after it closes', async ({ page }) => {
    await page.goto('/records/', { waitUntil: 'networkidle' });
    await settle(page);
    const trigger = page.locator('#awards a[data-cert-id]').first();
    const dialog = page.locator('dialog.image-viewer');
    await trigger.click();
    await expect(dialog).toHaveAttribute('open', '');
    // The achievement toast (open-certificate -> "상장 확인") must not exist while the dialog is open.
    await expect(page.locator('.ach-toast')).toHaveCount(0);

    await page.keyboard.press('Escape');
    await expect(dialog).not.toHaveAttribute('open');
    await expect(page.locator('.ach-toast')).toBeVisible();
    await expect(page.locator('.ach-toast')).toContainText('상장 확인');
  });

  test('below 734px it sits at the bottom, and no animation plays under reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/records/', { waitUntil: 'networkidle' });
    await settle(page);
    await page.locator('#awards a[data-cert-id]').first().click();
    await page.keyboard.press('Escape');
    const toast = page.locator('.ach-toast');
    await expect(toast).toBeVisible();
    const box = (await toast.boundingBox())!;
    expect(box.y + box.height, 'reaches near the bottom of the 812px viewport').toBeGreaterThan(700);
    const animationName = await toast.evaluate((el) => getComputedStyle(el).animationName);
    expect(animationName, 'controller ruling 1: none under reduced motion').toBe('none');
  });
});

test.describe('P2-9: publication panels', () => {
  // Final review fix 1 item 4: the home research highlight uses the same link row (PaperLinks) as /research/.
  for (const { url, idBase } of [
    { url: '/research/', idBase: 'cog-2026-engagement' },
    { url: '/', idBase: 'rh' },
  ]) {
    test(`the button row stays one line; panels open below it, not inside it (${url})`, async ({ page }) => {
      await page.goto(url, { waitUntil: 'networkidle' });
      await settle(page);
      const links = page.locator(`.pub__links:has([aria-controls="${idBase}-abstract"])`);
      await links.scrollIntoViewIfNeeded();
      const abstractBtn = links.getByRole('button', { name: '초록' });
      const bibtexBtn = links.getByRole('button', { name: 'BibTeX' });
      const chipTops = () => links.locator('> *').evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top + window.scrollY)));
      const rowBoxBefore = (await links.boundingBox())!;
      const topsBefore = await chipTops();
      // /research/ has room for one line at 1280; the home card's narrower text column wraps the same five chips onto
      // two lines (as its old chip row did). Either way the row must not change when a panel opens (checked below).
      if (url === '/research/') expect(rowBoxBefore.height, 'one row of buttons').toBeLessThan(60);

      await expect(abstractBtn).toHaveAttribute('aria-expanded', 'false');
      await abstractBtn.click();
      await expect(abstractBtn).toHaveAttribute('aria-expanded', 'true');
      const rowBoxAfter = (await links.boundingBox())!;
      expect(rowBoxAfter.height, 'the row itself does not grow when a panel opens').toBeLessThanOrEqual(rowBoxBefore.height + 2);
      expect(await chipTops(), 'no chip moves when the abstract opens').toEqual(topsBefore);

      const abstractPanel = page.locator(`#${idBase}-abstract`);
      await expect(abstractPanel).toBeVisible();
      const panelBox = (await abstractPanel.boundingBox())!;
      expect(panelBox.y, 'panel renders below the button row').toBeGreaterThanOrEqual(rowBoxAfter.y + rowBoxAfter.height - 2);

      await bibtexBtn.click();
      await expect(bibtexBtn).toHaveAttribute('aria-expanded', 'true');
      expect(await chipTops(), 'no chip moves when BibTeX opens too').toEqual(topsBefore);
      const bibtexPanel = page.locator(`#${idBase}-bibtex`);
      await expect(bibtexPanel).toBeVisible();
      // BibTeX wraps instead of scrolling sideways (pre-wrap + overflow-wrap: anywhere on .bib__code).
      const style = await bibtexPanel.locator('.bib__code').evaluate((el) => getComputedStyle(el).whiteSpace);
      expect(style).toBe('pre-wrap');
    });
  }

  for (const url of ['/research/#in-progress', '/records/#publications']) {
    test(`no layout shift > 0.01 on ${url} at 375px even with the disclosure-trigger chunk delayed (fix round 2 item 5)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      // PaperLinks.astro's own <script> (which imports disclosure-trigger.ts; PublicationItem renders PaperLinks since
      // final review fix 1 item 4) compiles to a dedicated,
      // per-component chunk (PaperLinks.astro_astro_type_script_index_0_lang.*.js) — delay only that one, a
      // stand-in for a slow network, so it is still in flight well after first paint. If the panels' collapsed
      // state depended on that script running (the pre-fix-round-2 behaviour: SSR open, JS collapses), this
      // would show up as a large layout shift once it finally arrives; the CSS gate must make that impossible.
      await page.route('**/PaperLinks*.js', async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        await route.continue();
      });
      await page.addInitScript(() => {
        (window as unknown as { __cls: number[] }).__cls = [];
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            const shift = entry as PerformanceEntry & { value: number; hadRecentInput: boolean };
            if (!shift.hadRecentInput) (window as unknown as { __cls: number[] }).__cls.push(shift.value);
          }
        }).observe({ type: 'layout-shift', buffered: true });
      });
      await page.goto(url, { waitUntil: 'load' });
      // Long enough for the deliberately delayed chunk to arrive, execute, and (pre-fix-round-2) have caused its
      // shift, with margin.
      await page.waitForTimeout(1500);
      const cls = await page.evaluate(() => (window as unknown as { __cls: number[] }).__cls.reduce((a, b) => a + b, 0));
      expect(cls, `${url} cumulative layout shift`).toBeLessThanOrEqual(0.01);
    });
  }

  test('the BibTeX panel copy button works (reused BibtexBlock, not a duplicate)', async ({ page, context, baseURL }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: baseURL });
    await page.goto('/research/', { waitUntil: 'networkidle' });
    await settle(page);
    await page.getByRole('button', { name: 'BibTeX' }).first().click();
    const button = page.locator('#cog-2026-engagement-bibtex [data-bib-copy]');
    await expect(button).toBeVisible();
    await button.click();
    await expect(button).toHaveAttribute('data-state', 'done');
    await expect(page.locator('#cog-2026-engagement-bibtex [data-bib-status]')).toHaveText('BibTeX를 클립보드에 복사했습니다.');
  });
});

test.describe('P2-13: certificate modal before hydration', () => {
  test('a click on [data-viewer] before the island hydrates opens the modal instead of navigating away', async ({ page }) => {
    // Delay every JS module response so the click below lands well before ImageViewer's React effect runs,
    // while the head's inline queue script (src/lib/viewer-queue.ts) has already registered its capture listener.
    await page.route('**/*.js', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 400));
      await route.continue();
    });
    await page.goto('/records/', { waitUntil: 'domcontentloaded' });
    const trigger = page.locator('#awards a[data-cert-id]').first();
    await trigger.waitFor({ state: 'attached' });
    await trigger.click();
    // Still on /records/ (no navigation to the bare certificate image) once hydration completes.
    await expect(page.locator('dialog.image-viewer')).toHaveAttribute('open', '', { timeout: 5000 });
    await expect(page).toHaveURL(/\/records\/(#view-[^#]+)?$/);
    await expect(page.getByRole('button', { name: '닫기' })).toBeFocused();
  });
});

test.describe('P2-15: the English 404', () => {
  async function settled404(page: Page): Promise<void> {
    await page.waitForFunction(() => document.documentElement.lang === 'en');
  }

  test('lang, title, nav labels/hrefs, CV link, button order and the KO/EN switch all flip to English (1440px)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const res = await page.goto('/en/no-such-page/');
    expect(res?.status()).toBe(404);
    await settled404(page);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page).toHaveTitle('GAME OVER · Seongeun Baek');
    await expect(page.locator('.skip-link')).toHaveText('Skip to content');
    await expect(page.locator('#hud-menu')).toHaveAttribute('aria-label', 'Main navigation');
    await expect(page.locator('.hud-nav__brand')).toHaveAttribute('href', '/en/');

    // .hud-nav__list, not #hud-menu a generally: the panel also carries the KO/EN switch link (below), which is
    // a 5th <a> inside #hud-menu.
    const navLinks = page.locator('#hud-menu .hud-nav__list a');
    await expect(navLinks).toHaveCount(4);
    await expect(navLinks.nth(0)).toHaveText('01 Research');
    await expect(navLinks.nth(0)).toHaveAttribute('href', '/en/research/');
    await expect(navLinks.nth(3)).toHaveText('04 Player Log');
    await expect(navLinks.nth(3)).toHaveAttribute('href', '/en/player-log/');

    const cv = page.locator('.hud-nav__cv');
    await expect(cv).toHaveAttribute('href', '/cv/seongeun-baek-resume-en.pdf');
    await expect(cv).toHaveAttribute('download', '');

    // Button order: the big CTAs are now the English ones; the small secondary line is the Korean fallback.
    const primary = page.locator('[data-go-actions] a');
    await expect(primary.nth(0)).toHaveText('Back to start');
    await expect(primary.nth(0)).toHaveAttribute('href', '/en/');
    await expect(primary.nth(1)).toHaveText('See projects');
    await expect(primary.nth(1)).toHaveAttribute('href', '/en/projects/');
    const secondary = page.locator('[data-go-secondary] a');
    await expect(secondary.nth(0)).toHaveText('처음으로');
    await expect(secondary.nth(0)).toHaveAttribute('href', '/');
    await expect(secondary.nth(1)).toHaveText('프로젝트 보기');
    await expect(secondary.nth(1)).toHaveAttribute('href', '/projects/');

    await expect(page.locator('.go__plain:not(.go__plain--en)')).toHaveText('Page not found.');
    await expect(page.locator('.go__plain--en')).toHaveText('페이지를 찾을 수 없습니다.');

    // Footer: nav aria-label, links, copyright and last-updated, motion toggle.
    await expect(page.locator('.site-footer__nav')).toHaveAttribute('aria-label', 'Site information');
    const footerLinks = page.locator('.site-footer__links a');
    await expect(footerLinks.nth(0)).toHaveText('Visitor stats');
    await expect(footerLinks.nth(0)).toHaveAttribute('href', '/en/stats/');
    await expect(footerLinks.nth(1)).toHaveText('Privacy');
    await expect(footerLinks.nth(1)).toHaveAttribute('href', '/en/privacy/');
    await expect(footerLinks.nth(2)).toHaveText('Credits');
    await expect(footerLinks.nth(2)).toHaveAttribute('href', '/en/credits/');
    await expect(page.locator('.site-footer__copy')).toHaveText(/^© \d{4} Seongeun Baek$/);
    await expect(page.locator('.site-footer__updated')).toHaveText(/^Last updated [A-Z][a-z]{2} \d{1,2}, \d{4}$/);
    const motion = page.locator('[data-motion-toggle]');
    // Fix round 2 item 1: the visible label is constant text ("Reduce motion") plus an aria-hidden ON/OFF chip;
    // the accessible name is that same label (no separate aria-label).
    await expect(motion).toContainText('Reduce motion');
    await expect(motion).toHaveAccessibleName('Reduce motion');

    // The KO/EN switch (absent from the default Korean render of this same 404.html): the bar variant at this width.
    const bar = page.locator('.nf-lang-switch--bar');
    await expect(bar).toBeVisible();
    // Fix round 2 item 3: visible "KO" plus a sr-only expansion, matching the regular nav's own bar switch —
    // "KO" alone was not a real accessible name.
    await expect(bar).toContainText('KO');
    await expect(bar).toHaveAccessibleName('KO 한국어');
    await expect(bar).toHaveAttribute('href', '/');
    await expect(bar).toHaveAttribute('hreflang', 'ko');
    await expect(page.locator('.nf-lang-switch--panel')).toBeHidden();
  });

  test('320px: the KO/EN switch is the hidden-panel variant, not the bar (no wrap, scrim does not cover Close/CV)', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    const res = await page.goto('/en/no-such-page/');
    expect(res?.status()).toBe(404);
    await settled404(page);
    await expect(page.locator('.nf-lang-switch--bar')).toBeHidden();

    const bar = page.locator('.hud-nav__bar');
    const barBox = (await bar.boundingBox())!;
    // A single-line bar (no wrap): the toggle button's box stays within the bar's own height.
    const toggle = page.locator('[data-nav-toggle]');
    await expect(toggle).toHaveText('Menu');
    const toggleBox = (await toggle.boundingBox())!;
    expect(toggleBox.y + toggleBox.height, 'toggle stays on the bar\'s single line').toBeLessThanOrEqual(barBox.y + barBox.height + 1);
    const cv = page.locator('.hud-nav__cv');
    const cvBoxBefore = (await cv.boundingBox())!;
    expect(cvBoxBefore.y + cvBoxBefore.height, 'CV stays on the bar\'s single line').toBeLessThanOrEqual(barBox.y + barBox.height + 1);

    await toggle.click();
    // G-017 / N01: open label is "×" + visually hidden Close (stable toggle width).
    await expect(toggle.locator('[aria-hidden="true"]')).toHaveText('×');
    await expect(toggle).toHaveAccessibleName('Close');
    // The panel variant is now visible inside the opened menu.
    const panelSwitch = page.locator('.nf-lang-switch--panel a');
    await expect(panelSwitch).toBeVisible();
    await expect(panelSwitch).toHaveText('한국어');

    // The scrim (fixed below the single-line bar) never covers the still-visible Close button or CV link.
    const scrim = page.locator('[data-nav-scrim]');
    const scrimBox = (await scrim.boundingBox())!;
    const toggleBoxOpen = (await toggle.boundingBox())!;
    const cvBoxOpen = (await cv.boundingBox())!;
    expect(scrimBox.y, 'scrim starts below the Close button').toBeGreaterThanOrEqual(toggleBoxOpen.y + toggleBoxOpen.height - 1);
    expect(scrimBox.y, 'scrim starts below the CV link').toBeGreaterThanOrEqual(cvBoxOpen.y + cvBoxOpen.height - 1);
  });

  test('the achievement toast (hidden "game-over") shows in English too, not just its region/close labels', async ({ page }) => {
    await page.goto('/en/no-such-page/');
    await settled404(page);
    const toast = page.locator('.ach-toast');
    await expect(toast).toBeVisible();
    await expect(toast.locator('.ach-toast__kicker')).toHaveText('ACHIEVEMENT UNLOCKED');
    await expect(toast).toContainText('Reached a page that does not exist.');
    await expect(toast).not.toContainText('없는 페이지에 도착했습니다');
    await expect(page.locator('.ach-toast-region')).toHaveAttribute('aria-label', 'Achievement notifications');
    await expect(page.locator('.ach-toast__close')).toHaveAttribute('aria-label', 'Dismiss');
  });

  // Fix round 4 item 1: EN_404_SCRIPT sets the footer motion note's text, and SiteFooter.astro's runtime sync()
  // points the toggle's aria-describedby at that note while (and only while) the OS forces reduced motion — so
  // the note is the toggle's accessible description on /en/<missing>/ in that state. It must be the same English
  // string every other /en/ footer renders (ui.ts action.motionOsOff), not the stale "Off by device setting".
  test.describe('fix round 4 item 1: the footer motion note', () => {
    test.describe('with the OS reduced-motion setting', () => {
      test.use({ reducedMotion: 'reduce' });

      test('the toggle is described by the English note from ui.ts', async ({ page }) => {
        const res = await page.goto('/en/zzz-missing/', { waitUntil: 'networkidle' });
        expect(res?.status()).toBe(404);
        await settled404(page);
        const toggle = page.locator('[data-motion-toggle]');
        await expect(toggle, "the footer's sync() ran and saw the OS preference").toBeDisabled();
        await expect(toggle).toHaveAttribute('aria-describedby', 'motion-os-note');
        const note = page.locator('#motion-os-note');
        await expect(note).toBeVisible();
        await expect(note).toHaveText('Motion reduced by your device setting');
        await expect(toggle).toHaveAccessibleDescription('Motion reduced by your device setting');
      });
    });

    test.describe('with no OS preference', () => {
      test.use({ reducedMotion: 'no-preference' });

      test('no accessible description, the note stays hidden', async ({ page }) => {
        const res = await page.goto('/en/zzz-missing/', { waitUntil: 'networkidle' });
        expect(res?.status()).toBe(404);
        await settled404(page);
        const toggle = page.locator('[data-motion-toggle]');
        await expect(toggle).toBeEnabled();
        await expect(toggle).not.toHaveAttribute('aria-describedby');
        await expect(page.locator('#motion-os-note')).toBeHidden();
        await expect(toggle).toHaveAccessibleDescription('');
      });
    });
  });

  test('a Korean-path 404 is unaffected (no switch, Korean nav)', async ({ page }) => {
    const res = await page.goto('/no-such-page-at-all/');
    expect(res?.status()).toBe(404);
    await expect(page.locator('html')).toHaveAttribute('lang', 'ko');
    await expect(page).toHaveTitle('GAME OVER · 백성은');
    await expect(page.locator('#hud-menu a').first()).toHaveText('01 연구');
    await expect(page.locator('.nf-lang-switch')).toHaveCount(0);
  });
});

test.describe('P2-24: touch targets and caption sizes', () => {
  test('the [SB] brand link and the tablet language link are >= 44x44', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/records/', { waitUntil: 'networkidle' });
    await settle(page);
    const brand = page.locator('.hud-nav__brand');
    const brandBox = (await brand.boundingBox())!;
    expect(brandBox.width, 'brand link width').toBeGreaterThanOrEqual(44);
    expect(brandBox.height, 'brand link height').toBeGreaterThanOrEqual(44);

    const langLink = page.locator('.hud-nav__lang--bar a[hreflang]');
    const langBox = (await langLink.boundingBox())!;
    expect(langBox.width, 'tablet language link width').toBeGreaterThanOrEqual(44);
    expect(langBox.height, 'tablet language link height').toBeGreaterThanOrEqual(44);
  });

  test('the education lab link and a job-fit evidence link are >= 44px tall', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/records/', { waitUntil: 'networkidle' });
    await settle(page);
    const labLink = page.locator('.timeline__lab a').first();
    if (await labLink.count()) {
      const box = (await labLink.boundingBox())!;
      expect(box.height, 'education lab link height').toBeGreaterThanOrEqual(44);
    }
    const evLink = page.locator('.jobfit__ev').first();
    const evBox = (await evLink.boundingBox())!;
    expect(evBox.height, 'job-fit evidence link height').toBeGreaterThanOrEqual(44);
  });

  test('job-fit evidence links are real, non-overlapping 44px targets (fix round 1, item 2)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/records/', { waitUntil: 'networkidle' });
    await settle(page);
    // python-ml is the first row with 4 stacked evidence links (padding+negative-margin previously made their
    // hit boxes taller than the row's own flow spacing, so they overlapped and a tap could land on a neighbour).
    const links = page.locator('#job-fit [data-row="python-ml"] .jobfit__ev');
    const count = await links.count();
    expect(count).toBeGreaterThanOrEqual(2);
    // boundingBox()/elementFromPoint() are both viewport-relative at the *current* scroll position; #job-fit sits
    // far down this page, so without scrolling first, the reported y (thousands of px) falls outside the visible
    // viewport and elementFromPoint() returns null for every point. Bring the row to the middle of the viewport
    // before measuring.
    await links.first().evaluate((el) => el.closest('[data-row]')?.scrollIntoView({ block: 'center' }));
    const boxes: { x: number; y: number; width: number; height: number }[] = [];
    for (let i = 0; i < count; i++) {
      const box = (await links.nth(i).boundingBox())!;
      expect(box.height, `link ${i} height`).toBeGreaterThanOrEqual(44);
      boxes.push(box);
    }
    // No two links' boxes overlap (final fix 2 item 7: the short links now flow in rows, so they are checked as
    // rectangles rather than as a vertical stack).
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const [a, b] = [boxes[i]!, boxes[j]!];
        const apart = a.x + a.width <= b.x + 0.5 || b.x + b.width <= a.x + 0.5 || a.y + a.height <= b.y + 0.5 || b.y + b.height <= a.y + 0.5;
        expect(apart, `links ${i} and ${j} do not overlap`).toBe(true);
      }
    }
    // elementFromPoint at the top, middle and bottom of each link's box resolves back to that same link.
    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i]!;
      const x = box.x + box.width / 2;
      for (const y of [box.y + 2, box.y + box.height / 2, box.y + box.height - 2]) {
        const isSelf = await links.nth(i).evaluate(
          (el, [px, py]) => el.contains(document.elementFromPoint(px, py)),
          [x, y] as [number, number],
        );
        expect(isSelf, `point (${x}, ${y}) on link ${i} hits that link`).toBe(true);
      }
    }
  });

  test('project cartridge tags read as plain text, not filter buttons', async ({ page }) => {
    await page.goto('/projects/', { waitUntil: 'networkidle' });
    await settle(page);
    const tag = page.locator('.cart__tags li').first();
    await expect(tag).toBeVisible();
    const style = await tag.evaluate((el) => getComputedStyle(el).borderStyle);
    expect(style, 'no border box, unlike .tag-filter__btn').toBe('none');
    const fontSize = await tag.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(fontSize, 'P2-24: >= 13px').toBeGreaterThanOrEqual(13);

    // fix round 1 minor: the "·" separator is a real aria-hidden span, not CSS ::after content that some
    // browser/AT pairs announce.
    // fix round 2 item 9: the separator trails its own tag (every item but the last) rather than leading the
    // next one — this list wraps, and a leading separator could start a wrapped line with a stray "·".
    const tags = page.locator('.cart__tags li');
    const count = await tags.count();
    if (count > 1) {
      const firstTag = tags.nth(0);
      const sep = firstTag.locator('.cart__tag-sep');
      await expect(sep).toHaveAttribute('aria-hidden', 'true');
      await expect(sep).toHaveText('·');
      const afterContent = await firstTag.evaluate((el) => getComputedStyle(el, '::after').content);
      expect(afterContent, 'no CSS-generated separator left behind').toMatch(/^(none|normal|"")$/);
      // The last tag has no trailing separator.
      await expect(tags.nth(count - 1).locator('.cart__tag-sep')).toHaveCount(0);
    }
  });
});

test.describe('P2-25: legal-page tables stack below 734px', () => {
  test('/credits/ table: platform, then notice, then status, one column wide', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await page.goto('/credits/', { waitUntil: 'networkidle' });
    const table = page.locator('table').first();
    await expect(table).toBeVisible();
    const display = await table.evaluate((el) => getComputedStyle(el).display);
    expect(display).toBe('block');
    const firstRow = table.locator('tbody tr').first();
    const cells = firstRow.locator('td');
    await expect(cells).toHaveCount(3);
    const boxes = await cells.evaluateAll((els) => els.map((el) => el.getBoundingClientRect()));
    // Stacked top-to-bottom in DOM order: platform title, then notice, then status.
    expect(boxes[1]!.top).toBeGreaterThanOrEqual(boxes[0]!.bottom - 1);
    expect(boxes[2]!.top).toBeGreaterThanOrEqual(boxes[1]!.bottom - 1);
    // No sideways scroller (Review Focus 1).
    const scrollWidth = await table.evaluate((el) => el.scrollWidth);
    const clientWidth = await table.evaluate((el) => el.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });

  test('fix round 1 minor: explicit ARIA table roles survive the display:block stacking', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await page.goto('/credits/', { waitUntil: 'networkidle' });
    const table = page.locator('table').first();
    await expect(table).toHaveAttribute('role', 'table');
    await expect(table.locator('thead')).toHaveAttribute('role', 'rowgroup');
    await expect(table.locator('tbody')).toHaveAttribute('role', 'rowgroup');
    await expect(table.locator('tr').first()).toHaveAttribute('role', 'row');
    await expect(table.locator('thead th').first()).toHaveAttribute('role', 'columnheader');
    await expect(table.locator('tbody td').first()).toHaveAttribute('role', 'cell');
  });

  test('fix round 1 minor: a Korean status tag drops mono/letter-spacing (P1-10), the English page keeps it', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await page.goto('/credits/', { waitUntil: 'networkidle' });
    const koStatus = page.locator('table').first().locator('tbody tr').first().locator('td').last();
    await expect(koStatus).toHaveText('연동 시 표시');
    const koStyle = await koStatus.evaluate((el) => ({ family: getComputedStyle(el).fontFamily.toLowerCase(), spacing: getComputedStyle(el).letterSpacing }));
    expect(koStyle.family).not.toContain('jetbrains');
    expect(['0px', 'normal']).toContain(koStyle.spacing);

    await page.goto('/en/credits/', { waitUntil: 'networkidle' });
    const enStatus = page.locator('table').first().locator('tbody tr').first().locator('td').last();
    await expect(enStatus).toHaveText('Shown when linked');
    const enStyle = await enStatus.evaluate((el) => getComputedStyle(el).fontFamily.toLowerCase());
    expect(enStyle).toContain('jetbrains');
  });
});

// N20 / F-027: BGM remembers position across same-origin navigations and keeps a stable waiting chip.
test.describe('N20: BGM resume and waiting state', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const audios: HTMLAudioElement[] = [];
      (window as unknown as { __sbBgmAudios: HTMLAudioElement[] }).__sbBgmAudios = audios;
      const OrigAudio = window.Audio;
      window.Audio = class extends OrigAudio {
        constructor(src?: string) {
          super(src);
          audios.push(this);
        }
      } as typeof Audio;
      HTMLMediaElement.prototype.play = async function play() {
        Object.defineProperty(this, 'paused', { configurable: true, get: () => false });
        return undefined;
      };
    });
  });

  test('button width is equal across off, on and waiting at 375', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/', { waitUntil: 'networkidle' });
    await settle(page);
    const button = page.locator('button.bgm');
    await expect(button).toBeVisible();
    const offWidth = (await button.boundingBox())!.width;

    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect(button).not.toHaveAttribute('data-state', 'waiting');
    const onWidth = (await button.boundingBox())!.width;

    await page.evaluate(() => {
      localStorage.setItem('sb:sound', 'on');
      sessionStorage.setItem('sb:bgm-t', JSON.stringify({ t: 20, at: Date.now() }));
    });
    await page.addInitScript(() => {
      HTMLMediaElement.prototype.play = async function play() {
        throw new DOMException('NotAllowedError');
      };
    });
    await page.reload({ waitUntil: 'networkidle' });
    await settle(page);
    const waiting = page.locator('button.bgm');
    await expect(waiting).toHaveAttribute('data-state', 'waiting');
    await expect(waiting).toHaveAttribute('aria-pressed', 'true');
    const waitingWidth = (await waiting.boundingBox())!.width;
    expect(Math.abs(onWidth - offWidth), 'on vs off').toBeLessThanOrEqual(1);
    expect(Math.abs(waitingWidth - onWidth), 'waiting vs on').toBeLessThanOrEqual(1);
  });

  test('after navigation, playback resumes within ±2s of the saved time', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/', { waitUntil: 'networkidle' });
    await settle(page);
    const button = page.locator('button.bgm');
    await expect(button).toBeVisible();
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');

    const savedAt = 47;
    await page.waitForFunction(() => (window as unknown as { __sbBgmAudios: HTMLAudioElement[] }).__sbBgmAudios?.length > 0);
    await page.evaluate((t) => {
      const audio = (window as unknown as { __sbBgmAudios: HTMLAudioElement[] }).__sbBgmAudios[0]!;
      audio.currentTime = t;
      sessionStorage.setItem('sb:bgm-t', JSON.stringify({ t, at: Date.now() }));
    }, savedAt);

    await page.locator('.hud-nav__list a[href="/records/"]').click();
    await page.waitForURL('**/records/');
    await settle(page);

    const nextButton = page.locator('button.bgm');
    await expect(nextButton).toHaveAttribute('aria-pressed', 'true');
    await page.waitForFunction(() => (window as unknown as { __sbBgmAudios: HTMLAudioElement[] }).__sbBgmAudios?.length > 0);
    // Autoplay may be blocked → waiting; a non-link gesture resumes from the saved position.
    const state = await nextButton.getAttribute('data-state');
    if (state === 'waiting') {
      await page.locator('main').click({ position: { x: 20, y: 20 } });
    }
    await expect.poll(async () =>
      page.evaluate(() => (window as unknown as { __sbBgmAudios: HTMLAudioElement[] }).__sbBgmAudios.at(-1)?.currentTime ?? -1),
    ).toBeGreaterThan(0);
    const time = await page.evaluate(
      () => (window as unknown as { __sbBgmAudios: HTMLAudioElement[] }).__sbBgmAudios.at(-1)?.currentTime ?? 0,
    );
    expect(Math.abs(time - savedAt), `resumed at ${time}, expected ~${savedAt}`).toBeLessThanOrEqual(2);
    expect(time, 'must not restart at 0').toBeGreaterThan(2);
  });
});

test.describe('N08: cartridge hover lifts the body, not the hit box', () => {
  for (const route of ['/projects/', '/'] as const) {
    test(`${route}: pointer near the bottom keeps :hover; .cart top stays put`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(route, { waitUntil: 'networkidle' });
      await settle(page);
      const cart = page.locator('.cart:not(.cart--static)').first();
      await expect(cart).toBeVisible();
      await cart.scrollIntoViewIfNeeded();

      const box = (await cart.boundingBox())!;
      const restTop = box.y;
      const x = box.x + box.width / 2;

      for (const above of [4, 6, 10] as const) {
        const y = box.y + box.height - above;
        for (let i = 0; i < 20; i += 1) {
          await page.mouse.move(box.x + 10 + i, y);
          const state = await cart.evaluate((el) => ({
            hovered: el.matches(':hover'),
            top: el.getBoundingClientRect().top,
          }));
          expect(state.hovered, `sample ${i} at ${above}px above bottom`).toBe(true);
          expect(state.top, `.cart top must not bounce`).toBeCloseTo(restTop, 0);
        }
      }

      // Well above the bottom: body still lifts -16px.
      await page.mouse.move(x, box.y + box.height - 20);
      const lift = await cart.evaluate((el) => {
        const body = el.querySelector('.cart__body') as HTMLElement;
        return getComputedStyle(body).transform;
      });
      expect(lift, 'body lifts -16px').toMatch(/matrix\(|translate/i);
      const ty = await cart.evaluate((el) => {
        const body = el.querySelector('.cart__body') as HTMLElement;
        const t = getComputedStyle(body).transform;
        if (t === 'none') return 0;
        const m = new DOMMatrixReadOnly(t);
        return m.m42;
      });
      expect(ty).toBeCloseTo(-16, 0);
    });
  }

  test('no-JS + OS reduced motion: hover transform is none', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/projects/', { waitUntil: 'networkidle' });
    const cart = page.locator('.cart:not(.cart--static)').first();
    await expect(cart).toBeVisible();
    await cart.scrollIntoViewIfNeeded();
    const box = (await cart.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    const transform = await cart.evaluate((el) => {
      const body = el.querySelector('.cart__body') as HTMLElement | null;
      return body ? getComputedStyle(body).transform : 'missing';
    });
    expect(transform).toBe('none');
    await context.close();
  });
});

test.describe('N13: sticky hover cleared on touch; press fill holds', () => {
  test('tag filter: tap on then off restores idle border on touch', async ({ browser }) => {
    // Chromium only sets (hover: none) when isMobile is true; also tap away so sticky :hover cannot linger.
    const context = await browser.newContext({
      viewport: { width: 375, height: 812 },
      hasTouch: true,
      isMobile: true,
    });
    const page = await context.newPage();
    await page.goto('/projects/', { waitUntil: 'networkidle' });
    await settle(page);
    const hoverNone = await page.evaluate(() => matchMedia('(hover: hover)').matches);
    expect(hoverNone, 'touch context must not claim hover:hover').toBe(false);
    const buttons = page.locator('.tag-filter__btn');
    await expect(buttons.first()).toBeVisible();
    const second = buttons.nth(1);
    const idleBorder = await buttons.nth(2).evaluate((el) => getComputedStyle(el).borderColor);
    await second.tap();
    await expect(second).toHaveAttribute('aria-pressed', 'true');
    await second.tap();
    await expect(second).toHaveAttribute('aria-pressed', 'false');
    await page.locator('h1').tap();
    await expect
      .poll(() => second.evaluate((el) => getComputedStyle(el).borderColor), { timeout: 2000 })
      .toBe(idleBorder);
    await context.close();
  });

  test('/records/ primary PDF button --cut-fill changes on hover', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/records/', { waitUntil: 'networkidle' });
    await settle(page);
    const btn = page.locator('.read .btn--fill, .read-section .btn--fill').first();
    await expect(btn).toBeVisible();
    const before = await btn.evaluate((el) => getComputedStyle(el).getPropertyValue('--cut-fill').trim());
    await btn.hover();
    const after = await btn.evaluate((el) => getComputedStyle(el).getPropertyValue('--cut-fill').trim());
    expect(after, 'hover changes --cut-fill').not.toBe(before);
  });
});
