import { describe, expect, it } from 'vitest';
import DataHero from '../../src/components/data/DataHero.astro';
import heatmap from '../../src/assets/projects/school-zone-blindspots/risk-heatmap.webp';
import { renderAstro } from './helpers';

// DS-4 (v5, rewrite of the P2-7 file; named): the hero is a label block + the painted DATA / ANALYST words + the
// name, headline, tagline, three stat tiles (the status and evidence facts) and the actions; then the map spread.
const props = {
  lang: 'ko',
  caption: '포트폴리오',
  name: '백성은',
  headline: '데이터 분석가',
  display: 'Data Analyst',
  tagline: '질문을 데이터로 바꾸고, 결과를 결정으로 잇습니다.',
  stats: [
    { value: '2027년 2월', label: '석사 졸업 예정' },
    { label: '최우수상', value: '2회', labelFirst: true },
    { label: 'IEEE CoG 2026', value: '구두 발표', labelFirst: true },
  ],
  projects: { label: '프로젝트 보기', href: '/data/projects/' },
  cv: { label: '이력서 PDF', href: '/cv/seongeun-baek-resume-data-ko.pdf', docLabel: '이력서 (PDF)' },
  figure: { src: heatmap, alt: '히트맵', caption: '사각지대를 예측하다 — 지도입니다.', href: '/data/projects/school-zone-blindspots/', linkLabel: '프로젝트 보기', projectTitle: '사각지대를 예측하다' },
};
const en = {
  ...props,
  lang: 'en',
  caption: 'Portfolio',
  name: 'Seongeun Baek',
  headline: 'Data Analyst',
  tagline: 'I turn questions into data, and results into decisions.',
  stats: [
    { label: 'M.S. expected', value: 'February 2027', labelFirst: true },
    { label: 'Top Excellence Award', value: '×2', labelFirst: true },
    { value: 'oral presentation', label: 'IEEE CoG 2026' },
  ],
  projects: { label: 'See projects', href: '/en/data/projects/' },
  cv: { label: 'Résumé PDF', href: '/cv/seongeun-baek-resume-data-en.pdf', docLabel: 'Résumé (PDF)' },
  figure: { ...props.figure, alt: 'heatmap', caption: 'Predicting the Blind Spots — a map.', href: '/en/data/projects/school-zone-blindspots/', linkLabel: 'View project', projectTitle: 'Predicting the Blind Spots' },
};
const heroPart = (html: string): string => html.slice(0, html.indexOf('<figure'));

