// The case-study overlay's runtime (src/lib/case/overlay.ts) on the paper page's "분석 케이스 보기" button: a native modal
// dialog with its name, a focus trap, Esc/Back/close/scrim, the stepper's keys, figures that end in their final state,
// no overflow, axe-clean, no console or CSP error, reduced motion and print. Entry points on the cards: case-entry.spec.ts.
import type { Page } from '@playwright/test';
import { caseCopy } from '../../src/data/copy/case/cog-2026';
import { collectProblems, collectViolations, expect, expectNoAxeViolations, test, textBelow12px, watchViolations } from './helpers';

const GAME = '/game/research/cog-2026-engagement/';
const DATA_EN = '/en/data/research/cog-2026-engagement/';
const TITLE = { ko: '리그 오브 레전드 교전 결과 예측', en: 'Predicting League of Legends engagement outcomes' };

async function openSheet(page: Page, route = GAME, width = 1280, height = 800): Promise<void> {
  await page.setViewportSize({ width, height });
  await page.goto(route, { waitUntil: 'networkidle' });
  await page.locator('button[data-case]').click();
  await expect(page.locator('dialog.cs.is-open')).toBeVisible();
  await page.waitForFunction(() => {
    const s = document.querySelector('.cs__sheet');
    return !!s && s.getAnimations().length === 0 && getComputedStyle(s).transform === 'none';
  });
}

const inDialog = (page: Page) => page.evaluate(() => !!document.activeElement?.closest('dialog.cs'));

