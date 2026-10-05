import { test, expect, expectNoAxeViolations, settle } from './helpers';
import type { Locator, Page } from '@playwright/test';

const VIEWPORTS = [
  { name: 'phone', width: 375, height: 812 },
  { name: 'desktop', width: 1440, height: 900 },
] as const;

const PAGES = [
  { path: '/game/projects/school-zone-blindspots/', scope: 'main', label: 'case study' },
  { path: '/game/research/', scope: '#interests', label: 'research' },
  { path: '/data/projects/school-zone-blindspots/', scope: 'main', label: 'general case study' },
  { path: '/data/research/', scope: '#interests', label: 'general research' },
] as const;

/** data-state=open, full image decoded, and every dialog animation/transition finished. */
async function waitViewerSettled(dialog: Locator) {
  await expect(dialog).toHaveAttribute('data-state', 'open');
  await expect(dialog.locator('.image-viewer__img')).toHaveAttribute('data-ready', 'true');
  await dialog.evaluate((d) =>
    Promise.all(
      (d as HTMLElement).getAnimations({ subtree: true }).map((a) => a.finished.catch(() => undefined)),
    ),
  );
}

async function openFigure(page: Page, scope: string) {
  const trigger = page.locator(`${scope} a[data-viewer="figures"]`).first();
  await trigger.scrollIntoViewIfNeeded();
  const href = await trigger.getAttribute('href');
  await trigger.click();
  const dialog = page.locator('dialog.image-viewer');
  await expect(dialog).toHaveAttribute('open', '');
  return { trigger, dialog, href };
}