describe('DataHero.astro (DS-4, v5)', () => {
  it('DS-4: hero = label block, aria-hidden DATA/ANALYST on paint, h1, headline, tagline, three stat tiles, one filled button, CV link', async () => {
    const html = await renderAstro(DataHero, { props, url: '/data/' });
    expect(html).toMatch(/<section class="ed-hero dhero"[^>]*aria-labelledby="hero-name"/);
    expect(html).toMatch(/<div class="ed-tblock"[^>]*><p class="ed-label"[^>]*>포트폴리오<\/p><p class="ed-tblock__meta" aria-hidden="true"[^>]*><span lang="en"[^>]*>LUNECID\.GITHUB\.IO\/DATA\/<\/span><span[^>]*>마지막 업데이트 \d{4}\.\d{2}\.\d{2}<\/span><\/p><\/div>/);
    expect(html).toMatch(/<div class="ed-hero__mark" aria-hidden="true"[^>]*><p class="ed-hero__bars" lang="en" data-display data-paint-text[^>]*><span[^>]*>Data<\/span><span[^>]*>Analyst<\/span><\/p><span class="ed-mc ed-mc--hero" aria-hidden="true"/);
    expect(html).toMatch(/<h1 id="hero-name" class="ed-hero__name"[^>]*>백성은<\/h1>/);
    expect(html).not.toMatch(/data-serif/);
    expect(html).toMatch(/<p class="dhero__headline"[^>]*>데이터 분석가<\/p>/);
    expect(html).toMatch(/<p class="dhero__tagline"[^>]*><span class="ed-cl"[^>]*>질문을 데이터로 바꾸고,<\/span> <span class="ed-cl"[^>]*>결과를 결정으로 잇습니다\.<\/span><\/p>/);
    expect(html.match(/<li class="ed-stat"/g)).toHaveLength(3);
    expect(html.match(/ed-btn--fill/g)).toHaveLength(1);
    expect(html).toMatch(/<a class="ed-btn ed-btn--fill" href="\/data\/projects\/"[^>]*>프로젝트 보기 <span aria-hidden="true"[^>]*>→<\/span><\/a>/);
    expect(html).toMatch(/<a class="ed-link" href="\/cv\/seongeun-baek-resume-data-ko\.pdf" title="이력서 \(PDF\)" download/);
  });

  it('DS-4: the stat tiles hold the status and evidence facts (no other number)', async () => {
    const html = heroPart(await renderAstro(DataHero, { props, url: '/data/' }));
    const tiles = html.slice(html.indexOf('<ul class="ed-stats'), html.indexOf('</ul>', html.indexOf('<ul class="ed-stats')));
    for (const s of props.stats) expect(tiles).toContain(s.value);
    expect(tiles).toMatch(/ed-stat__k[^>]*>최우수상<\/span><span class="ed-stat__v"[^>]*>2회</);
    // outside the tiles (and the aria-hidden job line) the hero carries no digit at all
    const rest = html.replace(tiles, '').replace(/<p class="ed-tblock__meta"[\s\S]*?<\/p>/, '').replace(/<[^>]*>/g, '');
    expect(rest).not.toMatch(/\d/);
  });

  it('DS-4: the map spread keeps 그림 1 —, the alt, priority and the project link with its hidden title', async () => {
    const html = await renderAstro(DataHero, { props, url: '/data/' });
    expect(html).toMatch(/<figure class="ed-figure ed-spread"/);
    expect(html).toMatch(/<i class="ed-spread__y" aria-hidden="true"/);
    expect(html).toMatch(/<span class="ed-chip ed-spread__tab" aria-hidden="true"[^>]*>그림 1<\/span>/);
    expect(html).toMatch(/<span class="ed-figcap__num"[^>]*>그림 1 —<\/span> 사각지대를 예측하다 — 지도입니다\./);
    expect(html).toMatch(/<a class="ed-link dhero__figlink" href="\/data\/projects\/school-zone-blindspots\/"[^>]*>프로젝트 보기<span class="sr-only"[^>]*> — 사각지대를 예측하다<\/span>/);
    expect(html).toMatch(/<img[^>]*alt="히트맵"[^>]*fetchpriority="high"|<img[^>]*fetchpriority="high"[^>]*alt="히트맵"/);
    expect(html).not.toMatch(/(?<![\w-])hero__|PLAYER|STATUS|player-card|char-stage/);
  });

  it('DS-4 en: the same composition in English (display words, Fig. 1, the English tiles in the English sentence order)', async () => {
    const html = await renderAstro(DataHero, { props: en, url: '/en/data/' });
    expect(html).toMatch(/LUNECID\.GITHUB\.IO\/EN\/DATA\//);
    expect(html).toMatch(/Last updated [A-Z][a-z]{2} \d{1,2}, \d{4}|Last updated \d/);
    expect(html).toMatch(/<span[^>]*>Data<\/span><span[^>]*>Analyst<\/span>/);
    expect(html).toMatch(/<h1 id="hero-name" class="ed-hero__name"[^>]*>Seongeun Baek<\/h1>/);
    expect(html).toMatch(/ed-stat__k[^>]*>M\.S\. expected<\/span><span class="ed-stat__v"[^>]*>February 2027</);
    expect(html).toMatch(/ed-stat__v[^>]*>oral presentation<\/span><span class="ed-stat__k"[^>]*>IEEE CoG 2026</);
    expect(html).toMatch(/<span class="ed-chip ed-spread__tab" aria-hidden="true"[^>]*>Fig\. 1<\/span>/);
    expect(html).toMatch(/<span class="ed-figcap__num"[^>]*>Fig\. 1 —<\/span>/);
    expect(html).not.toMatch(/[가-힣]/);
  });
});
