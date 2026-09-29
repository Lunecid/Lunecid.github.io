import { describe, expect, it } from 'vitest';
import ProjectListItem from '../../src/components/data/ProjectListItem.astro';
import cover from '../../src/assets/projects/school-zone-blindspots/risk-heatmap.webp';
import { renderAstro } from './helpers';

const base = { title: '사각지대를 예측하다', meta: 'Python · QGIS', tagKeys: ['geospatial', 'ml'], tags: ['공간 분석', '머신러닝'] };

describe('ProjectListItem.astro (P2-6)', () => {
  it('a list row: the title link, the tools line, tags, the cover as a small figure; no cartridge, sticker or lift', async () => {
    const html = await renderAstro(ProjectListItem, { props: { ...base, href: '/data/projects/school-zone-blindspots/', cover, sticker: { text: '최우수상', kind: 'award' } } });
    expect(html).toMatch(/<li class="pli ed-item"[^>]*data-tags="geospatial ml"/);
    expect(html).toMatch(/<h3 class="pli__title ed-item__title" data-serif[^>]*><a class="pli__link hit"[^>]*href="\/data\/projects\/school-zone-blindspots\/"[^>]*>사각지대를 예측하다<\/a><\/h3>/);
    expect(html).toMatch(/<p class="ed-meta"[^>]*>Python · QGIS<\/p>/);
    expect(html.match(/<li class="ed-tag"/g)).toHaveLength(2);
    expect(html).toMatch(/<img[^>]*class="pli__img/);
    expect(html).not.toMatch(/cart|sticker|최우수상/);
  });

  it('the CoG item draws the paper\'s AUC chart in the editorial tone', async () => {
    const html = await renderAstro(ProjectListItem, { props: { ...base, href: '/data/research/cog-2026-engagement/', chart: { kind: 'auc-overall', lang: 'ko' } } });
    expect(html).toMatch(/<li class="pli ed-item pli--chart"/);
    expect(html).toMatch(/<div class="auc-label auc-label--editorial"/);
  });

  it('a project without a page: plain title and its one-line summary', async () => {
    const html = await renderAstro(ProjectListItem, { props: { ...base, summary: '한 줄 요약입니다.' } });
    expect(html).not.toContain('<a ');
    expect(html).toMatch(/<p class="ed-body"[^>]*>한 줄 요약입니다\.<\/p>/);
  });
});