test.describe('image viewer', () => {
  for (const vp of VIEWPORTS) {
    for (const pageCase of PAGES) {
      test(`${pageCase.label}: open / URL / focus / overflow / axe @ ${vp.name}`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto(pageCase.path, { waitUntil: 'networkidle' });
        await settle(page);
        const before = page.url();
        const { trigger, dialog, href } = await openFigure(page, pageCase.scope);
        expect(new URL(page.url()).pathname).toBe(new URL(before).pathname);
        expect(new URL(page.url()).pathname).not.toMatch(/\.webp$/);
        await expect(page).toHaveURL(/#view-/);
        await waitViewerSettled(dialog);
        const img = dialog.locator('.image-viewer__img');
        await expect(img).toHaveAttribute('src', href!);
        const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(scrollWidth).toBeLessThanOrEqual(1);
        await expectNoAxeViolations(page);
        await page.keyboard.press('Escape');
        await expect(dialog).not.toHaveAttribute('open');
        await expect(trigger).toBeFocused();
      });
    }
  }

  test('←/→ move within a group and update the counter; stop at ends', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/game/research/', { waitUntil: 'networkidle' });
    await settle(page);
    const { dialog } = await openFigure(page, '#interests');
    await waitViewerSettled(dialog);
    const counter = dialog.locator('.image-viewer__counter');
    await expect(counter).toHaveText('1 / 2');
    await expect(dialog.locator('.image-viewer__nav--prev')).toHaveAttribute('aria-disabled', 'true');
    await page.keyboard.press('ArrowLeft');
    await dialog.evaluate((d) =>
      Promise.all((d as HTMLElement).getAnimations({ subtree: true }).map((a) => a.finished.catch(() => undefined))),
    );
    await expect(counter).toHaveText('1 / 2');
    await page.keyboard.press('ArrowRight');
    await expect(counter).toHaveText('2 / 2');
    await expect(dialog.locator('.image-viewer__nav--next')).toHaveAttribute('aria-disabled', 'true');
    await page.keyboard.press('ArrowRight');
    await dialog.evaluate((d) =>
      Promise.all((d as HTMLElement).getAnimations({ subtree: true }).map((a) => a.finished.catch(() => undefined))),
    );
    await expect(counter).toHaveText('2 / 2');
  });

  for (const vp of VIEWPORTS) {
    test(`S11: arrows + thumbnail open @ ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/game/research/', { waitUntil: 'networkidle' });
      await settle(page);
      const thumb = page.locator('#interests figure.interests__fig img').first();
      await thumb.click();
      const dialog = page.locator('dialog.image-viewer');
      await expect(dialog).toHaveAttribute('open', '');
      await expect(dialog).toHaveAttribute('data-state', 'open');
      const counter = dialog.locator('.image-viewer__counter');
      await expect(counter).toHaveText('1 / 2');
      await page.keyboard.press('ArrowRight');
      await expect(counter).toHaveText('2 / 2');
      await page.keyboard.press('Escape');
      await expect(dialog).not.toHaveAttribute('open');
    });
  }

  test('B8: at last image Next keeps focus and ArrowLeft still works', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/game/records/', { waitUntil: 'networkidle' });
    await settle(page);
    await page.locator('#awards a[data-viewer="certificates"]').first().click();
    const dialog = page.locator('dialog.image-viewer');
    await expect(dialog).toHaveAttribute('data-state', 'open');
    const next = dialog.locator('.image-viewer__nav--next');
    const counter = dialog.locator('.image-viewer__counter');
    // certificates group has 3
    await next.click();
    await expect(counter).toHaveText('2 / 3');
    await next.click();
    await expect(counter).toHaveText('3 / 3');
    await expect(next).toHaveAttribute('aria-disabled', 'true');
    const activeInside = await page.evaluate(() => {
      const d = document.querySelector('dialog.image-viewer');
      return !!(d && d.contains(document.activeElement));
    });
    expect(activeInside).toBe(true);
    await page.keyboard.press('ArrowLeft');
    await expect(counter).toHaveText('2 / 3');
  });

  test('clicking the thumbnail opens the viewer too', async ({ page }) => {
    await page.goto('/game/research/', { waitUntil: 'networkidle' });
    await settle(page);
    const thumb = page.locator('#interests figure.interests__fig img').first();
    await thumb.click();
    await expect(page.locator('dialog.image-viewer')).toHaveAttribute('open', '');
  });

  test('reduced motion: stage has no transform; zoom still works; caption stays centred', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/game/research/', { waitUntil: 'networkidle' });
    await settle(page);
    await page.locator('#interests a[data-viewer="figures"]').first().click();
    const dialog = page.locator('dialog.image-viewer');
    await expect(dialog).toHaveAttribute('open', '');
    await expect(dialog.locator('.image-viewer__stage')).toHaveAttribute('data-flip', 'off');
    const transform = await dialog.locator('.image-viewer__stage').evaluate((el) => getComputedStyle(el).transform);
    expect(transform === 'none' || transform === 'matrix(1, 0, 0, 1, 0, 0)').toBe(true);
    const media = dialog.locator('.image-viewer__media');
    await media.dblclick();
    const zs = await media.evaluate((el) => getComputedStyle(el).getPropertyValue('--zs').trim() || (el as HTMLElement).style.getPropertyValue('--zs'));
    expect(zs === '2' || zs === '').toBeTruthy();
    // Inline --zs is what drives the transform; read from style.
    await expect.poll(async () => media.evaluate((el) => (el as HTMLElement).style.getPropertyValue('--zs'))).toBe('2');
    const centres = await page.evaluate(() => {
      const stage = document.querySelector('.image-viewer__stage')!.getBoundingClientRect();
      const cap = document.querySelector('.image-viewer__cap')!.getBoundingClientRect();
      return { stageCx: stage.left + stage.width / 2, capCx: cap.left + cap.width / 2 };
    });
    expect(Math.abs(centres.capCx - centres.stageCx)).toBeLessThanOrEqual(1);
  });

  for (const path of ['/game/projects/kickick-park/', '/game/research/']) {
    test(`B1: opening FLIP grows through a mid width on ${path}`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(path, { waitUntil: 'networkidle' });
      await settle(page);
      const scope = path === '/game/research/' ? '#interests' : 'main';
      const triggerSel = `${scope} a[data-viewer="figures"]`;
      const trigger = page.locator(triggerSel).first();
      await trigger.scrollIntoViewIfNeeded();
      const thumbWidth = await trigger.evaluate((el) => {
        const fig = el.closest('figure');
        const img = fig?.querySelector('img');
        return img?.getBoundingClientRect().width ?? el.getBoundingClientRect().width;
      });

      // Arm an in-page rAF sampler on the click path, then click via Playwright.
      await page.evaluate((sel) => {
        const w = window as unknown as {
          __flipWidths?: number[];
          __flipDone?: boolean;
          __flipSawTransform?: boolean;
        };
        w.__flipWidths = [];
        w.__flipDone = false;
        w.__flipSawTransform = false;
        const el = document.querySelector(sel);
        if (!(el instanceof HTMLElement)) return;
        el.addEventListener(
          'click',
          () => {
            let frames = 0;
            const sample = () => {
              frames += 1;
              const stage = document.querySelector('.image-viewer__stage') as HTMLElement | null;
              if (stage) {
                const t = getComputedStyle(stage).transform;
                const idle = t === 'none' || t === 'matrix(1, 0, 0, 1, 0, 0)';
                if (!idle) w.__flipSawTransform = true;
                // Only collect widths once FLIP has started (transformed bounds), until it settles.
                if (w.__flipSawTransform) {
                  w.__flipWidths!.push(stage.getBoundingClientRect().width);
                  if (idle && w.__flipWidths!.length > 1) {
                    w.__flipDone = true;
                    return;
                  }
                }
              }
              if (frames > 180) {
                w.__flipDone = true;
                return;
              }
              requestAnimationFrame(sample);
            };
            requestAnimationFrame(sample);
          },
          { once: true, capture: true },
        );
      }, triggerSel);

      await trigger.click();
      const dialog = page.locator('dialog.image-viewer');
      await expect(dialog).toHaveAttribute('open', '');
      await expect(dialog).toHaveAttribute('data-state', 'open');
      await page.waitForFunction(() => (window as unknown as { __flipDone?: boolean }).__flipDone === true);
      const { widths, sawTransform } = await page.evaluate(() => {
        const w = window as unknown as { __flipWidths?: number[]; __flipSawTransform?: boolean };
        return { widths: w.__flipWidths ?? [], sawTransform: !!w.__flipSawTransform };
      });
      expect(sawTransform, `FLIP transform never observed on ${path}`).toBe(true);
      const finalWidth = widths.at(-1) ?? 0;
      const mid = widths.find((w) => w > thumbWidth + 20 && w < finalWidth - 20);
      expect(mid, `mid sample missing on ${path} (n=${widths.length}, thumb=${thumbWidth}, final=${finalWidth})`).toBeTruthy();
      expect(finalWidth).toBeGreaterThan(thumbWidth);
    });
  }

  test('B4: mouse dblclick on media zooms to scale 2', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/game/research/', { waitUntil: 'networkidle' });
    await settle(page);
    const { dialog } = await openFigure(page, '#interests');
    await expect(dialog).toHaveAttribute('data-state', 'open');
    const media = dialog.locator('.image-viewer__media');
    await media.dblclick();
    await expect.poll(async () => media.evaluate((el) => (el as HTMLElement).style.getPropertyValue('--zs'))).toBe('2');
  });

  test('B4/R12: CDP touch double-tap zooms to scale 2 at phone size', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/game/research/', { waitUntil: 'networkidle' });
    await settle(page);
    const { dialog } = await openFigure(page, '#interests');
    await expect(dialog).toHaveAttribute('data-state', 'open');
    await expect.poll(async () => dialog.locator('.image-viewer__stage').evaluate((e) => getComputedStyle(e).transform)).toBe('none');
    const media = dialog.locator('.image-viewer__media');
    const box = await media.boundingBox();
    expect(box).toBeTruthy();
    const x = box!.x + box!.width / 2;
    const y = box!.y + box!.height / 2;
    const client = await page.context().newCDPSession(page);
    // One CDP sequence: both taps with a fixed in-page gap after the first pointerup is processed.
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await media.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => {
            setTimeout(resolve, 80);
          });
        }),
    );
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(async () => media.evaluate((el) => (el as HTMLElement).style.getPropertyValue('--zs'))).toBe('2');
  });

  test('B3: touch swipe changes the counter on /records/ at phone size', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/game/records/', { waitUntil: 'networkidle' });
    await settle(page);
    await page.locator('#awards a[data-viewer="certificates"]').first().click();
    const dialog = page.locator('dialog.image-viewer');
    await expect(dialog).toHaveAttribute('data-state', 'open');
    await expect(dialog.locator('.image-viewer__counter')).toHaveText('1 / 3');
    // R9: wait for FLIP to finish so the swipe spans more than the 40px threshold.
    await expect.poll(async () => dialog.locator('.image-viewer__stage').evaluate((e) => getComputedStyle(e).transform)).toBe('none');
    const box = await dialog.locator('.image-viewer__media').boundingBox();
    expect(box).toBeTruthy();
    const y = box!.y + box!.height / 2;
    const x1 = box!.x + box!.width * 0.75;
    const x2 = box!.x + box!.width * 0.25;
    const client = await page.context().newCDPSession(page);
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: x1, y }],
    });
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: x2, y }],
    });
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    await expect(dialog.locator('.image-viewer__counter')).toHaveText('2 / 3');
  });

  test('R4: label strip and counter do not overlap on short viewports', async ({ page }) => {
    for (const size of [
      { width: 812, height: 375 },
      { width: 1024, height: 600 },
    ]) {
      await page.setViewportSize(size);
      await page.goto('/en/game/records/', { waitUntil: 'networkidle' });
      await settle(page);
      await page.locator('a[data-viewer="certificates"]').first().click();
      const dialog = page.locator('dialog.image-viewer');
      await waitViewerSettled(dialog);
      const overlap = await page.evaluate(() => {
        const strip = document.querySelector('.image-viewer__strip')?.getBoundingClientRect();
        const counter = document.querySelector('.image-viewer__counter')?.getBoundingClientRect();
        if (!strip || !counter) return false;
        return !(strip.right < counter.left || strip.left > counter.right || strip.bottom < counter.top || strip.top > counter.bottom);
      });
      expect(overlap, `${size.width}x${size.height}`).toBe(false);
      await page.keyboard.press('Escape');
      await expect(dialog).not.toHaveAttribute('open');
    }
  });

  test('close sits on the frame row with visible × + 닫기/Close', async ({ page }) => {
    const rectsAt = async (width: number, height: number, path: string) => {
      await page.setViewportSize({ width, height });
      await page.goto(path, { waitUntil: 'networkidle' });
      await settle(page);
      const trigger = page.locator('a[data-viewer]').first();
      await trigger.scrollIntoViewIfNeeded();
      await trigger.click();
      const dialog = page.locator('dialog.image-viewer');
      await waitViewerSettled(dialog);
      return page.evaluate(() => {
        const overlaps = (a: DOMRect, b: DOMRect) =>
          !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
        const close = document.querySelector('.image-viewer__close') as HTMLElement;
        const frame = document.querySelector('.image-viewer__frame') as HTMLElement;
        const strip = document.querySelector('.image-viewer__strip');
        const counter = document.querySelector('.image-viewer__counter');
        const cr = close.getBoundingClientRect();
        const fr = frame.getBoundingClientRect();
        return {
          text: close.innerText.replace(/\s+/g, ' ').trim(),
          name: close.getAttribute('aria-label') ?? '',
          rightGap: Math.abs(cr.right - fr.right),
          aboveFrame: cr.bottom <= fr.top + 1,
          hitStrip: strip ? overlaps(cr, strip.getBoundingClientRect()) : false,
          hitCounter: counter ? overlaps(cr, counter.getBoundingClientRect()) : false,
        };
      });
    };

    for (const vp of [
      { width: 1440, height: 900 },
      { width: 375, height: 812 },
    ]) {
      const ko = await rectsAt(vp.width, vp.height, '/game/research/');
      expect(ko.text, `${vp.width} ko text`).toMatch(/×/);
      expect(ko.text, `${vp.width} ko text`).toMatch(/닫기/);
      expect(ko.name, `${vp.width} ko name`).toBe('닫기');
      expect(ko.rightGap, `${vp.width} ko right`).toBeLessThanOrEqual(8);
      expect(ko.aboveFrame, `${vp.width} ko above`).toBe(true);
      await page.keyboard.press('Escape');

      const en = await rectsAt(vp.width, vp.height, '/en/game/research/');
      expect(en.text, `${vp.width} en text`).toMatch(/×/);
      expect(en.text, `${vp.width} en text`).toMatch(/Close/);
      expect(en.name, `${vp.width} en name`).toBe('Close');
      expect(en.rightGap, `${vp.width} en right`).toBeLessThanOrEqual(8);
      expect(en.aboveFrame, `${vp.width} en above`).toBe(true);
      await page.keyboard.press('Escape');
    }

    for (const size of [
      { width: 320, height: 568 },
      { width: 375, height: 812 },
      { width: 667, height: 375 },
      { width: 1024, height: 600 },
      { width: 1440, height: 900 },
      { width: 2560, height: 1440 },
    ]) {
      const info = await rectsAt(size.width, size.height, '/game/records/');
      expect(info.hitStrip, `${size.width}x${size.height} strip`).toBe(false);
      expect(info.hitCounter, `${size.width}x${size.height} counter`).toBe(false);
      await page.keyboard.press('Escape');
    }
  });

  test('B6: caption sits below the stage and inside the viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    for (const path of ['/game/projects/kickick-park/', '/en/game/projects/school-zone-blindspots/', '/en/game/records/', '/game/research/']) {
      await page.goto(path, { waitUntil: 'networkidle' });
      await settle(page);
      const trigger = page.locator('a[data-viewer]').first();
      await trigger.scrollIntoViewIfNeeded();
      await trigger.click();
      const dialog = page.locator('dialog.image-viewer');
      await waitViewerSettled(dialog);
      const ok = await page.evaluate(() => {
        const vh = window.innerHeight;
        const col = document.querySelector('.image-viewer__column') as HTMLElement;
        const stage = col.querySelector('.image-viewer__stage') as HTMLElement;
        const cap = col.querySelector('.image-viewer__cap') as HTMLElement | null;
        if (!cap) return { pass: true, vh };
        // offset* is layout (ignores FLIP transform); caption must sit below the stage in flow.
        const below = cap.offsetTop >= stage.offsetTop + stage.offsetHeight - 1;
        const cr = cap.getBoundingClientRect();
        return {
          pass: below && cr.bottom <= vh + 1 && cr.top >= 0,
          vh,
          stageLayoutBottom: stage.offsetTop + stage.offsetHeight,
          capLayoutTop: cap.offsetTop,
          capBottom: cr.bottom,
        };
      });
      expect(ok, `${path} ${JSON.stringify(ok)}`).toMatchObject({ pass: true });
      await page.keyboard.press('Escape');
      await expect(dialog).not.toHaveAttribute('open');
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/en/game/records/', { waitUntil: 'networkidle' });
    await settle(page);
    await page.locator('a[data-viewer="certificates"]').first().click();
    const dialog = page.locator('dialog.image-viewer');
    await waitViewerSettled(dialog);
    const ok = await page.evaluate(() => {
      const vh = window.innerHeight;
      const col = document.querySelector('.image-viewer__column') as HTMLElement;
      const stage = col.querySelector('.image-viewer__stage') as HTMLElement;
      const cap = col.querySelector('.image-viewer__cap') as HTMLElement;
      const below = cap.offsetTop >= stage.offsetTop + stage.offsetHeight - 1;
      const cr = cap.getBoundingClientRect();
      return below && cr.bottom <= vh + 1;
    });
    expect(ok).toBe(true);
  });

  test('B2: deep link → ←/→ → Esc stays on /records/', async ({ page }) => {
    await page.goto('/game/', { waitUntil: 'networkidle' });
    await settle(page);
    await page.goto('/game/records/#view-busan-mayor-award', { waitUntil: 'networkidle' });
    await settle(page);
    const dialog = page.locator('dialog.image-viewer');
    await expect(dialog).toHaveAttribute('open', '', { timeout: 5000 });
    await page.keyboard.press('ArrowRight');
    await expect(dialog.locator('.image-viewer__counter')).toHaveText('2 / 3');
    await page.keyboard.press('Escape');
    await expect(dialog).not.toHaveAttribute('open');
    await expect(page).toHaveURL(/\/game\/records\/$/);
  });

  test('B2 variant: deep link → ←/→ → reload → Esc stays on /records/', async ({ page }) => {
    await page.goto('/game/records/#view-busan-mayor-award', { waitUntil: 'networkidle' });
    await settle(page);
    const dialog = page.locator('dialog.image-viewer');
    await expect(dialog).toHaveAttribute('open', '', { timeout: 5000 });
    await page.keyboard.press('ArrowRight');
    await expect(dialog.locator('.image-viewer__counter')).toHaveText('2 / 3');
    await page.reload({ waitUntil: 'networkidle' });
    await settle(page);
    await expect(page.locator('dialog.image-viewer')).toHaveAttribute('open', '', { timeout: 5000 });
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog.image-viewer')).not.toHaveAttribute('open');
    await expect(page).toHaveURL(/\/game\/records\/$/);
  });

  test('S1: Esc shortly after ←/→ still closes', async ({ page }) => {
    await page.goto('/game/research/', { waitUntil: 'networkidle' });
    await settle(page);
    const { dialog } = await openFigure(page, '#interests');
    await waitViewerSettled(dialog);
    await page.keyboard.press('ArrowRight');
    // Race: Esc while the slide transition may still be starting — no wall-clock wait for close.
    await page.keyboard.press('Escape');
    await expect(dialog).not.toHaveAttribute('open');
    await expect(dialog).toHaveAttribute('data-state', 'closed');
  });

  test('S4: dialog.close() while open removes the history entry', async ({ page }) => {
    await page.goto('/game/', { waitUntil: 'networkidle' });
    await settle(page);
    await page.goto('/game/records/', { waitUntil: 'networkidle' });
    await settle(page);
    await page.locator('#awards a[data-viewer="certificates"]').first().click();
    await expect(page.locator('dialog.image-viewer')).toHaveAttribute('open', '');
    await page.evaluate(() => document.querySelector<HTMLDialogElement>('dialog.image-viewer')!.close());
    await expect(page.locator('dialog.image-viewer')).not.toHaveAttribute('open');
    await expect(page).toHaveURL(/\/game\/records\/$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/game\/$/);
  });

  test('certificate on /records/: achievement fires exactly once on close', async ({ page }) => {
    await page.goto('/game/records/', { waitUntil: 'networkidle' });
    await settle(page);
    const trigger = page.locator('#awards a[data-viewer="certificates"]').first();
    await trigger.click();
    const dialog = page.locator('dialog.image-viewer');
    await expect(dialog).toHaveAttribute('open', '');
    await expect(page.locator('.ach-toast')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(dialog).not.toHaveAttribute('open');
    await expect(page.locator('.ach-toast')).toBeVisible();
    await expect(page.locator('.ach-toast')).toContainText('상장 확인');
    await expect(page.locator('.ach-toast')).toHaveCount(1);
  });

  for (const path of ['/game/player-log/', '/en/game/player-log/']) {
    test(`PL-4 ${path}: an evidence link opens the viewer, ←/→ move among the three, Esc returns focus, the certificate achievement stays locked`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(path, { waitUntil: 'networkidle' });
      await settle(page);
      const triggers = page.locator('#game-achievements a[data-viewer="game-records"]');
      await expect(triggers).toHaveCount(3);
      const first = triggers.first();
      await first.scrollIntoViewIfNeeded();
      await first.focus();
      await page.keyboard.press('Enter');
      const dialog = page.locator('dialog.image-viewer');
      await expect(dialog).toHaveAttribute('open', '');
      await waitViewerSettled(dialog);
      await expect(page).toHaveURL(/#view-gm-2026$/);
      const counter = dialog.locator('.image-viewer__counter');
      await expect(counter).toHaveText('1 / 3');
      await page.keyboard.press('ArrowRight');
      await expect(counter).toHaveText('2 / 3');
      await expect(page).toHaveURL(/#view-gm-2025$/);
      await page.keyboard.press('ArrowRight');
      await expect(counter).toHaveText('3 / 3');
      await expect(page).toHaveURL(/#view-rank-2018$/);
      await page.keyboard.press('ArrowLeft');
      await expect(counter).toHaveText('2 / 3');
      await page.keyboard.press('Escape');
      await expect(dialog).not.toHaveAttribute('open');
      await expect(triggers.nth(1)).toBeFocused();
      await expect(page).not.toHaveURL(/#view-/);
      // no data-cert-id on these triggers: closing fires no achievement
      await expect(page.locator('.ach-toast')).toHaveCount(0);
      await expect(page.locator('#site-achievements [data-ach-id="certificate-checked"]')).toHaveAttribute('data-unlocked', 'false');
    });
  }

  test('Esc removes exactly one history entry; goBack returns to previous document', async ({ page }) => {
    await page.goto('/game/', { waitUntil: 'networkidle' });
    await settle(page);
    await page.goto('/game/records/', { waitUntil: 'networkidle' });
    await settle(page);
    await page.locator('#awards a[data-viewer="certificates"]').first().click();
    await expect(page.locator('dialog.image-viewer')).toHaveAttribute('open', '');
    await expect(page).toHaveURL(/#view-/);
    expect(await page.evaluate(() => !!(history.state && typeof history.state === 'object' && 'viewer' in history.state))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog.image-viewer')).not.toHaveAttribute('open');
    await expect(page).toHaveURL(/\/game\/records\/$/);
    expect(await page.evaluate(() => !!(history.state && typeof history.state === 'object' && 'viewer' in history.state))).toBe(false);
    await page.goBack();
    await expect(page).toHaveURL(/\/game\/$/);
  });

  for (const path of ['/game/records/#view-busan-mayor-award', '/data/records/#view-busan-mayor-award']) {
    test(`${path} opens the certificate on load`, async ({ page }) => {
      await page.goto(path, { waitUntil: 'networkidle' });
      await settle(page);
      await expect(page.locator('dialog.image-viewer')).toHaveAttribute('open', '', { timeout: 5000 });
      await expect(page.locator('dialog.image-viewer .image-viewer__img')).toBeVisible();
    });
  }

  test('B7: focused Next shows a visible accent focus ring', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/game/research/', { waitUntil: 'networkidle' });
    await settle(page);
    const { dialog } = await openFigure(page, '#interests');
    // Tab from close → prev → next so :focus-visible applies.
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    const next = dialog.locator('.image-viewer__nav--next');
    await expect(next).toBeFocused();
    const outline = await next.evaluate((el) => {
      const s = getComputedStyle(el);
      return { color: s.outlineColor, width: s.outlineWidth, style: s.outlineStyle };
    });
    expect(outline.style).not.toBe('none');
    expect(outline.width).not.toBe('0px');
    expect(outline.color).toMatch(/200,\s*240,\s*60/);
  });

  test('/game/projects/ hash-only popstate keeps the tag filter selection', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/game/projects/', { waitUntil: 'networkidle' });
    await settle(page);
    await page.locator('[data-tag-filter] button').nth(1).click();
    await expect(page.locator('[data-tag-filter] button').nth(1)).toHaveAttribute('aria-pressed', 'true');
    // the cards swap inside the filter's view transition (R1), a frame after the click
    await page.waitForFunction(() => document.querySelectorAll('#project-grid [data-tags][hidden]').length > 0);
    await page.evaluate(() => {
      history.pushState({ tag: 'x' }, '', `${location.pathname}${location.search}#tag-test`);
      history.back();
    });
    await page.waitForFunction(() => location.hash === '');
    const visible = await page.locator('#project-grid [data-tags]:not([hidden])').count();
    expect(visible).toBeGreaterThan(0);
    expect(visible).toBeLessThan(6);
  });
});
