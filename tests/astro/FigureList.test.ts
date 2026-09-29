import { describe, expect, it } from 'vitest';
import FigureList from '../../src/components/projects/FigureList.astro';
import ranking from '../../src/assets/projects/kickick-park/dong-ranking.webp';
import selected from '../../src/assets/projects/kickick-park/selected-dongs.webp';
import { renderAstro } from './helpers';

describe('FigureList.astro', () => {
  it('renders nothing for an empty list', async () => {
    const html = await renderAstro(FigureList, { props: { variant: 'game', lang: 'ko', figures: [] } });
    expect(html.trim()).toBe('');
  });

  it('numbers the figures 1…N under a Figures heading', async () => {
    const html = await renderAstro(FigureList, {
      props: {
        variant: 'game',
        lang: 'en',
        figures: [
          { src: ranking, alt: 'Bar chart', caption: 'First caption.' },
          { src: selected, alt: 'Map', caption: 'Second caption.' },
        ],
      },
    });
    expect(html).toMatch(/<section[^>]*id="figures"[^>]*aria-labelledby="figures-title"/);
    expect(html).toMatch(/<h2[^>]*id="figures-title"[^>]*>Figures<\/h2>/);
    expect(html.match(/<figure\b/g) ?? []).toHaveLength(2);
    expect(html).toMatch(/Figure 1<\/span>[\s\S]*First caption\.[\s\S]*Figure 2<\/span>[\s\S]*Second caption\./);
  });

  it('general version (P2-5): the reading column on white with editorial figures', async () => {
    const html = await renderAstro(FigureList, { props: { variant: 'data', lang: 'ko', figures: [{ src: ranking, alt: 'a', caption: 'c', number: 3 }] } });
    expect(html).toMatch(/<section id="figures" class="figs ed-prose"/);
    expect(html).toMatch(/<span class="ed-figcap__num"[^>]*>그림 3 —<\/span>/);
    expect(html).not.toMatch(/read-section|read-column/);
  });

  it('P-06: each figure keeps its number as its id (#figure-N) and passes its table on; the game section keeps its classes', async () => {
    const table = { columns: [{ ko: '열 가', en: 'Column A' }], rows: [['행 1']] }; // synthetic fixture
    const html = await renderAstro(FigureList, { props: { variant: 'game', lang: 'ko', figures: [{ src: ranking, alt: 'a', caption: 'c', number: 4, table }] } });
    expect(html).toMatch(/<section id="figures" class="figs read read-section read-column"/);
    expect(html).toMatch(/<figure id="figure-4" class="figure lh-frame bracket bracket--sm figure--inline"/);
    expect(html).toMatch(/<summary class="chart__summary" id="figure-4-table"[^>]*>표로 보기<\/summary>/);
    expect(html).toMatch(/<th scope="col"[^>]*>열 가<\/th>/);
  });
});