test.describe('case overlay runtime', () => {
  test('the paper-page button opens a modal dialog named by the case title; focus starts on the sheet', async ({ page }) => {
    const problems = collectProblems(page);
    await watchViolations(page);
    await openSheet(page);
    const dialog = page.getByRole('dialog', { name: TITLE.ko });
    await expect(dialog).toBeVisible();
    expect(await page.evaluate(() => (document.querySelector('dialog.cs') as HTMLDialogElement).matches(':modal'))).toBe(true);
    expect(await page.evaluate(() => document.activeElement?.classList.contains('cs__sheet'))).toBe(true);
    expect(page.url()).toMatch(/#case$/);
    await expect(page.locator('a[data-case-paper]')).toHaveAttribute('href', new RegExp(`${GAME}$`));
    expect(await page.title()).not.toMatch(/case/i);
    expect(problems).toEqual([]);
    expect(await collectViolations(page)).toEqual([]);
  });

  test('focus never leaves the dialog over 30 Tabs and 30 Shift+Tabs', async ({ page }) => {
    await openSheet(page);
    for (let i = 0; i < 30; i++) { await page.keyboard.press('Tab'); expect(await inDialog(page), `Tab ${i + 1}`).toBe(true); }
    for (let i = 0; i < 30; i++) { await page.keyboard.press('Shift+Tab'); expect(await inDialog(page), `Shift+Tab ${i + 1}`).toBe(true); }
  });

  test('Esc closes and focuses the opener; the hash goes back', async ({ page }) => {
    await openSheet(page);
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog.cs')).not.toHaveAttribute('open', '');
    expect(await page.evaluate(() => document.activeElement?.matches('button[data-case]'))).toBe(true);
    await expect.poll(() => new URL(page.url()).hash).toBe('');
  });

  test('Back closes and focuses the opener; the close button and the scrim close it too', async ({ page }) => {
    await openSheet(page);
    await page.goBack();
    await expect(page.locator('dialog.cs')).not.toHaveAttribute('open', '');
    expect(await page.evaluate(() => document.activeElement?.matches('button[data-case]'))).toBe(true);
    await page.locator('button[data-case]').click();
    await expect(page.locator('dialog.cs.is-open')).toBeVisible();
    await page.locator('.cs__close').click();
    await expect(page.locator('dialog.cs')).not.toHaveAttribute('open', '');
    await page.locator('button[data-case]').click();
    await expect(page.locator('dialog.cs.is-open')).toBeVisible();
    await page.mouse.click(20, 400); // the scrim, left of the side sheet
    await expect(page.locator('dialog.cs')).not.toHaveAttribute('open', '');
  });

  test('<paper page>#case opens the sheet on load', async ({ page }) => {
    await page.goto(`${DATA_EN}#case`, { waitUntil: 'networkidle' });
    await expect(page.getByRole('dialog', { name: TITLE.en })).toBeVisible();
    await expect(page.locator('dialog.cs')).toHaveAttribute('lang', 'en');
  });

  test('the stepper moves focus with ←/→/Home/End (roving tabindex) and jumps to a chapter on click', async ({ page }) => {
    await openSheet(page);
    const steps = page.locator('.cs-steps button');
    await expect(steps).toHaveCount(5);
    await steps.first().focus();
    await page.keyboard.press('ArrowRight');
    await expect(steps.nth(1)).toBeFocused();
    await page.keyboard.press('End');
    await expect(steps.nth(4)).toBeFocused();
    await page.keyboard.press('Home');
    await expect(steps.nth(0)).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(steps.nth(4)).toBeFocused();
    expect(await steps.evaluateAll((bs) => bs.map((b) => (b as HTMLElement).tabIndex).filter((t) => t === 0).length)).toBe(1);
    await steps.nth(3).click();
    await expect(page.locator('#cs-ch4-t')).toBeFocused();
    await expect(steps.nth(3)).toHaveAttribute('aria-current', 'step');
  });

  for (const width of [375, 1280]) {
    test(`${width}: every figure ends in its final state after scrolling; labels inside the plot and never overlapping`, async ({ page }) => {
      await openSheet(page, GAME, width, 812);
      await page.evaluate(() => { for (const d of document.querySelectorAll('dialog.cs details')) (d as HTMLDetailsElement).open = true; });
      const body = page.locator('.cs__body');
      const height = await body.evaluate((b) => b.scrollHeight);
      for (let y = 0; y <= height; y += 300) {
        await body.evaluate((b, top) => b.scrollTo(0, top), y);
        await page.waitForTimeout(60);
      }
      await page.waitForTimeout(2600);
      expect(await page.locator('.cs-viz.is-pre').count()).toBe(0);
      expect(await page.locator('[data-plot] svg').count()).toBe(11);
      const problems = await page.evaluate(() => {
        const out: string[] = [];
        for (const svg of document.querySelectorAll('dialog.cs [data-plot] svg')) {
          const viz = svg.closest('.cs-viz')!.getAttribute('data-viz');
          const frame = svg.getBoundingClientRect();
          const boxes = [...svg.querySelectorAll('text')].filter((t) => getComputedStyle(t).opacity !== '0' && !t.closest('[data-s]:not([data-s="5"])')).map((t) => ({ t: t.textContent, r: t.getBoundingClientRect() }));
          for (const b of boxes) if (b.r.left < frame.left - 1 || b.r.right > frame.right + 1) out.push(`${viz}: "${b.t}" clipped (${Math.round(b.r.left - frame.left)}…${Math.round(b.r.right - frame.left)} of ${Math.round(frame.width)})`);
          for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
            const a = boxes[i]!.r, c = boxes[j]!.r;
            if (a.left < c.right - 1 && c.left < a.right - 1 && a.top < c.bottom - 1 && c.top < a.bottom - 1) out.push(`${viz}: "${boxes[i]!.t}" overlaps "${boxes[j]!.t}"`);
          }
        }
        return out;
      });
      expect(problems).toEqual([]);
      expect(await textBelow12px(page)).toEqual([]);
    });

    test(`${width}: no horizontal overflow in the sheet or the page`, async ({ page }) => {
      await openSheet(page, GAME, width, 812);
      await page.evaluate(() => { for (const d of document.querySelectorAll('dialog.cs details')) (d as HTMLDetailsElement).open = true; });
      const over = await page.evaluate(() => {
        const body = document.querySelector('.cs__body')!;
        const out: string[] = [];
        const right = body.getBoundingClientRect().right;
        for (const el of body.querySelectorAll('*')) {
          if (el.closest('.cs-tbl-wrap, .cs-eq, svg')) continue;
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.right > right + 1) out.push(`${el.tagName.toLowerCase()}.${[...el.classList].join('.')} (+${Math.round(r.right - right)})`);
        }
        return { scroll: body.scrollWidth - body.clientWidth, out: out.slice(0, 5), page: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth) };
      });
      expect(over).toEqual({ scroll: 0, out: [], page: 0 });
    });
  }

  test('axe finds no violation with the sheet open (Korean game page, English general page)', async ({ page }) => {
    await openSheet(page);
    await expectNoAxeViolations(page, 'ko game');
    await openSheet(page, DATA_EN, 375, 812);
    await expectNoAxeViolations(page, 'en data 375');
  });

  test('reduced motion: no transform in flight 60 ms after the click, counts final at once', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(GAME, { waitUntil: 'networkidle' });
    await page.locator('button[data-case]').click();
    await expect(page.locator('dialog.cs.is-open')).toBeVisible();
    await page.waitForTimeout(60);
    const state = await page.evaluate(() => {
      const s = document.querySelector('.cs__sheet')!;
      return { transform: getComputedStyle(s).transform, running: document.getAnimations().filter((a) => (a.effect as KeyframeEffect | null)?.target?.closest?.('dialog.cs')).length, count: document.querySelector('[data-cover] [data-count]')!.textContent };
    });
    expect(state).toEqual({ transform: 'none', running: 0, count: '1,115,123' });
  });

  test('print: only the sheet, every "details" open, charts final; closed again after printing', async ({ page }) => {
    await openSheet(page);
    await page.evaluate(() => dispatchEvent(new Event('beforeprint')));
    await page.emulateMedia({ media: 'print' });
    const printed = await page.evaluate(() => ({
      others: [...document.body.children].filter((el) => !el.matches('dialog.cs') && getComputedStyle(el).display !== 'none').map((el) => el.tagName),
      closed: document.querySelectorAll('dialog.cs details:not([open])').length,
      armed: document.querySelectorAll('dialog.cs .cs-viz.is-pre').length,
      steps: getComputedStyle(document.querySelector('.cs-steps')!).display,
    }));
    expect(printed).toEqual({ others: [], closed: 0, armed: 0, steps: 'none' });
    await page.emulateMedia({ media: 'screen' });
    await page.evaluate(() => dispatchEvent(new Event('afterprint')));
    expect(await page.locator('dialog.cs details[open]').count()).toBe(0);
  });

  test('BibTeX copy announces its result in a live region', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openSheet(page);
    await page.locator('dialog.cs details:has(.cs-bib) summary').click();
    await page.locator('[data-copy]').click();
    await expect(page.locator('[data-copy-status]')).toHaveText(caseCopy.ko.chrome.copyDone);
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('@inproceedings{baek2026killconditioned');
  });

  test('click → sheet visible within 500 ms at 4× CPU once cached', async ({ page }) => {
    await openSheet(page);
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog.cs')).not.toHaveAttribute('open', '');
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    // measured in the page (Playwright's own scripts are throttled too): the click event → the sheet shown and sliding in
    await page.evaluate(() => {
      const w = window as unknown as { __case: { click?: number; shown?: number } };
      w.__case = {};
      document.addEventListener('click', () => { w.__case.click = performance.now(); }, { capture: true, once: true });
      const dialog = document.querySelector('dialog.cs')!;
      new MutationObserver(() => { if (dialog.classList.contains('is-open')) w.__case.shown ??= performance.now(); }).observe(dialog, { attributes: true, attributeFilter: ['class'] });
    });
    await page.locator('button[data-case]').click();
    await page.waitForSelector('dialog.cs[open].is-open', { state: 'attached' });
    const t = await page.evaluate(() => (window as unknown as { __case: { click: number; shown: number } }).__case);
    expect(t.shown - t.click).toBeLessThanOrEqual(500);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  });
});
