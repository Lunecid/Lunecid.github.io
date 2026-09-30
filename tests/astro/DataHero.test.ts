import { describe, expect, it } from 'vitest';
import DataHero from '../../src/components/data/DataHero.astro';
import heatmap from '../../src/assets/projects/school-zone-blindspots/risk-heatmap.webp';
import { renderAstro } from './helpers';

const props = {
  lang: 'ko',
  caption: '포트폴리오',
  name: '백성은',
  headline: '데이터 분석가',
  tagline: '질문을 데이터로 바꾸고, 결과를 결정으로 잇습니다.',
  status: '2027년 2월 석사 졸업 예정',
  evidence: '최우수상 2회 · IEEE CoG 2026 구두 발표',
  projects: { label: '프로젝트 보기', href: '/data/projects/' },
  cv: { label: '이력서 PDF', href: '/cv/seongeun-baek-resume-data-ko.pdf', docLabel: '이력서 (PDF)' },
  figure: { src: heatmap, alt: '히트맵', caption: '사각지대를 예측하다 — 지도입니다.', href: '/data/projects/school-zone-blindspots/', linkLabel: '프로젝트 보기', projectTitle: '사각지대를 예측하다' },
};

describe('DataHero.astro (P2-7)', () => {
  it('the name in the serif face, the headline, B-12 line, B-10 status and the evidence line', async () => {
    const html = await renderAstro(DataHero, { props });
    expect(html).toMatch(/<section class="dhero ed-sec"[^>]*aria-labelledby="hero-name"/);
    expect(html).toMatch(/<h1 id="hero-name" class="dhero__name" data-serif[^>]*>백성은<\/h1>/);
    for (const text of [props.headline, props.tagline, props.status, props.evidence]) expect(html).toContain(text);
  });

  it('one filled button (projects) and the CV download link', async () => {
    const html = await renderAstro(DataHero, { props });
    expect(html.match(/ed-btn--fill/g)).toHaveLength(1);
    expect(html).toMatch(/<a class="ed-btn ed-btn--fill" href="\/data\/projects\/"/);
    expect(html).toMatch(/<a class="ed-link" href="\/cv\/seongeun-baek-resume-data-ko\.pdf" title="이력서 \(PDF\)" download/);
  });

  it('the heatmap as 그림 1 with its caption and the project link (44px hit area); no HUD hero', async () => {
    const html = await renderAstro(DataHero, { props });
    expect(html).toMatch(/<figure class="ed-figure dhero__fig"/);
    expect(html).toMatch(/<span class="ed-figcap__num"[^>]*>그림 1 —<\/span> 사각지대를 예측하다 — 지도입니다\./);
    expect(html).toMatch(/<a class="hit dhero__figlink" href="\/data\/projects\/school-zone-blindspots\/"[^>]*>프로젝트 보기<span class="sr-only"[^>]*> — 사각지대를 예측하다<\/span>/);
    expect(html).toMatch(/<img[^>]*alt="히트맵"[^>]*fetchpriority="high"|<img[^>]*fetchpriority="high"[^>]*alt="히트맵"/);
    expect(html).not.toMatch(/(?<![\w-])hero__|PLAYER|STATUS|player-card|char-stage/);
  });
});
