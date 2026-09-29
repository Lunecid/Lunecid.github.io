import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from './helpers';

test.use({ javaScriptEnabled: false });

const SECTION_LINKS = ['/game/research/', '/game/projects/', '/game/records/', '/game/player-log/'];
const HERO_ART = ['remielle', 'eula'].some((id) => existsSync(join(process.cwd(), 'src', 'assets', 'characters', `${id}.png`)));

test('site is usable without JavaScript at 375px', async ({ page, request }) => {
  await test.step('home: no CRT overlay, nav links visible and reachable, hero art visible when present', async () => {
    const response = await page.goto('/game/');
    expect(response?.status()).toBe(200);
    await expect(page.locator('html')).not.toHaveClass(/(^|\s)js(\s|$)/);
    await expect(page.locator('.crt')).toBeHidden();
    await expect(page.locator('h1')).toBeVisible();
    for (const href of SECTION_LINKS) {
      await expect(page.locator(`#hud-menu a[href="${href}"]`), `nav link ${href}`).toBeVisible();
      expect((await request.get(href)).status(), href).toBe(200);
    }
    if (HERO_ART) await expect(page.locator('.char-stage--hero img.char-stage__img').first()).toBeVisible();
    await expect(page.locator('.char-stage__controls'), 'no swap/replay buttons without JavaScript').toHaveCount(0);
    // Final fix 2 item 17: controls that need JavaScript are not shown (they would do nothing)
    await expect(page.getByRole('button', { name: 'BGM' })).toHaveCount(0);
    await expect(page.locator('[data-motion-toggle]')).toBeHidden();
  });

  await test.step('/game/projects/: all 6 cartridges shown, tag filter hidden', async () => {
    await page.goto('/game/projects/');
    const cards = page.locator('#project-grid [data-tags]');
    await expect(cards).toHaveCount(6);
    for (let i = 0; i < 6; i += 1) await expect(cards.nth(i)).toBeVisible();
    await expect(page.locator('.tag-filter')).toBeHidden();
  });

  await test.step('/game/records/: a certificate link opens the WebP', async () => {
    await page.goto('/game/records/');
    const certificate = page.locator('#awards a[data-cert-id]').first();
    const href = await certificate.getAttribute('href');
    expect(href, 'certificate link href').toMatch(/\.webp$/);
    const image = await request.get(href!);
    expect(image.status(), href!).toBe(200);
    expect(image.headers()['content-type'], href!).toContain('image/webp');
    await certificate.click();
    await expect(page).toHaveURL(/\.webp$/);
  });

  await test.step('/game/research/: a figure 크게 보기 link opens the WebP', async () => {
    await page.goto('/game/research/');
    const figure = page.locator('#interests a[data-viewer="figures"]').first();
    const href = await figure.getAttribute('href');
    expect(href, 'figure link href').toMatch(/\.webp$/);
    const image = await request.get(href!);
    expect(image.status(), href!).toBe(200);
    expect(image.headers()['content-type'], href!).toContain('image/webp');
    await figure.click();
    await expect(page).toHaveURL(/\.webp$/);
  });

  await test.step('/game/research/: the abstract and BibTeX read inline, visible; the (dead-without-JS) toggle buttons are not exposed (fix round 1 item 7, fix round 3 item 3)', async () => {
    await page.goto('/game/research/');
    const abstract = page.locator('#cog-2026-engagement-abstract .pub__abstract').first();
    const bib = page.locator('#cog-2026-engagement-bibtex .bib__code').first();
    await expect(abstract).toBeVisible();
    await expect(bib).toBeVisible();
    // Fix round 3 item 3: without JS, disclosure-trigger.ts never attaches a click handler, so these buttons
    // would otherwise sit there doing nothing next to content that is already fully visible. They are hidden
    // entirely (display: none) instead of exposed-but-dead — display:none removes them from the accessibility
    // tree, so getByRole('button', ...) finds none of them anywhere on the page. A no-JS-only caption above each
    // panel (.pub__panel-label) replaces the label the (now hidden) toggle button would otherwise have given it.
    await expect(page.getByRole('button', { name: '초록' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'BibTeX' })).toHaveCount(0);
    await expect(page.locator('#cog-2026-engagement-abstract .pub__panel-label').first()).toBeVisible();
    await expect(page.locator('#cog-2026-engagement-bibtex .pub__panel-label').first()).toBeVisible();
  });

  await test.step('/game/player-log/: the showcase <noscript> copy is visible', async () => {
    await page.goto('/game/player-log/');
    await expect(page.locator('#favorite-games noscript > *').first()).toBeVisible();
    // innerText counts only rendered text: with JS on, the <noscript> body is not rendered.
    // .fg__title (FavoriteGames.css) is text-transform: uppercase, so the rendered case differs from
    // the raw "Zenless Zone Zero" in src/data/favorites.yaml — innerText reflects the CSS-applied case.
    await expect(page.locator('#favorite-games')).toContainText('ZENLESS ZONE ZERO', { useInnerText: true });
    // Final fix 2 item 17: no dead tabs, and every favourite's text is readable (the Genshin text was behind a tab)
    await expect(page.getByRole('tab')).toHaveCount(0);
    await expect(page.locator('#favorite-games')).toContainText('GENSHIN IMPACT', { useInnerText: true });
    const copies = page.locator('#favorite-games .fg__copy--static');
    await expect(copies).toHaveCount(2);
    for (const copy of await copies.all()) await expect(copy).toBeVisible();
    // round 2 item 5: without the tabs the stage is a plain region (no tab panel, tab stop or name from a hidden tab)
    const stage = page.locator('#favorite-games .fg__stage');
    await expect(stage).not.toHaveAttribute('role', /.+/);
    await expect(stage).not.toHaveAttribute('tabindex', /.+/);
    await expect(stage).not.toHaveAttribute('aria-labelledby', /.+/);
    await expect(page.getByRole('tabpanel')).toHaveCount(0);
  });

  await test.step('/game/player-log/: site achievements show no hints, progress or storage note, only the no-JS line; no heading named ??? (P-02)', async () => {
    await page.goto('/game/player-log/');
    const list = page.locator('#site-achievements');
    for (const sel of ['.site-ach__hint', '.site-ach__desc--hint', '.site-ach__progress', '.site-ach__note']) {
      for (const el of await list.locator(sel).all()) await expect(el, sel).toBeHidden();
    }
    await expect(list.locator('.site-ach__nojs')).toBeVisible();
    await expect(list.locator('.site-ach__nojs')).toHaveText('JavaScript를 켜면 업적이 기록됩니다.');
    await expect(page.getByRole('heading', { name: '???', exact: true })).toHaveCount(0);
    await expect(list.getByRole('heading', { name: '숨은 업적, 달성하면 제목이 공개됩니다', exact: true })).toHaveCount(1);
  });
});
