import { test, expect, builtRoutes } from './helpers';

// Spec §4.3 / §12: no game vocabulary on general pages, in any channel a person or a machine reads (Review Focus 3).
const GAME_VOCAB: readonly (readonly [string, RegExp])[] = [
  ['PLAYER', /PLAYER/],
  ['PATCH NOTES', /PATCH NOTES/],
  ['SELECT YOUR', /SELECT YOUR/],
  ['GAME OVER', /GAME OVER/],
  ['MODE', /\bMODE\b/],
  ['[ ■ ]', /\[\s*■?\s*\]/],
  ['게임 팀에게', /게임 팀에게/],
  ['For game teams', /For game teams/i],
  ['QUEST LOG', /QUEST LOG/],
  ['INVENTORY', /INVENTORY/],
  ['NOW PLAYING', /NOW PLAYING/],
  ['MAIN MENU', /MAIN MENU/],
  ['ACHIEVEMENT', /ACHIEVEMENT/],
  ['CONTINUE?', /CONTINUE\?/],
  ['Player Log', /Player Log|플레이 로그/],
  ['game identity', /GAME DATA ANALYST|Game Data Analyst|게임 데이터 분석가/],
];
// Page-level channels only (<title>, <meta> contents): they describe the general version, so they also avoid the
// game framing of the common page meta ("게임 로그로 플레이어의 …" / "… from game logs"). Body text may still name
// the paper's subject where it is a fact.
const META_VOCAB: readonly (readonly [string, RegExp])[] = [['게임 로그 / game logs', /게임 로그|\bgame logs?\b/i]];
// Review Focus 1: classes of the HUD (hud.css) and light-HUD (read.css) looks, of the game modules and of the game's
// Miku watermark (GhostArt, site-v1 6d729ec).
const HUD_CLASSES = [
  'hud-grid', 'hud-label', 'hud-label__mark', 'hud-nav', 'sec', 'sec-head', 'sec-more', 'cut', 'cut--line', 'btn', 'btn--fill', 'btn--line',
  'bracket', 'bracket--sm', 'badge', 'badge--tier', 'lh-rows', 'lh-row', 'lh-idx', 'lh-table', 'lh-frame', 'lh-chips', 'lh-chip', 'lh-tag',
  'read', 'read-sec', 'read-section', 'read-column', 'cart', 'cart-grid', 'mm-sec', 'pn', 'player-card', 'crt', 'bgm', 'ach-toast', 'ghost-art',
];
// ImageViewer's buttons carry `cut cut--line` only while open (src/islands/ImageViewer.tsx). On general pages editorial.css
// (Task 6) removes the cut pseudo-elements and draws an ink border, so the viewer does not depend on hud.css. The class
// itself stays until P-11 touches the island. The sweep below checks closed pages; the open viewer has its own test.
const NAVY = 'rgb(30, 58, 138)';
const LINK_COLOURS = [NAVY, 'rgb(20, 20, 20)', 'rgb(255, 255, 255)']; // accent, ink, text on the filled button

const routes = builtRoutes({ variant: 'data' });

test('there are general pages to sweep', () => {
  expect(routes.length).toBeGreaterThan(0);
});

test.describe('no GhostArt at 1920 px', () => {
  // GhostArt (site-v1 6d729ec) draws the game's grey Miku art in the side margins from 1600 px on; its four hosts are
  // shared components, so this checks every general page at a width where the game pages show it (Review Focus 1).
  test.use({ viewport: { width: 1920, height: 1080 } });

  test('no general page renders the game version\'s Miku watermark or requests its image', async ({ page }) => {
    const requested: string[] = [];
    page.on('request', (request) => { if (/miku/i.test(request.url())) requested.push(request.url()); });
    for (const route of routes) {
      await page.goto(route, { waitUntil: 'networkidle' });
      expect(await page.locator('[data-ghost-art], .ghost-art').count(), route).toBe(0);
    }
    expect(requested).toEqual([]);
  });
});

test('the open image viewer on a general page is ink on white without hud.css (Task 6 re-colour)', async ({ page }) => {
  await page.goto('/data/projects/school-zone-blindspots/', { waitUntil: 'networkidle' });
  await page.locator('#details [data-viewer="certificates"]').click();
  const close = page.locator('dialog.image-viewer[open] .image-viewer__close');
  await expect(close).toBeVisible();
  const look = await close.evaluate((el) => {
    const s = getComputedStyle(el);
    return { width: s.borderTopWidth, colour: s.borderTopColor, bg: s.backgroundColor, before: getComputedStyle(el, '::before').content };
  });
  expect(look).toEqual({ width: '1px', colour: 'rgb(20, 20, 20)', bg: 'rgb(255, 255, 255)', before: 'none' });
});

