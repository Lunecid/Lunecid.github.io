import { devices } from '@playwright/test';
import { test, expect, settle } from './helpers';

// Batch 6 (interaction and accessibility polish): e2e coverage for rulings not already pinned by an existing spec
// (motion-storage.spec.ts covers P2-7, keyboard.spec.ts covers P2-3, i18n-parity.spec.ts covers P2-6,
// smoke.spec.ts covers P2-8's tag filter). This file covers P2-2 (toast), P2-9 (publication panels), P2-13
// (certificate pre-hydration queue), P2-24 (touch targets) and P2-25 (legal tables). The English 404 (P2-15) moved to
// tests/react/en-404.test.ts and tests/e2e/not-found.spec.ts with the neutral 404 (P1-16).

test.describe('P2-2: achievement toast', () => {
  test('dark HUD panel (not a cream pill), bottom-right on desktop, close button is 44x44', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/game/records/', { waitUntil: 'networkidle' });
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
    // --hud-panel on the game palette (#141416 = rgb(20, 20, 22); named change GP-1, was #15181F): a dark panel, not the
    // old cream pill (#F3E3B5-ish).
    expect(bg).toBe('rgb(20, 20, 22)');
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
    await page.goto('/game/records/', { waitUntil: 'networkidle' });
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
    await page.goto('/game/records/', { waitUntil: 'networkidle' });
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
    { url: '/game/research/', idBase: 'cog-2026-engagement' },
    { url: '/game/', idBase: 'rh' },
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
      if (url === '/game/research/') expect(rowBoxBefore.height, 'one row of buttons').toBeLessThan(60);

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

  for (const url of ['/game/research/#in-progress', '/game/records/#publications']) {
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
    await page.goto('/game/research/', { waitUntil: 'networkidle' });
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
    await page.goto('/game/records/', { waitUntil: 'domcontentloaded' });
    const trigger = page.locator('#awards a[data-cert-id]').first();
    await trigger.waitFor({ state: 'attached' });
    await trigger.click();
    // Still on /records/ (no navigation to the bare certificate image) once hydration completes.
    await expect(page.locator('dialog.image-viewer')).toHaveAttribute('open', '', { timeout: 5000 });
    await expect(page).toHaveURL(/\/game\/records\/(#view-[^#]+)?$/);
    await expect(page.getByRole('button', { name: '닫기' })).toBeFocused();
  });
});

test.describe('P2-24: touch targets and caption sizes', () => {
  test('the [SB] brand link and the tablet language link are >= 44x44', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/game/records/', { waitUntil: 'networkidle' });
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
    await page.goto('/game/records/', { waitUntil: 'networkidle' });
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
    await page.goto('/game/records/', { waitUntil: 'networkidle' });
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
    await page.goto('/game/projects/', { waitUntil: 'networkidle' });
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
    await page.goto('/game/', { waitUntil: 'networkidle' });
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
    await page.goto('/game/', { waitUntil: 'networkidle' });
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

    await page.locator('.hud-nav__list a[href="/game/records/"]').click();
    await page.waitForURL('**/game/records/');
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
  for (const route of ['/game/projects/', '/game/'] as const) {
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
    await page.goto('/game/projects/', { waitUntil: 'networkidle' });
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
    await page.goto('/game/projects/', { waitUntil: 'networkidle' });
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

  test('/game/records/ primary PDF button --cut-fill changes on hover', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/game/records/', { waitUntil: 'networkidle' });
    await settle(page);
    const btn = page.locator('.read .btn--fill, .read-section .btn--fill').first();
    await expect(btn).toBeVisible();
    const before = await btn.evaluate((el) => getComputedStyle(el).getPropertyValue('--cut-fill').trim());
    await btn.hover();
    const after = await btn.evaluate((el) => getComputedStyle(el).getPropertyValue('--cut-fill').trim());
    expect(after, 'hover changes --cut-fill').not.toBe(before);
  });
});

test('Z1: on a touch screen a tapped link keeps no hover colour (patch notes, hero chip, BibTeX copy)', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ ...devices['Pixel 7'], baseURL });
  const page = await context.newPage();
  // Taps must not navigate or copy: a capturing listener swallows the click, so only :hover/:active can change colour.
  await page.addInitScript(() => {
    window.addEventListener('click', (e) => {
      if ((e.target as Element | null)?.closest?.('.pn__link, .hero__chip, [data-bib-copy]')) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    }, true);
  });
  const tapKeepsColour = async (selector: string, read: (el: Element) => string) => {
    const el = page.locator(selector).first();
    await el.scrollIntoViewIfNeeded();
    await expect(el).toBeVisible();
    // the resting colour: read once it stops changing (CI run 37576265716 read the BibTeX copy button mid-transition
    // right after its block opened: 147 → 177 → 207, so "before" was never the colour the tap had to keep)
    let before = await el.evaluate(read);
    await expect.poll(async () => {
      await page.waitForTimeout(300);
      const now = await el.evaluate(read);
      const steady = now === before;
      before = now;
      return steady;
    }, { timeout: 5000, message: `${selector} settles before the tap` }).toBe(true);
    // Right after the tap the element still matches :hover on a touch screen (sticky hover); the colour must not follow.
    await el.tap();
    expect(await el.evaluate((node) => node.matches(':hover') || !!node.closest(':hover')), `${selector} keeps :hover after the tap`).toBe(true);
    await expect.poll(() => el.evaluate(read), { timeout: 2000, message: `${selector} after the tap` }).toBe(before);
    await page.locator('h1').first().tap();
    await expect.poll(() => el.evaluate(read), { timeout: 2000, message: `${selector} after tapping away` }).toBe(before);
  };
  const colour = (el: Element) => getComputedStyle(el).color;
  const cutLine = (el: Element) => getComputedStyle(el).getPropertyValue('--cut-line').trim();

  await page.goto('/game/', { waitUntil: 'networkidle' });
  await settle(page);
  expect(await page.evaluate(() => matchMedia('(hover: hover)').matches), 'Pixel 7 must not claim hover:hover').toBe(false);
  await tapKeepsColour('.pn__link', (el) => `${getComputedStyle(el).color} ${getComputedStyle(el).textDecorationLine}`);
  await tapKeepsColour('.hero__chip .hero__chip-face', cutLine);

  await page.goto('/game/research/', { waitUntil: 'networkidle' });
  await settle(page);
  await page.getByRole('button', { name: 'BibTeX' }).first().tap();
  await tapKeepsColour('#cog-2026-engagement-bibtex [data-bib-copy]', colour);
  await tapKeepsColour('#cog-2026-engagement-bibtex [data-bib-copy]', (el) => getComputedStyle(el).borderTopColor);
  await context.close();
});

