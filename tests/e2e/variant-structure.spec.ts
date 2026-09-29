// Spec §4.3, §5.3, §12 (P1-18): on every data page no game-module trace; on every data and neutral page no ghost art
// (contract §1.8, characterArt); every version page links only its own version
// (plus shared pages, the chooser, documents and the version switch); both versions share the skeleton (section ids)
// apart from module-owned ids; the route table and dist agree.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { Page } from '@playwright/test';
import { test, expect, builtRoutes, sectionIds, legacyPaths, routeOf, collectProblems } from './helpers';
import { DOCUMENTS } from '../../src/config';
import { ANCHOR_MODULES, allRoutes, parseRoute, variantBasePaths } from '../../src/lib/routes';
import { SHARED_PATHS } from '../../src/variants/ids';

/** = STUB_MARKER of scripts/redirects/build.mjs (tests/unit/redirect-stubs.test.ts pins it there). */
const STUB_MARKER = 'data-legacy-redirect';

const DIST = join(process.cwd(), 'dist');
const MODULE_OWNED = new Set(Object.keys(ANCHOR_MODULES));
const DOCS: readonly string[] = Object.values(DOCUMENTS);
const SHARED = new Set(['ko', 'en'].flatMap((lang) => SHARED_PATHS.map((p) => (lang === 'en' ? `/en${p}` : p))));
const CHOOSER = new Set(['/', '/en/', '/?choose', '/en/?choose']);

