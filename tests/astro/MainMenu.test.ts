import { describe, expect, it } from 'vitest';
import MainMenu from '../../src/components/hud/MainMenu.astro';
import { mainMenuCopy } from '../../src/data/copy/hero';
import type { StageCharacter } from '../../src/islands/CharacterStage';
import { resolveDeep } from '../../src/lib/facts';
import { pageHref } from '../../src/lib/links';
import { loadFactSource } from '../helpers/fact-source';
import { readSource, renderAstro } from './helpers';

const EULA: StageCharacter = {
  id: 'eula',
  label: '유라 · 원신',
  image: {
    src: '/_astro/eula.webp',
    srcSet: '/_astro/eula-400.webp 400w, /_astro/eula-1040.webp 1040w',
    sizes: '(min-width: 1068px) 520px, 42vw',
    width: 1600,
    height: 937,
  },
  objectPosition: '50% 8%',
};

function props(lang: 'ko' | 'en', side: StageCharacter[] = []): Record<string, unknown> {
  const copy = resolveDeep(mainMenuCopy[lang], lang, loadFactSource());
  // As HomeView builds them (P1-11): the game version's links.
  return { variant: 'game', lang, items: copy.items.map((item) => ({ ...item, href: pageHref(item.href, { lang, variant: 'game' }) })), hint: copy.hint, side };
}

