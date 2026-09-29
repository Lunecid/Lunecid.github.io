import { describe, expect, it } from 'vitest';
import Figure from '../../src/components/common/Figure.astro';
import ranking from '../../src/assets/projects/kickick-park/dong-ranking.webp';
import blocks from '../../src/assets/projects/school-zone-blindspots/spatial-cv-blocks.webp';
import { readSource, renderAstro } from './helpers';

describe('Figure.astro', () => {
  it("numbered caption 'Figure 2' / '그림 2' and a full-size link", async () => {
    const en = await renderAstro(Figure, {
      props: { variant: 'game', lang: 'en', src: ranking, alt: 'Bar chart of district scores', caption: 'Districts ranked by total score.', number: 2 },
    });
    expect(en).toMatch(/<figure[^>]*class="figure lh-frame bracket bracket--sm"/);
    expect(en).toMatch(/<span[^>]*class="figure__num"[^>]*>Figure 2<\/span>/);
    expect(en).toContain('Districts ranked by total score.');
    expect(en).toMatch(/<a[^>]*class="figure__full"[^>]*href="[^"]+"[^>]*aria-label="View full size · Figure 2"[^>]*>View full size<\/a>/);
    expect(en).toMatch(/<a[^>]*class="figure__full"[^>]*data-viewer="figures"/);
    expect(en).toMatch(/<a[^>]*class="figure__full"[^>]*aria-haspopup="dialog"/);
    expect(en).toMatch(/<picture\b/);
    expect(en).toMatch(/<source[^>]*type="image\/avif"/);
    expect(en).toMatch(/<img[^>]*alt="Bar chart of district scores"/);
    expect(en).toMatch(/<img[^>]*loading="lazy"/);
    // P-07 / owner decision 10: the viewer names the figure as the body does ('Figure N'), no 'FIG · N' strip.
    expect(en).toMatch(/data-viewer-label="Figure 2"/);
    // P-06 F-065: the id the body's citation links to sits on the <figure>, never on the figcaption.
    expect(en).toMatch(/<figure id="figure-2"/);
    const ko = await renderAstro(Figure, {
      props: { variant: 'game', lang: 'ko', src: ranking, alt: '행정동별 합계 점수 막대그래프', caption: '행정동별 합계 점수 순위.', number: 2 },
    });
    expect(ko).toMatch(/<span[^>]*class="figure__num"[^>]*>그림 2<\/span>/);
    expect(ko).toMatch(/>크게 보기<\/a>/);
  });

  it('without a number the caption has no figure label and the link names the image', async () => {
    const html = await renderAstro(Figure, {
      props: { variant: 'game', lang: 'en', src: ranking, alt: 'Bar chart of district scores', caption: 'Ranking.', loading: 'eager', class: 'story-fig' },
    });
    expect(html).not.toContain('figure__num');
    expect(html).toMatch(/aria-label="View full size · Bar chart of district scores"/);
    expect(html).toMatch(/<figure[^>]*class="figure lh-frame bracket bracket--sm story-fig"/);
    expect(html).toMatch(/<img[^>]*loading="eager"/);
  });

  it('never requests widths wider than the source image', async () => {
    expect(ranking.width).toBeLessThan(1440);
    const html = await renderAstro(Figure, { props: { variant: 'game', lang: 'en', src: ranking, alt: 'a', caption: 'c' } });
    expect(html).toMatch(/\b720w\b/);
    expect(html).not.toMatch(/\b1440w\b/);
  });

  it('P2-38: a source between two ladder steps keeps its own width as the largest candidate', async () => {
    expect(blocks.width).toBe(877);
    const html = await renderAstro(Figure, { props: { variant: 'game', lang: 'ko', src: blocks, alt: 'a', caption: 'c' } });
    expect(html).toMatch(/\b720w\b/);
    expect(html).toMatch(/\b800w\b/);
    expect(html).toMatch(/\b877w\b/);
    expect(html).not.toMatch(/\b1080w\b/);
  });

  it('P2-39: the <img> fallback is WebP (no PNG copies) and sizes follows the reading column (760px from 900px, P1-7)', async () => {
    const html = await renderAstro(Figure, { props: { variant: 'game', lang: 'ko', src: blocks, alt: 'a', caption: 'c' } });
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

  it('general version (P2-5): a heavy top rule instead of a frame, caption "그림 n —" / "Fig. n —", the full-size link kept', async () => {
    const ko = await renderAstro(Figure, { props: { variant: 'data', lang: 'ko', src: ranking, alt: '막대그래프', caption: '행정동별 대시보드 합계 순위.', number: 2, class: 'figure--inline' } });
    expect(ko).toMatch(/<figure[^>]*class="ed-figure figure--inline"/);
    expect(ko).toMatch(/<figcaption class="ed-figcap"[^>]*><span class="ed-figcap__num"[^>]*>그림 2 —<\/span>/);
    expect(ko).toMatch(/<a[^>]*class="figure__full"[^>]*aria-label="크게 보기 · 그림 2"[^>]*>크게 보기<\/a>/);
    // The viewer trigger contract (0b2d199, Appendix A): the editorial full-size link opens the image viewer too.
    expect(ko).toMatch(/<a[^>]*class="figure__full"[^>]*aria-haspopup="dialog"[^>]*data-viewer="figures"/);
    expect(ko).toMatch(/data-viewer-label="그림 2"/);
    expect(ko).not.toMatch(/figure__num|class="figure"/);
    const en = await renderAstro(Figure, { props: { variant: 'data', lang: 'en', src: ranking, alt: 'Bars', caption: 'Ranking.', number: 2 } });
    expect(en).toMatch(/<span class="ed-figcap__num"[^>]*>Fig\. 2 —<\/span>/);
  });

  it('P-06 F-042 part 3 / F-065: the game image loses its grey frame (the lh-frame bracket frames it); a cited figure lands below the nav', () => {
    const src = readSource('src/components/common/Figure.astro');
    expect(src).toMatch(/\.figure :global\(img\) \{ display: block; width: 100%; height: auto; border: 0; background: var\(--read-card\); \}/);
    expect(src).not.toMatch(/border: 1px solid var\(--read-line\)/);
    expect(src).toMatch(/\.figure \{[^}]*scroll-margin-top: calc\(var\(--nav-h\) \+ 16px\)/);
    expect(src).not.toMatch(/FIG · /); // owner decision 10: no 'FIG · N' viewer label
  });

  // P-06 F-007 step 2: an optional table of the figure's data ("표로 보기"), AucOverallChart's pattern, in both
  // branches; each column header is localized (contract §1.9) and resolved per page language. Synthetic fixture.
  const table = { columns: [{ ko: '열 가', en: 'Column A' }, { ko: '열 나', en: 'Column B' }], rows: [['행 1', '0.5'], ['행 2', '1.5']] };

  it('P-06 F-007 step 2: game branch — the table view after the caption, headers in the page language, the first cell a row header', async () => {
    const ko = await renderAstro(Figure, { props: { variant: 'game', lang: 'ko', src: ranking, alt: 'a', caption: 'c', number: 2, table } });
    expect(ko).toMatch(/<\/figcaption>\s*<details class="chart__table chart__table--read"[^>]*>\s*<summary class="chart__summary" id="figure-2-table"[^>]*>표로 보기<\/summary>/);
    expect(ko).toMatch(/<div class="chart__table-scroll" data-table-scroll data-label-id="figure-2-table"/);
    expect(ko).toMatch(/<th scope="col"[^>]*>열 가<\/th><th scope="col"[^>]*>열 나<\/th>/);
    expect(ko).toMatch(/<tr[^>]*><th scope="row"[^>]*>행 1<\/th><td class="num"[^>]*>0\.5<\/td><\/tr>/); // numbers right-aligned (P2-5 review)
    expect(ko).not.toContain('Column A');
    expect(ko.indexOf('</details>')).toBeLessThan(ko.indexOf('</figure>'));
    const en = await renderAstro(Figure, { props: { variant: 'game', lang: 'en', src: ranking, alt: 'a', caption: 'c', number: 2, table } });
    expect(en).toMatch(/<th scope="col"[^>]*>Column A<\/th>/);
    expect(en).toMatch(/<summary[^>]*>View as table<\/summary>/);
    expect(en).not.toContain('열 가');
    const none = await renderAstro(Figure, { props: { variant: 'game', lang: 'ko', src: ranking, alt: 'a', caption: 'c', number: 2 } });
    expect(none).not.toMatch(/<details|chart__table/);
  });

  it('P-06 F-007 step 2: general branch — the same table as an editorial table', async () => {
    const en = await renderAstro(Figure, { props: { variant: 'data', lang: 'en', src: ranking, alt: 'a', caption: 'c', number: 3, table } });
    expect(en).toMatch(/<details class="chart__table chart__table--editorial"[^>]*>\s*<summary class="chart__summary" id="figure-3-table"[^>]*>View as table<\/summary>/);
    expect(en).toMatch(/<table class="ed-table"[^>]*>\s*<caption class="sr-only"[^>]*>c<\/caption>\s*<thead[^>]*><tr[^>]*><th scope="col"[^>]*>Column A<\/th>/); // named by the figure caption (P2-5 review)
    expect(en).toMatch(/<th scope="row"[^>]*>행 2<\/th><td[^>]*>1\.5<\/td>/);
    expect(en).not.toContain('열 가');
    const ko = await renderAstro(Figure, { props: { variant: 'data', lang: 'ko', src: ranking, alt: 'a', caption: 'c', number: 3, table } });
    expect(ko).toMatch(/<th scope="col"[^>]*>열 나<\/th>/);
  });
});
