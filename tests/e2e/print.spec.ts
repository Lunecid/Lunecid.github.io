import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { test, expect } from './helpers';
import { SITE } from '../../src/config';

// P-12 (G-023..G-026, G-028): the print pass of the game version. Each page prints the way a visitor's "Save as PDF"
// does by default: A4, 10mm margins, background graphics off. The PDF's text comes from poppler's pdftotext (installed
// in CI with the PDF build); a local machine without poppler skips the PDF-text tests.

const POPPLER = !spawnSync('pdftotext', ['-v'], { encoding: 'utf8' }).error && !spawnSync('pdfinfo', ['-v'], { encoding: 'utf8' }).error;
const popplerMissing = !POPPLER && !process.env.CI;

const GAME_PAGES = ['/game/', '/game/records/', '/game/projects/kickick-park/', '/game/research/', '/game/player-log/', '/en/game/'] as const;
const PAPER_PAGES = ['/game/research/cog-2026-engagement/', '/en/game/research/cog-2026-engagement/'] as const;

interface Printed {
  pages: number;
  /** Text of the whole PDF, and of page 1 alone. */
  text: string;
  firstPage: string;
  /** "width x height" of every image placed on page 1. */
  firstPageImages: string[];
}

async function printPdf(page: Page): Promise<Printed> {
  const pdf = await page.pdf({ format: 'A4', margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' }, printBackground: false });
  const dir = mkdtempSync(join(tmpdir(), 'sb-print-'));
  try {
    const file = join(dir, 'page.pdf');
    writeFileSync(file, pdf);
    const run = (cmd: string, args: string[]) => execFileSync(cmd, args, { encoding: 'utf8' });
    const pages = Number(/Pages:\s+(\d+)/.exec(run('pdfinfo', [file]))?.[1] ?? 0);
    const text = run('pdftotext', ['-enc', 'UTF-8', file, '-']);
    const firstPage = run('pdftotext', ['-enc', 'UTF-8', '-f', '1', '-l', '1', file, '-']);
    const firstPageImages = run('pdfimages', ['-list', '-f', '1', '-l', '1', file])
      .split('\n')
      .slice(2)
      .map((line) => line.trim().split(/\s+/))
      .filter((cols) => cols[2] === 'image')
      .map((cols) => `${cols[3]}x${cols[4]}`);
    return { pages, text, firstPage, firstPageImages };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Whitespace-free, so a URL or label that pdftotext wraps over two lines still matches. */
const squash = (s: string) => s.replace(/\s+/g, '');

async function open(page: Page, route: string): Promise<void> {
  await page.goto(route, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
}

/** WCAG contrast of an element's computed text colour on white paper, in print media. */
async function inkContrastOnPaper(page: Page, selector: string): Promise<{ text: string; ratio: number }[]> {
  return page.locator(selector).evaluateAll((els) => {
    const lum = (c: number[]) => {
      const [r, g, b] = c.map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };
    return els
      .filter((el) => (el as HTMLElement).checkVisibility())
      .map((el) => {
        const rgba = getComputedStyle(el).color.match(/[\d.]+/g)!.map(Number);
        const alpha = rgba[3] ?? 1;
        // A translucent ink prints blended with the white paper.
        const rgb = rgba.slice(0, 3).map((v) => v * alpha + 255 * (1 - alpha));
        const ratio = (1 + 0.05) / (lum(rgb) + 0.05);
        return { text: (el.textContent ?? '').trim().slice(0, 40), ratio: Math.round(ratio * 100) / 100 };
      });
  });
}

test.describe('print (P-12)', () => {
  test('G-026: the canonical URL line is display:none on screen and out of the accessibility tree', async ({ page }) => {
    for (const [route, selector] of [['/game/', '.site-footer__canonical'], ['/data/', '.data-footer__canonical']] as const) {
      await open(page, route);
      const line = page.locator(selector);
      await expect(line, route).toHaveCount(1);
      await expect(line, route).toHaveText(new URL(route, SITE.url).href);
      await expect(line, route).toBeHidden();
      await expect(line, route).toHaveCSS('display', 'none');
    }
  });

  test('G-023: in print, every H1 and the primary CV label read at >= 4.5:1 on white paper', async ({ page }) => {
    await page.emulateMedia({ media: 'print' });
    for (const route of [...GAME_PAGES, ...PAPER_PAGES]) {
      await open(page, route);
      const h1 = await inkContrastOnPaper(page, 'main h1');
      expect(h1.length, `${route}: a visible h1`).toBeGreaterThan(0);
      for (const { text, ratio } of h1) expect(ratio, `${route} h1 "${text}"`).toBeGreaterThanOrEqual(4.5);
    }
    for (const route of ['/game/records/', '/en/game/records/']) {
      await open(page, route);
      const cv = await inkContrastOnPaper(page, 'main .doc-btns__btn.btn--fill');
      expect(cv, `${route}: one primary CV label`).toHaveLength(1);
      expect(cv[0]!.ratio, `${route} primary CV label "${cv[0]!.text}"`).toBeGreaterThanOrEqual(4.5);
    }
  });

  test('G-024 / G-028: print hides the controls, the menu, the image viewer and the secret achievements', async ({ page }) => {
    await open(page, '/game/player-log/');
    const secret = page.locator('[data-secret]');
    const secrets = await secret.count();
    expect(secrets, 'the achievement list marks its secret entries').toBeGreaterThan(0);
    await expect(secret.first()).toBeVisible();
    await page.emulateMedia({ media: 'print' });
    for (let i = 0; i < secrets; i++) await expect(secret.nth(i)).toBeHidden();

    await open(page, '/game/');
    await expect(page.locator('nav.mm')).toBeHidden();
    await expect(page.locator('.hud-nav')).toBeHidden();
    await expect(page.locator('.site-footer [data-motion-toggle]')).toBeHidden();
    await expect(page.locator('.site-footer__canonical')).toBeVisible();

    await open(page, '/game/research/');
    for (const control of await page.locator('[data-screen-only]').all()) await expect(control).toBeHidden();
    const panels = page.locator('.pub__panel[id$="-abstract"], .pub__panel[id$="-bibtex"]');
    expect(await panels.count()).toBeGreaterThan(0);
    for (const panel of await panels.all()) await expect(panel).toBeVisible();

    await open(page, '/game/projects/kickick-park/');
    const viewer = page.locator('dialog.image-viewer');
    if ((await viewer.count()) > 0) await expect(viewer.first()).toHaveCSS('display', 'none');
  });

  test('AL-11: the account dialog, opened on screen, does not print (fixture build)', async ({ page }) => {
    await page.goto(`http://127.0.0.1:${Number(process.env.E2E_ACCOUNTS_PORT ?? 4332)}/game/player-log/`, { waitUntil: 'load' });
    await page.locator('#membership button.acct-tile').first().click();
    const dialog = page.locator('dialog#acct-dlg');
    await expect(dialog).toBeVisible();
    await page.emulateMedia({ media: 'print' });
    await expect(dialog).toHaveCSS('display', 'none');
  });

  test.describe('PDF text (pdftotext)', () => {
    test.skip(popplerMissing, 'poppler (pdftotext, pdfinfo, pdfimages) not installed locally; runs in CI');

    test('no header, BGM or footer-toggle text; the canonical URL line prints', async ({ page }) => {
      for (const route of GAME_PAGES) {
        await open(page, route);
        const chrome = await page.evaluate(() => {
          const text = (sel: string) => [...document.querySelectorAll(sel)].map((el) => (el.textContent ?? '').replace(/\s+/g, '')).filter(Boolean);
          return {
            brand: text('.hud-nav__brand > :not(.sr-only)'),
            bgm: text('.hud-nav .bgm'),
            toggle: text('.site-footer [data-motion-toggle]'),
            navList: text('.hud-nav'),
          };
        });
        expect(chrome.toggle.length, `${route}: the footer motion toggle exists`).toBe(1);
        const printed = await printPdf(page);
        const text = squash(printed.text);
        for (const s of [...chrome.brand, ...chrome.bgm, ...chrome.toggle]) expect(text, `${route} prints "${s}"`).not.toContain(s);
        expect(text, `${route}: the header as a whole`).not.toContain(chrome.navList[0]);
        expect(text, `${route}: the BGM toggle label`).not.toMatch(/♪?BGM(ON|OFF)/);
        expect(text, `${route}: the canonical URL line`).toContain(squash(new URL(route, SITE.url).href));
      }
      await open(page, '/data/');
      expect(squash((await printPdf(page)).text), '/data/: the canonical URL line').toContain(squash(new URL('/data/', SITE.url).href));
    });

    test('external URLs and the full address of the site PDFs are in the text', async ({ page }) => {
      for (const route of ['/game/', '/game/records/', '/game/research/', '/game/projects/kickick-park/']) {
        await open(page, route);
        await page.emulateMedia({ media: 'print' });
        const targets = await page.locator('main a[href^="http"], main a[href$=".pdf"]').evaluateAll((links) =>
          links.filter((a) => (a as HTMLElement).checkVisibility()).map((a) => a.getAttribute('href')!),
        );
        await page.emulateMedia({ media: null }); // page.pdf() prints with print media only while no media is emulated
        expect(targets.length, `${route}: printed links`).toBeGreaterThan(0);
        const text = squash((await printPdf(page)).text);
        for (const href of new Set(targets)) {
          const url = href.startsWith('http') ? href : new URL(href, SITE.url).href;
          expect(text, `${route}: ${url}`).toContain(squash(url));
        }
      }
    });

    test('the kickick cover prints on page 1', async ({ page }) => {
      await open(page, '/game/projects/kickick-park/');
      const cover = page.locator('.pd__fig img');
      await expect(cover).toHaveCount(1);
      // The print may pick another srcset width than the screen did, so the cover is matched by its aspect ratio.
      const ratio = await cover.evaluate((img: HTMLImageElement) => img.naturalWidth / img.naturalHeight);
      const caption = squash(await page.locator('.pd__fig figcaption').innerText());
      const printed = await printPdf(page);
      const ratios = printed.firstPageImages.map((wh) => { const [w, h] = wh.split('x').map(Number); return w! / h!; });
      expect(ratios.some((r) => Math.abs(r - ratio) < 0.02), `the cover (w/h ${ratio.toFixed(3)}) among page 1 images ${printed.firstPageImages.join(', ')}`).toBe(true);
      expect(squash(printed.firstPage), 'the cover caption on page 1').toContain(caption);
    });

    test('the paper page still prints on 2 pages', async ({ page }) => {
      for (const route of PAPER_PAGES) {
        await open(page, route);
        const printed = await printPdf(page);
        expect(printed.pages, route).toBe(2);
        expect(squash(printed.text), `${route}: the paper title`).toContain(squash((await page.locator('main h1').textContent()) ?? ''));
      }
    });
  });
});