describe('MainMenu.astro', () => {
  it('section#main-menu with a nav labelled by the MAIN MENU heading', async () => {
    const html = await renderAstro(MainMenu, { props: props('ko') });
    expect(html).toMatch(/<section id="main-menu" class="mm-sec hud-grid mm-sec--no-art"/);
    // D-8 + fix round 1: caption-only as in the v4 mockup ("[ ■ ] MAIN MENU"); the title is the visually hidden
    // heading; the menu rows keep the nav's own 01-04 numbers.
    expect(html).toMatch(/<header class="sec-head sec-head--caption"[^>]*>\s*<h2 id="main-menu-title" class="sr-only"[^>]*>사이트 메뉴<\/h2>\s*<p class="hud-label" aria-hidden="true"[^>]*><span class="hud-label__mark"[\s\S]*?MAIN MENU<\/span><\/p>/);
    expect(html).toMatch(/<nav class="mm" aria-labelledby="main-menu-title" data-main-menu/);
  });

  it('the title is ui section.mainMenu.title in the page language; the caption stays MAIN MENU', async () => {
    const ko = await renderAstro(MainMenu, { props: props('ko') });
    expect(ko).toMatch(/<h2[^>]*class="sr-only"[^>]*>사이트 메뉴<\/h2>/);
    const en = await renderAstro(MainMenu, { props: props('en'), url: '/en/game/' });
    expect(en).toMatch(/<h2[^>]*class="sr-only"[^>]*>Site menu<\/h2>/);
    expect(en).toMatch(/<span class="hud-label__en" lang="en"[^>]*>MAIN MENU<\/span>/);
  });

  it('4 links in an ordered list, first data-selected', async () => {
    const html = await renderAstro(MainMenu, { props: props('en'), url: '/en/game/' });
    expect(html).toMatch(/<ol class="mm__list" role="list"/);
    const hrefs = [...html.matchAll(/<a class="mm__link" href="([^"]+)"/g)].map((m) => m[1]);
    expect(hrefs).toEqual(['/en/game/research/', '/en/game/projects/', '/en/game/records/', '/en/game/player-log/']);
    const items = html.match(/<li class="mm__item"[^>]*>/g) ?? [];
    expect(items).toHaveLength(4);
    expect(items[0]).toContain('data-selected');
    expect(items.slice(1).some((tag) => tag.includes('data-selected'))).toBe(false);
    // F-029: caption is middot nowrap units; visible text stays the same.
    expect(html).toMatch(/mm__cap-part[^>]*>League of Legends engagement prediction ·</);
    expect(html).toMatch(/mm__cap-part[^>]*>PUBG survival model</);
    expect(html).not.toContain('aria-current'); // ▶ is data-selected, not the current page
  });

  it('side stage only when side is given; it sits inside the HUD container (next to the menu on wide screens)', async () => {
    const without = await renderAstro(MainMenu, { props: props('ko') });
    expect(without).not.toContain('<astro-island');
    const withSide = await renderAstro(MainMenu, { props: props('ko', [EULA]) });
    expect(withSide).toMatch(/<section id="main-menu" class="mm-sec hud-grid mm-sec--art"/);
    expect(withSide).toMatch(/<astro-island[^>]*client="visible"/);
    expect(withSide).toContain('class="char-stage char-stage--side"');
    expect(withSide).toContain('data-phase="idle"');
    expect(withSide).not.toContain('char-stage__streak'); // one effect per section: no streaks on the menu stage
    const inner = withSide.indexOf('class="container container--hud mm-sec__inner"');
    expect(inner).toBeGreaterThan(-1);
    expect(withSide.indexOf('<astro-island')).toBeGreaterThan(inner);
    expect(withSide.indexOf('<astro-island')).toBeLessThan(withSide.lastIndexOf('</div>'));
  });

  it('D-1 no art: rows span the full width with the caption on the right; with art the menu keeps 58% / 62%', () => {
    // Whitespace-tolerant CSS intent (not exact formatting / media-block delimiters).
    const src = readSource('src/components/hud/MainMenu.astro').replace(/\s+/g, ' ');
    expect(src).toMatch(/\.mm-sec--art \.mm\s*\{\s*width:\s*58%/);
    expect(src).toMatch(/\.mm-sec--art \.mm\s*\{\s*width:\s*62%/);
    expect(src).toMatch(/\.mm-sec--no-art \.mm__link\s*\{[^}]*grid-template-columns:\s*28px 48px max-content minmax\(0,\s*1fr\)/);
    expect(src).toMatch(/\.mm-sec--no-art \.mm__link\s*\{[^}]*grid-template-areas:\s*"ptr num title cap"/);
    expect(src).toMatch(/\.mm-sec--no-art \.mm__cap\s*\{[^}]*text-align:\s*right/);
    expect(src).toMatch(/\.mm-sec--no-art \.mm__link\s*\{[^}]*grid-template-columns:\s*28px 52px max-content minmax\(0,\s*1fr\)/);
    expect(src).not.toMatch(/\.mm-sec--no-art \.mm\s*\{\s*width:/);
  });

  it('hint is aria-hidden', async () => {
    const html = await renderAstro(MainMenu, { props: props('ko') });
    expect(html).toMatch(/<p class="mm__hint" aria-hidden="true"[^>]*>↑↓ 이동 · Enter 선택 · 마우스 클릭도 가능<\/p>/);
    expect(html).toMatch(/<span class="mm__ptr" aria-hidden="true"[^>]*>▶<\/span>/);
  });

  it('P2-5: hovering a row while keyboard focus is elsewhere in the menu moves focus there too (one cursor, not two)', () => {
    const src = readSource('src/components/hud/MainMenu.astro').replace(/\s+/g, ' ');
    expect(src).toMatch(/pointerenter[\s\S]*select\(index\)[\s\S]*nav\.contains\(document\.activeElement\)[\s\S]*link\.focus\(\{\s*preventScroll:\s*true\s*\}\)/);
  });

  it('P2-5: the selected-row frame is drawn on two clipped layers (like .cut--line), not border + clip-path', () => {
    const src = readSource('src/components/hud/MainMenu.astro').replace(/\s+/g, ' ');
    expect(src).not.toMatch(/\.mm__item\[data-selected\]\s*\.mm__link::before\s*\{[^}]*border-color/);
    expect(src).toMatch(/\.mm__link::before,\s*\.mm__link::after\s*\{/);
    expect(src).toMatch(/\.mm__link::after\s*\{[^}]*--mm-ci:\s*calc\(var\(--cut-row\)\s*-\s*\.59px\)/);
    expect(src).toMatch(/\.mm__item\[data-selected\]\s*\.mm__link::before\s*\{[^}]*background:\s*var\(--hud-line-strong\)/);
    expect(src).toMatch(
      /\.mm__item\[data-selected\]\s*\.mm__link::after\s*\{[^}]*background:\s*linear-gradient\(90deg,\s*var\(--accent-wash-12\),\s*transparent\),\s*var\(--hud-bg\)/,
    );
  });
});
