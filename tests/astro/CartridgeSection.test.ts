import { describe, expect, it } from 'vitest';
import CartridgeSection from '../../src/components/home/CartridgeSection.astro';
import { t } from '../../src/i18n/utils';
import type { CartridgeProps } from '../../src/lib/projects';
import { renderAstro } from './helpers';

const cartridges: CartridgeProps[] = [
  { href: '/game/research/cog-2026-engagement/', title: '리그 오브 레전드 교전 결과 예측', meta: 'IEEE CoG 2026', tagKeys: ['ml', 'collection'], tags: ['머신러닝', '데이터 수집'], sticker: { text: 'ORAL', sr: '구두 발표', kind: 'oral' }, wide: true },
  { href: '/game/projects/kickick-park/', title: '킥킥파크', meta: 'Python · Tableau', tagKeys: ['cv'], tags: ['컴퓨터 비전'] },
];

describe('CartridgeSection.astro', () => {
  it('section#featured-projects with SELECT YOUR PROJECT label and a more link', async () => {
    const html = await renderAstro(CartridgeSection, {
      props: { variant: 'game', lang: 'ko', cartridges, moreHref: '/game/projects/', moreLabel: '프로젝트 전체 보기' },
    });
    expect(html).toMatch(/<section[^>]*id="featured-projects"[^>]*class="cart-sec sec hud-grid"[^>]*aria-labelledby="featured-projects-title"/);
    // fix round 1: caption-only on the dark band; the Korean title is the visually hidden heading
    expect(html).toMatch(/<h2[^>]*id="featured-projects-title"[^>]*class="sr-only"[^>]*>프로젝트 고르기<\/h2>/);
    expect(html).not.toContain('[ 02 ]'); // D-8: numbers only in the nav
    expect(html).toContain('hud-label__mark');
    expect(html).toContain('SELECT YOUR PROJECT');
    expect(html).toMatch(/<div[^>]*class="cart-grid"/);
    expect(html.match(/<article\b/g) ?? []).toHaveLength(2);
    expect(html).toMatch(/<a[^>]*class="sec-more"[^>]*href="\/game\/projects\/"[^>]*>프로젝트 전체 보기/);
  });

  it('the title is ui section.selectProject.title in the page language', async () => {
    const ko = await renderAstro(CartridgeSection, {
      props: { variant: 'game', lang: 'ko', cartridges, moreHref: '/game/projects/', moreLabel: '프로젝트 전체 보기' },
    });
    expect(ko).toContain(t('ko', 'section.selectProject.title'));
    const en = await renderAstro(CartridgeSection, {
      props: { variant: 'game', lang: 'en', cartridges, moreHref: '/en/game/projects/', moreLabel: 'See all projects' },
    });
    expect(en).not.toContain(t('ko', 'section.selectProject.title'));
    expect(en).toContain(t('en', 'section.selectProject.title'));
    expect(en).toContain('SELECT YOUR PROJECT');
    expect(en).toMatch(/href="\/en\/game\/projects\/"/);
  });
});
