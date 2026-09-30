import type { Page } from '@playwright/test';
import { test, expect } from './helpers';

// G-015 (P-11): the type tokens are rem, so the browser's default font size scales the text. The larger default is set
// the way a reader sets it: Chromium's own default-font-size preference (Settings > Appearance > Font size), through
// the DevTools protocol's Page.setFontSizes on the page's target before navigation. Not an injected `html { font-size }`:
// that would be the page's own style, not the browser setting the audit (G-015) is about.

const ROUTES = ['/game/', '/data/', '/game/records/', '/data/records/', '/privacy/'];
const WIDTHS = [1280, 375];
// Text that is 17px through a px literal, not --fs-body: the F-030 baseline (tests/unit/style-rules.test.ts,
// PX_FONT_BASELINE) still lists these; they scale once they move to a token.
const PX_LITERAL_17 = ['.pn__title', '.jobfit__req'];

async function withDefaultFontSize(page: Page, px: number): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Page.setFontSizes', { fontSizes: { standard: px, fixed: Math.round((px * 13) / 16) } });
}

async function open(page: Page, route: string): Promise<void> {
  await page.goto(route, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready.then(() => true));
}

/** Font sizes (px) of the root, the body and every element in <main> that holds text of its own, in document order. */
async function sizes(page: Page, skip: string[] = []): Promise<{ root: number; body: number; text: number[]; labels: string[] }> {
  return page.evaluate((skip) => {
    const px = (el: Element) => parseFloat(getComputedStyle(el).fontSize);
    const els = [...document.querySelectorAll('main *')].filter((el) =>
      [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim() !== '') && !skip.some((sel) => el.closest(sel)),
    );
    const labels = els.map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`);
    return { root: px(document.documentElement), body: px(document.body), text: els.map(px), labels };
  }, skip);
}

for (const width of WIDTHS) {
  for (const route of ROUTES) {
    test(`G-015: body text doubles with a 32px browser default font (${route} at ${width}px)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await open(page, route);
      const normal = await sizes(page, PX_LITERAL_17);
      expect(normal.root, 'the 16px default').toBe(16);
      expect(normal.body, 'body text is --fs-body, 17px at the default').toBe(17);

      await withDefaultFontSize(page, 32);
      await open(page, route);
      const doubled = await sizes(page, PX_LITERAL_17);
      expect(doubled.root, 'the browser default font size took effect').toBe(32);
      expect(doubled.body).toBe(34);
      // Every text element in <main> set in body text at the default is doubled too. Elements are matched by tag and
      // class (a page can render a few elements more or fewer on a second load), over the labels that are body text
      // wherever they occur.
      const bodyLabels = [...new Set(normal.labels)].filter((label) => normal.labels.every((l, i) => l !== label || normal.text[i] === 17));
      expect(bodyLabels.length, `${route} has body text in <main>`).toBeGreaterThan(0);
      const after = doubled.labels.flatMap((label, i) => (bodyLabels.includes(label) ? [`${label} ${doubled.text[i]}`] : []));
      expect(after.length).toBeGreaterThan(0);
      expect(after).toEqual(after.map((x) => x.replace(/ [\d.]+$/, ' 34')));
    });
  }
}
