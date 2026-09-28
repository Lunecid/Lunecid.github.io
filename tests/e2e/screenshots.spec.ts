import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { test } from './helpers';

const PAGES = [
  { route: '/', name: 'home' },
  { route: '/projects/', name: 'projects' },
  { route: '/records/', name: 'records' },
  { route: '/player-log/', name: 'player-log' },
] as const;

/** Scrolls the whole page once so lazy images load and client:visible islands hydrate, then returns to the top. */
async function scrollThrough(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const step = Math.max(200, Math.floor(window.innerHeight * 0.8));
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    window.scrollTo(0, 0);
  });
}

for (const { route, name } of PAGES) {
  test(`full-page screenshot ${route}`, async ({ page }, testInfo) => {
    await page.goto(route, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !document.documentElement.hasAttribute('data-intro'));
    await page.evaluate(() => document.fonts.ready.then(() => true));
    await scrollThrough(page);
    await page.waitForLoadState('networkidle');
    const dir = join(process.cwd(), 'test-results', 'screenshots', testInfo.project.name);
    mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: join(dir, `${name}.png`), fullPage: true, animations: 'disabled' });
  });
}