for (const route of routes) {
  test(`${route}: no game vocabulary in text, sr-only text, attributes, meta, the title or JSON-LD`, async ({ page }) => {
    await page.goto(route, { waitUntil: 'networkidle' });
    const channels = await page.evaluate(() => {
      const text: string[] = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (node.parentElement?.closest('script, style, template')) continue;
        text.push(node.textContent ?? '');
      }
      const names = ['aria-label', 'title', 'alt', 'placeholder', 'data-label-open', 'data-label-closed'];
      const attrs: string[] = [];
      for (const el of Array.from(document.querySelectorAll('*'))) for (const name of names) {
        const value = el.getAttribute(name);
        if (value) attrs.push(value);
      }
      return {
        text: text.join(' '),
        attributes: attrs.join(' | '),
        meta: Array.from(document.querySelectorAll('meta[content]')).map((m) => m.getAttribute('content') ?? '').join(' | '),
        jsonLd: Array.from(document.querySelectorAll('script[type="application/ld+json"]')).map((s) => s.textContent ?? '').join(' '),
        title: document.title,
      };
    });
    const hits = Object.entries(channels).flatMap(([channel, value]) =>
      [...GAME_VOCAB, ...(channel === 'meta' || channel === 'title' ? META_VOCAB : [])]
        .filter(([, re]) => re.test(value))
        .map(([word]) => `${channel}: ${word}`),
    );
    expect(hits).toEqual([]);
  });

  test(`${route}: every link outside a sentence has a 44×44 target (a .hit ::after counts)`, async ({ page }) => {
    await page.goto(route, { waitUntil: 'networkidle' });
    const small = await page.locator('main').evaluate((main) => {
      const hits: string[] = [];
      for (const a of Array.from(main.querySelectorAll<HTMLAnchorElement>('a[href]'))) {
        const box = a.getBoundingClientRect();
        if (box.width === 0 || box.height === 0) continue;
        // WCAG 2.5.8 inline exception: a link inside a sentence (its parent p/li also holds other text).
        const parent = a.parentElement;
        if (parent && (parent.tagName === 'P' || parent.tagName === 'LI') && (parent.textContent ?? '').trim() !== (a.textContent ?? '').trim()) continue;
        // .hit (base.css) draws a centred ::after of at least --tap × --tap over the link.
        const after = a.classList.contains('hit') ? getComputedStyle(a, '::after') : null;
        const w = Math.max(box.width, after ? parseFloat(after.width) || 0 : 0);
        const h = Math.max(box.height, after ? parseFloat(after.height) || 0 : 0);
        if (w < 43.5 || h < 43.5) hits.push(`${a.getAttribute('class') ?? 'a'} ${a.getAttribute('href')}: ${Math.round(w)}×${Math.round(h)}`);
      }
      return hits.slice(0, 10);
    });
    expect(small).toEqual([]);
  });

  test(`${route}: no HUD class, a light scheme, links in navy or ink, focus rings in navy`, async ({ page }) => {
    await page.goto(route, { waitUntil: 'networkidle' });
    const classes = await page.evaluate((hud) => {
      const hits = new Set<string>();
      for (const el of Array.from(document.body.querySelectorAll('*'))) for (const c of hud) if (el.classList.contains(c)) hits.add(c);
      return [...hits];
    }, HUD_CLASSES);
    expect(classes).toEqual([]);
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe('light');
    const offColour = await page.evaluate((allowed) => {
      return Array.from(document.querySelectorAll('a[href]'))
        .filter((a) => {
          const r = a.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        })
        .map((a) => ({ label: `${a.getAttribute('class') ?? 'a'} ${a.getAttribute('href')}`, colour: getComputedStyle(a).color }))
        .filter((l) => !allowed.includes(l.colour))
        .map((l) => `${l.label}: ${l.colour}`);
    }, LINK_COLOURS);
    expect(offColour).toEqual([]);
    for (let i = 0; i < 8; i += 1) {
      await page.keyboard.press('Tab');
      const outline = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        return el && el !== document.body ? getComputedStyle(el).outlineColor : null;
      });
      if (outline !== null) expect(outline, `focus stop ${i + 1}`).toBe(NAVY);
    }
  });
}
