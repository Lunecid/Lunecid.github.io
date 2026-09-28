import { describe, expect, it } from 'vitest';
import FigureList from '../../src/components/projects/FigureList.astro';
import ranking from '../../src/assets/projects/kickick-park/dong-ranking.webp';
import selected from '../../src/assets/projects/kickick-park/selected-dongs.webp';
import { renderAstro } from './helpers';

describe('FigureList.astro', () => {
  it('renders nothing for an empty list', async () => {
    const html = await renderAstro(FigureList, { props: { lang: 'ko', figures: [] } });
    expect(html.trim()).toBe('');
  });

  it('numbers the figures 1…N under a Figures heading', async () => {
    const html = await renderAstro(FigureList, {
      props: {
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
});
