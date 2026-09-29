import { describe, expect, it } from 'vitest';
import Figure from '../../src/components/common/Figure.astro';
import ranking from '../../src/assets/projects/kickick-park/dong-ranking.webp';
import blocks from '../../src/assets/projects/school-zone-blindspots/spatial-cv-blocks.webp';
import { readSource, renderAstro } from './helpers';

describe('Figure.astro', () => {
  it("numbered caption 'Figure 2' / '그림 2' and a full-size link", async () => {
    const en = await renderAstro(Figure, {
      props: { lang: 'en', src: ranking, alt: 'Bar chart of district scores', caption: 'Districts ranked by total score.', number: 2 },
    });
    expect(en).toMatch(/<figure[^>]*class="figure"/);
    expect(en).toMatch(/<span[^>]*class="figure__num"[^>]*>Figure 2<\/span>/);
    expect(en).toContain('Districts ranked by total score.');
    expect(en).toMatch(/<a[^>]*class="figure__full"[^>]*href="[^"]+"[^>]*aria-label="View full size · Figure 2"[^>]*>View full size<\/a>/);
    expect(en).toMatch(/<a[^>]*class="figure__full"[^>]*data-viewer="figures"/);
    expect(en).toMatch(/<a[^>]*class="figure__full"[^>]*aria-haspopup="dialog"/);
    expect(en).toMatch(/<picture\b/);
    expect(en).toMatch(/<source[^>]*type="image\/avif"/);
    expect(en).toMatch(/<img[^>]*alt="Bar chart of district scores"/);
    expect(en).toMatch(/<img[^>]*loading="lazy"/);
    const ko = await renderAstro(Figure, {
      props: { lang: 'ko', src: ranking, alt: '행정동별 합계 점수 막대그래프', caption: '행정동별 합계 점수 순위.', number: 2 },
    });
    expect(ko).toMatch(/<span[^>]*class="figure__num"[^>]*>그림 2<\/span>/);
    expect(ko).toMatch(/>크게 보기<\/a>/);
  });

  it('without a number the caption has no figure label and the link names the image', async () => {
    const html = await renderAstro(Figure, {
      props: { lang: 'en', src: ranking, alt: 'Bar chart of district scores', caption: 'Ranking.', loading: 'eager', class: 'story-fig' },
    });
    expect(html).not.toContain('figure__num');
    expect(html).toMatch(/aria-label="View full size · Bar chart of district scores"/);
    expect(html).toMatch(/<figure[^>]*class="figure story-fig"/);
    expect(html).toMatch(/<img[^>]*loading="eager"/);
  });

  it('never requests widths wider than the source image', async () => {
    expect(ranking.width).toBeLessThan(1440);
    const html = await renderAstro(Figure, { props: { lang: 'en', src: ranking, alt: 'a', caption: 'c' } });
    expect(html).toMatch(/\b720w\b/);
    expect(html).not.toMatch(/\b1440w\b/);
  });

  it('P2-38: a source between two ladder steps keeps its own width as the largest candidate', async () => {
    expect(blocks.width).toBe(877);
    const html = await renderAstro(Figure, { props: { lang: 'ko', src: blocks, alt: 'a', caption: 'c' } });
    expect(html).toMatch(/\b720w\b/);
    expect(html).toMatch(/\b800w\b/);
    expect(html).toMatch(/\b877w\b/);
    expect(html).not.toMatch(/\b1080w\b/);
  });

  it('P2-39: the <img> fallback is WebP (no PNG copies) and sizes follows the reading column (760px from 900px, P1-7)', async () => {
    const html = await renderAstro(Figure, { props: { lang: 'ko', src: blocks, alt: 'a', caption: 'c' } });
    expect(html).toMatch(/<img[^>]*src="[^"]*(?:\.webp|f=webp)"/);
    expect(html).not.toMatch(/f=png|\.png\b/);
    expect(html).toMatch(/<source[^>]*sizes="\(min-width: 900px\) 760px, \(min-width: 734px\) 646px, calc\(100vw - 32px\)"/);
  });

  it('P2-12: the full-size link enlarges its tap target without a min-height that would double the caption line box', () => {
    const src = readSource('src/components/common/Figure.astro');
    expect(src).not.toMatch(/\.figure__full\s*\{[^}]*min-height/);
    expect(src).toMatch(/\.figure__full\s*\{[^}]*padding-block:\s*12px[^}]*margin-block:\s*-12px/);
  });

  it('F-081: default srcset ladder includes an 800 step near the 1× desktop slot', () => {
    const src = readSource('src/components/common/Figure.astro');
    expect(src).toMatch(/widths\s*=\s*\[720,\s*800,\s*1080,\s*1440\]/);
  });
});