test.describe('G1: showcase tab timing', () => {
  test.use({ reducedMotion: 'no-preference' });

  test("G1: after a tab click the new scene's last copy line is settled within 0.75 s", async ({ page }) => {
    await page.goto('/game/player-log/', { waitUntil: 'networkidle' });
    await page.locator('#favorite-games').scrollIntoViewIfNeeded();
    // hydrated: Astro removes the ssr attribute from the island once React has taken over
    await page.waitForFunction(() => {
      const island = document.querySelector('#favorite-games astro-island');
      return !!island && !island.hasAttribute('ssr');
    });
    const tab = page.locator('#favorite-games [role="tab"]').nth(1);
    // The probe arms on the press itself (capture phase) and follows the new scene every frame, so the times are
    // counted from the click, in the page: mount (old scene gone), start (first animation on the line), settled
    // (opacity 1, no running animation, no transform offset).
    await page.evaluate(() => {
      document.addEventListener(
        'click',
        () => {
          const t0 = performance.now();
          const host = document.querySelector('#favorite-games') as HTMLElement;
          const old = host.querySelector('.fg__scene');
          const r: Record<string, number> = {};
          const w = window as Window & { __g1?: Record<string, number> };
          const tick = (): void => {
            const now = Math.round(performance.now() - t0);
            const scene = [...host.querySelectorAll('.fg__scene')].find((el) => el !== old);
            const last = scene?.querySelector<HTMLElement>('.fg__copy > :last-child');
            if (scene && r.mount === undefined) r.mount = now;
            if (last && r.start === undefined && last.getAnimations({ subtree: true }).length) r.start = now;
            const cs = last ? getComputedStyle(last) : null;
            if (
              last && cs && r.start !== undefined && cs.opacity === '1' && /^(none|matrix\(1, 0, 0, 1, 0, 0\))$/.test(cs.transform) &&
              !last.getAnimations({ subtree: true }).some((a) => a.playState === 'running')
            ) {
              r.settled = now;
              w.__g1 = r;
            } else if (now > 3000) w.__g1 = r;
            else requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        },
        { capture: true, once: true },
      );
    });
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    const probe = await page
      .waitForFunction(() => (window as Window & { __g1?: Record<string, number> }).__g1)
      .then((h) => h.jsonValue() as Promise<Record<string, number>>);
    // TL puts the end at 0.67 s (exit + gap + 3 staggers + enter); a container's headless Chromium adds ~30-80 ms
    // (the exit's last frame, the animation start), so the wall-clock bound carries a 100 ms allowance. The old
    // timeline ended at 1.1 s nominal and fails it.
    expect(probe.settled, JSON.stringify(probe)).toBeDefined();
    expect(probe.settled, JSON.stringify(probe)).toBeLessThanOrEqual(750 + 100);
  });
});
