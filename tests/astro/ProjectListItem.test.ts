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

  it('DS-4: the card variant — image, aria-hidden card number, tools line, title link (stretched), tags; data-tags kept', async () => {
    const html = await renderAstro(ProjectListItem, { props: { ...base, href: '/data/projects/school-zone-blindspots/', cover, variant: 'card', n: 1 } });
    expect(html).toMatch(/^<li class="ed-card"[^>]*data-tags="geospatial ml"/);
    expect(html).toMatch(/<div class="ed-card__img"[^>]*>\s*<picture/);
    const img = /<img\b[^>]*>/.exec(html)?.[0] ?? '';
    expect(img).toMatch(/\salt(="")?[\s>]/);
    expect(img).toMatch(/\swidth="\d+"[\s\S]*\sheight="\d+"/);
    expect(html).toMatch(/<p class="ed-card__top"[^>]*><span class="ed-card__n" aria-hidden="true"[^>]*>01<\/span><span[^>]*>Python · QGIS<\/span><\/p>/);
    expect(html).toMatch(/<h3 class="ed-card__title"[^>]*><a class="hit" href="\/data\/projects\/school-zone-blindspots\/"[^>]*>사각지대를 예측하다<\/a><\/h3>/);
    expect(html.match(/<li class="ed-tag"/g)).toHaveLength(2);
    expect(html).not.toMatch(/data-serif|pli__|fetchpriority="high"/);
    const plain = await renderAstro(ProjectListItem, { props: { ...base, summary: '한 줄 요약입니다.', variant: 'card', n: 4 } });
    expect(plain).toMatch(/^<li class="ed-card ed-card--plain"/);
    expect(plain).toMatch(/<h3 class="ed-card__title"[^>]*>사각지대를 예측하다<\/h3>\s*<p class="ed-card__text"[^>]*>한 줄 요약입니다\.<\/p>/);
    expect(plain).not.toMatch(/<a |ed-card__img/);
  });

  it('DS-5: the lead card — the page LCP image (priority) over the painted field, the same facts; priority only on the lead', async () => {
    const html = await renderAstro(ProjectListItem, { props: { ...base, href: '/data/projects/school-zone-blindspots/', cover, variant: 'lead', n: 1, priority: true } });
    expect(html).toMatch(/^<li class="ed-card ed-card--lead"[^>]*data-tags="geospatial ml"/);
    expect(html).toMatch(/<div class="ed-card__img"[^>]*>\s*<picture/);
    expect(/<img\b[^>]*>/.exec(html)?.[0]).toMatch(/fetchpriority="high"/);
    expect(html).toMatch(/<span class="ed-card__n" aria-hidden="true"[^>]*>01<\/span>/);
    expect(html).toMatch(/<h3 class="ed-card__title"[^>]*><a class="hit" href="\/data\/projects\/school-zone-blindspots\/"/);
    const card = await renderAstro(ProjectListItem, { props: { ...base, href: '/x/', cover, variant: 'card', n: 2 } });
    expect(card).not.toMatch(/fetchpriority="high"/);
    expect(/<img\b[^>]*>/.exec(card)?.[0]).toMatch(/loading="lazy"/);
  });

  it('DS-5: the CoG card keeps its AUC label figure; the row variant is unchanged for other lists', async () => {
    const html = await renderAstro(ProjectListItem, { props: { ...base, href: '/data/research/cog-2026-engagement/', chart: { kind: 'auc-overall', lang: 'ko' }, variant: 'card', n: 4 } });
    expect(html).toMatch(/^<li class="ed-card"/);
    expect(html).toMatch(/<div class="ed-card__img ed-card__img--chart"[^>]*>\s*<div class="auc-label auc-label--editorial"/);
    const row = await renderAstro(ProjectListItem, { props: { ...base, href: '/x/', cover } });
    expect(row).toMatch(/^<li class="pli ed-item"/);
  });
});
