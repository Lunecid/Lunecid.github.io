import { describe, expect, it } from 'vitest';
import ProjectCartridge from '../../src/components/projects/ProjectCartridge.astro';
import cover from '../../src/assets/projects/kickick-park/parking-stand-detection.webp';
import type { CartridgeProps } from '../../src/lib/projects';
import { readSource, renderAstro } from './helpers';

const base: CartridgeProps = {
  href: '/game/projects/kickick-park/',
  title: '킥킥파크',
  meta: 'Python · Tableau',
  tagKeys: ['cv', 'web', 'gamification', 'viz'],
  tags: ['컴퓨터 비전', '웹 서비스', '게이미피케이션', '시각화'],
};

describe('ProjectCartridge.astro', () => {
  it('whole card is one link with the title', async () => {
    const html = await renderAstro(ProjectCartridge, { props: { ...base } }); // spread: an interface is not a Record<string, unknown>
    expect(html.match(/<a\b/g) ?? []).toHaveLength(1);
    expect(html).toMatch(/<a class="cart__link" href="\/game\/projects\/kickick-park\/"[^>]*>킥킥파크<\/a>/);
    expect(html).toMatch(/<h3[^>]*class="cart__title"/);
    expect(html).toMatch(/<p[^>]*class="cart__meta"[^>]*>Python · Tableau<\/p>/);
  });

  it('without href (a card-only project, D-4) the card is plain text with its summary and no lift', async () => {
    const { href: _href, ...rest } = base;
    const html = await renderAstro(ProjectCartridge, { props: { ...rest, summary: '한 줄 요약입니다.' } });
    expect(html).not.toMatch(/<a\b/);
    expect(html).toMatch(/<article[^>]*class="cart cart--static"/);
    expect(html).toMatch(/<h3[^>]*class="cart__title"[^>]*>킥킥파크<\/h3>/);
    expect(html).toMatch(/<p[^>]*class="cart__summary"[^>]*>한 줄 요약입니다\.<\/p>/);
    // a linked card never shows the summary (its page does)
    const linked = await renderAstro(ProjectCartridge, { props: { ...base, summary: '숨김' } });
    expect(linked).not.toContain('cart__summary');
  });

  it('at most 4 tags', async () => {
    const html = await renderAstro(ProjectCartridge, {
      props: { ...base, tags: [...base.tags, '데이터 수집'], tagKeys: [...base.tagKeys, 'collection'] },
    });
    expect(html.match(/<li\b/g) ?? []).toHaveLength(4);
    expect(html).not.toContain('데이터 수집');
  });

  it('data-tags carries tag keys', async () => {
    const html = await renderAstro(ProjectCartridge, { props: { ...base } }); // spread: an interface is not a Record<string, unknown>
    expect(html).toMatch(/<article[^>]*class="cart"[^>]*data-tags="cv web gamification viz"/);
  });

  it('sticker text with sr-only text', async () => {
    const html = await renderAstro(ProjectCartridge, {
      props: { ...base, sticker: { text: 'ORAL', sr: '구두 발표', kind: 'oral' }, wide: true, headingLevel: 2 },
    });
    expect(html).toMatch(/<p[^>]*class="cart__sticker cart__sticker--oral"/);
    expect(html).toMatch(/<span[^>]*lang="en"[^>]*>ORAL<\/span>/);
    expect(html).toMatch(/<span[^>]*class="sr-only"[^>]*> 구두 발표<\/span>/);
    expect(html).toMatch(/<article[^>]*class="cart cart--wide"/);
    expect(html).toMatch(/<h2[^>]*class="cart__title"/);
    const award = await renderAstro(ProjectCartridge, { props: { ...base, sticker: { text: '최우수상', kind: 'award' } } });
    expect(award).toMatch(/cart__sticker--award/);
    expect(award).not.toContain('sr-only');
  });

  it('P1-6: without a real figure, a HUD plate from the project metadata (ID, period, first tag), never a drawn chart', async () => {
    const html = await renderAstro(ProjectCartridge, {
      props: { ...base, plate: { id: 'KBO-ATTENDANCE', period: '2025.03 – 2025.06', tag: '통계' } },
    });
    expect(html).toMatch(/class="cart__label cart__label--text"/);
    expect(html).not.toMatch(/<img\b/);
    expect(html).toMatch(/<div[^>]*class="cart__plate"[^>]*aria-hidden="true"/);
    expect(html).toMatch(/<span class="cart__plate-id" lang="en"[^>]*>KBO-ATTENDANCE<\/span>/);
    expect(html).toMatch(/<span class="cart__plate-period"[^>]*>2025\.03 – 2025\.06<\/span>/);
    expect(html).toMatch(/<span class="cart__plate-tag"[\s\S]*?통계\s*<\/span>/);
    // the only SVG is the tag icon: a path and a dot, no data marks (bars, polylines, scatter)
    const svgs = html.match(/<svg[\s\S]*?<\/svg>/g) ?? [];
    expect(svgs).toHaveLength(1);
    expect(svgs[0]).not.toMatch(/<(rect|polyline|line)\b/);
    expect(svgs[0]!.match(/<circle\b/g)).toHaveLength(1);
  });

  it('P1-6: a chart cover is drawn whole on a white plate; a stickered figure starts under the sticker band', async () => {
    const contained = await renderAstro(ProjectCartridge, { props: { ...base, cover, coverFit: 'contain', sticker: { text: 'ORAL', sr: '구두 발표', kind: 'oral' } } });
    expect(contained).toMatch(/<img[^>]*class="cart__img cart__img--contain cart__img--stickered"/);
    const plain = await renderAstro(ProjectCartridge, { props: { ...base, cover } });
    expect(plain).toMatch(/<img[^>]*class="cart__img"/);
    const src = readSource('src/components/projects/ProjectCartridge.astro');
    expect(src).toMatch(/\.cart__img--contain\) \{ object-fit: contain;/);
    expect(src).toMatch(/\.cart__img--stickered\) \{ padding-top: 28px;/);
  });

  it('P2-23: English award words wrap to two lines within 9em and stay inside the card', () => {
    const src = readSource('src/components/projects/ProjectCartridge.astro');
    expect(src).toMatch(/\.cart__sticker--award:lang\(en\) \{[^}]*max-width: 9em; white-space: normal;[^}]*right: 6px;/);
  });

  it('a cover renders a decorative sized image', async () => {
    const html = await renderAstro(ProjectCartridge, { props: { ...base, cover } });
    expect(html).not.toContain('cart__label--text');
    // Astro serializes alt="" as a bare `alt` attribute (same meaning: decorative image)
    expect(html).toMatch(/<img[^>]*\salt(?:="")?[\s>]/);
    expect(html).not.toMatch(/<img[^>]*\salt="[^"]+"/);
    expect(html).toMatch(/<img[^>]*width="\d+"/);
    expect(html).toMatch(/<img[^>]*height="\d+"/);
  });

  it('P2-39: AVIF + WebP on the shared card ladder (source width kept, P2-38), WebP fallback, lazy unless priority', async () => {
    expect(cover.width).toBe(762);
    const html = await renderAstro(ProjectCartridge, { props: { ...base, cover } });
    expect(html).toMatch(/<picture\b/);
    const avif = html.match(/<source[^>]*srcset="([^"]+)"[^>]*type="image\/avif"/)?.[1] ?? '';
    expect(avif.match(/\d+w/g)).toEqual(['320w', '480w', '640w', '762w']);
    expect(html).toMatch(/<source[^>]*type="image\/webp"/);
    expect(html).toMatch(/<img[^>]*src="[^"]*(?:\.webp|f=webp)"/);
    expect(html).not.toMatch(/f=png|\.png\b/);
    expect(html).toMatch(/<img[^>]*loading="lazy"/);
    expect(html).toMatch(/sizes="\(min-width: 1800px\) 277px, \(min-width: 1600px\) 261px, \(min-width: 1068px\) 220px, \(min-width: 734px\) calc\(50vw - 73px\), calc\(100vw - 60px\)"/);
    const wide = await renderAstro(ProjectCartridge, { props: { ...base, cover, wide: true, priority: true } });
    expect(wide).toMatch(/sizes="\(min-width: 1800px\) 607px, \(min-width: 1600px\) 575px, \(min-width: 1068px\) 493px, \(min-width: 734px\) calc\(100vw - 92px\), calc\(100vw - 60px\)"/);
    expect(wide).toMatch(/<img[^>]*loading="eager"/);
    expect(wide).toMatch(/<img[^>]*fetchpriority="high"/);
  });
});