test.describe('§4.3: no game-module trace on data pages', () => {
  for (const route of builtRoutes({ variant: 'data' })) {
    test(route, async ({ page }) => {
      const problems = collectProblems(page);
      await page.goto(route, { waitUntil: 'networkidle' });
      await expect(page.locator('html')).toHaveAttribute('data-variant', 'data');
      expect(await page.locator('html').getAttribute('data-sfx')).toBeNull();
      for (const selector of [
        '.crt', '.ach-toast-region', '.bgm', '#main-menu', '#for-game-teams', '#favorite-games', '#membership',
        // P1-9b component root markers (server-rendered since P1-9b; an astro-island selector could never match them).
        '[data-achievement-host]', '[data-bgm-toggle]',
        'astro-island[component-url*="CharacterStage"]', 'astro-island[component-url*="FavoriteGames"]',
        'a[href$="/player-log/"]',
      ]) {
        await expect(page.locator(selector), `${route} ${selector}`).toHaveCount(0);
      }
      expect(problems, problems.join('\n')).toEqual([]);
    });
  }

  test('a certificate opened on /data/records/ with sound on plays nothing and unlocks nothing', async ({ page }) => {
    const audio: string[] = [];
    page.on('request', (req) => { if (req.url().includes('/audio/')) audio.push(req.url()); });
    await page.goto('/data/records/');
    await page.evaluate(() => localStorage.setItem('sb:sound', 'on'));
    await page.reload({ waitUntil: 'networkidle' });
    // Since site-v1 2ad74ff only a[href][data-viewer] is intercepted; a certificate trigger is data-viewer="certificates".
    const cert = page.locator('a[data-viewer="certificates"]').first();
    await cert.click();
    await expect(page.locator('dialog[open]')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/\/data\/records\/$/); // the viewer's history entry is popped
    await page.waitForTimeout(500);
    expect(audio).toEqual([]);
    expect(await page.evaluate(() => localStorage.getItem('sb:achievements'))).toBeNull();
  });

  test('a figure opened on /data/research/ with sound on plays nothing and unlocks nothing', async ({ page }) => {
    const audio: string[] = [];
    page.on('request', (req) => { if (req.url().includes('/audio/')) audio.push(req.url()); });
    await page.goto('/data/research/');
    await page.evaluate(() => localStorage.setItem('sb:sound', 'on'));
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('a[data-viewer="figures"]').first().click();
    await expect(page.locator('dialog[open]')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    expect(audio).toEqual([]);
    expect(await page.evaluate(() => localStorage.getItem('sb:achievements'))).toBeNull();
  });

  test('a stored BGM resume position loads no BGM on /data/', async ({ page }) => {
    const bgm: string[] = [];
    page.on('request', (req) => { if (req.url().includes('/audio/bgm')) bgm.push(req.url()); });
    await page.goto('/data/');
    await page.evaluate(() => {
      localStorage.setItem('sb:sound', 'on'); // the BGM on/off state lives in sb:sound (src/lib/sound.ts)
      sessionStorage.setItem('sb:bgm-t', JSON.stringify({ t: 12, at: Date.now() }));
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    expect(bgm).toEqual([]);
  });
});

/** The ghost art's image (src/assets/ghost/miku-v6.webp, site-v1 6d729ec) keeps its basename in every built URL. */
const GHOST_IMAGE = /miku-v6/i;

test.describe('§1.8: no ghost art on data or neutral pages (characterArt), 2560 × 1440 @ 1.5', () => {
  test.use({ viewport: { width: 2560, height: 1440 }, deviceScaleFactor: 1.5 });
  // Data routes, the chooser and the shared pages (variant null), and the neutral 404 (P1-16).
  for (const route of [...builtRoutes({ variant: 'data' }), ...builtRoutes({ variant: null }), '/404.html']) {
    test(route, async ({ page }) => {
      const requests: string[] = [];
      page.on('request', (req) => { if (GHOST_IMAGE.test(req.url())) requests.push(req.url()); });
      const response = await page.goto(route, { waitUntil: 'networkidle' });
      const html = (await response?.text()) ?? '';
      expect(html, `${route}: ghost-art in the served HTML`).not.toContain('ghost-art');
      expect(html, `${route}: the ghost image in the served HTML`).not.toMatch(GHOST_IMAGE);
      await expect(page.locator('[data-ghost-art]'), route).toHaveCount(0);
      expect(requests, `${route} requested ${requests.join(', ')}`).toEqual([]);
    });
  }
});

test.describe('§12: every version page links only its own version (links anywhere in the document)', () => {
  for (const route of builtRoutes({ kind: 'variant' })) {
    test(route, async ({ page }) => {
      const own = parseRoute(route)!.variant!;
      await page.goto(route);
      const hrefs = await page.locator("a[href^='/']:not([data-switch-variant])").evaluateAll((as) => as.map((a) => a.getAttribute('href') ?? ''));
      const stray = hrefs.filter((href) => {
        if (href.startsWith('//')) return false;
        // Built assets are no version page: the no-JS target of an a[href][data-viewer] trigger is its /_astro/ WebP.
        if (href.startsWith('/_astro/')) return false;
        const path = href.split('#')[0] ?? '';
        if (CHOOSER.has(path) || SHARED.has(path) || DOCS.includes(path)) return false;
        return !(path.startsWith(`/${own}/`) || path.startsWith(`/en/${own}/`));
      });
      expect(stray, `${route} links outside the ${own} version`).toEqual([]);
      const toStubs = hrefs.filter((href) => legacyPaths().includes(href.split('#')[0] ?? ''));
      expect(toStubs, `${route} links a redirect stub`).toEqual([]);
    });
  }
});

test.describe('§5.3: both versions share the skeleton (section ids and their order), module-owned ids aside', () => {
  /** Spec §5.3 skeleton = page list, section ORDER and anchor ids: the ids of main's sections in DOM order. */
  const domOrder = (page: Page): Promise<string[]> => page.locator('main section[id]').evaluateAll((els) => els.map((el) => el.id));
  for (const lang of ['ko', 'en'] as const) {
    for (const base of variantBasePaths('data')) {
      test(`${lang} ${base}`, async ({ page }) => {
        await page.goto(routeOf(base, { lang, variant: 'game' }), { waitUntil: 'networkidle' });
        const game = (await sectionIds(page)).filter((id) => !MODULE_OWNED.has(id));
        const gameOrder = (await domOrder(page)).filter((id) => !MODULE_OWNED.has(id));
        await page.goto(routeOf(base, { lang, variant: 'data' }), { waitUntil: 'networkidle' });
        const data = await sectionIds(page);
        const dataOrder = await domOrder(page);
        expect(data).toEqual(game); // the same set of ids (sectionIds sorts)
        expect(dataOrder, 'section order').toEqual(gameOrder); // and the same order
        expect(gameOrder.length, 'the page has sections').toBeGreaterThan(0);
      });
    }
  }
});

test('§12: the route table and dist agree (every route built; every page file a route, a stub, a print page or the 404)', () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
  for (const route of allRoutes()) expect(existsSync(join(DIST, route, 'index.html')), route).toBe(true);
  const routes = new Set(allRoutes());
  const extra = walk(DIST)
    .filter((f) => f.endsWith('.html'))
    .map((f) => ({ file: f, route: `/${relative(DIST, f).split(sep).join('/').replace(/index\.html$/, '')}` }))
    .filter((p) => p.route !== '/404.html' && !p.route.startsWith('/print/') && !readFileSync(p.file, 'utf8').includes(STUB_MARKER))
    .filter((p) => !routes.has(p.route))
    .map((p) => p.route);
  expect(extra).toEqual([]);
});
