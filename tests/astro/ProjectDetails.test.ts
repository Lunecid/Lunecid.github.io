import { describe, expect, it } from 'vitest';
import ProjectDetails from '../../src/components/projects/ProjectDetails.astro';
import cover from '../../src/assets/projects/school-zone-blindspots/risk-heatmap.webp';
import parking from '../../src/assets/projects/kickick-park/parking-stand-detection.webp';
import { readSource, renderAstro } from './helpers';

const rows = [
  { label: '유형', value: '경진대회 · 4인 팀' },
  { label: '기간', value: '2025.05 – 2025.07' },
  { label: '소속', value: '부산광역시 · 2025 Big Data 활용 대회(DX CHALLENGE)' },
  { label: '내 역할', value: '문제 정의와 분석 방향을 주도했다.' },
  { label: '도구', value: 'Python, QGIS, XGBoost' },
];

describe('ProjectDetails.astro', () => {
  it('one h1 and ≤6 row headers with scope=row', async () => {
    const html = await renderAstro(ProjectDetails, {
      props: {
        variant: 'game',
        lang: 'ko',
        title: '사각지대를 예측하다',
        rows: [...rows, { label: '데이터', value: '공공데이터 16종' }, { label: '추가', value: '일곱 번째 행' }],
      },
    });
    expect(html).toMatch(/<section[^>]*id="details"[^>]*aria-labelledby="pd-title"/);
    expect(html.match(/<h1\b/g) ?? []).toHaveLength(1);
    expect(html).toMatch(/<h1[^>]*id="pd-title"[^>]*>사각지대를 예측하다<\/h1>/);
    expect(html.match(/<th scope="row"/g) ?? []).toHaveLength(6);
    expect(html).toContain('공공데이터 16종');
    expect(html).not.toContain('일곱 번째 행');
    expect(html).toMatch(/<caption[^>]*class="sr-only"[^>]*>사각지대를 예측하다 · 프로젝트 개요<\/caption>/);
    expect(html).toContain('PROJECT DETAILS');
  });

  it('award badge and a certificate link with data-cert-id and aria-haspopup=dialog', async () => {
    const html = await renderAstro(ProjectDetails, {
      props: {
        variant: 'game',
        lang: 'ko',
        title: '사각지대를 예측하다',
        rows,
        award: { name: '최우수상(부산광역시장상)', certificateId: 'busan-mayor-award', certificateHref: '/_astro/busan.1280w.webp' },
      },
    });
    expect(html).toMatch(/<span[^>]*class="badge badge--tier"[^>]*>[\s\S]*?최우수상\(부산광역시장상\)<\/span>/);
    expect(html).toMatch(/data-cert-id="busan-mayor-award"/);
    expect(html).toMatch(/data-viewer="certificates"/);
    expect(html).toMatch(/aria-haspopup="dialog"[^>]*>상장 보기/);
    expect(html).toMatch(/href="\/_astro\/busan\.1280w\.webp"/);
    // P2-14/D-7: a certificate button opens an in-page modal, not a symbol reserved for links that leave the site.
    expect(html).not.toContain('↗');
    const noImage = await renderAstro(ProjectDetails, {
      props: { variant: 'game', lang: 'ko', title: '사각지대를 예측하다', rows, award: { name: '최우수상(부산광역시장상)' } },
    });
    expect(noImage).toContain('최우수상(부산광역시장상)');
    expect(noImage).not.toContain('data-cert-id');
    const en = await renderAstro(ProjectDetails, {
      props: { variant: 'game', lang: 'en', title: 'Predicting the Blind Spots', rows, award: { name: 'Top Excellence Award', certificateId: 'busan-mayor-award', certificateHref: '/x.webp' } },
    });
    expect(en).toMatch(/>View certificate/);
    expect(en).not.toContain('프로젝트 개요');
  });

  it('P2-21: the bracketed figure carries a "FIG · <label>" HUD caption strip when a label is given', async () => {
    const withCaption = await renderAstro(ProjectDetails, {
      props: { variant: 'game', lang: 'ko', title: 't', rows, figure: { src: cover, alt: '부산 전역 사고 예측 히트맵', label: 'RISK HEATMAP' } },
    });
    expect(withCaption).toMatch(/<figure[^>]*class="pd__fig bracket"/);
    expect(withCaption).toMatch(/<picture\b/);
    expect(withCaption).toMatch(/<img[^>]*alt="부산 전역 사고 예측 히트맵"/);
    expect(withCaption).toMatch(/<img[^>]*loading="eager"/);
    expect(withCaption).toMatch(/<img[^>]*fetchpriority="high"/);
    expect(withCaption).toMatch(/<figcaption class="pd__figcap" lang="en"[^>]*><span class="pd__figcap-tag"[^>]*>FIG<\/span> · RISK HEATMAP<\/figcaption>/);
    expect(withCaption.indexOf('<figcaption')).toBeGreaterThan(withCaption.indexOf('<picture')); // under the figure
    const noLabel = await renderAstro(ProjectDetails, {
      props: { variant: 'game', lang: 'ko', title: 't', rows, figure: { src: cover, alt: '히트맵' } },
    });
    expect(noLabel).toMatch(/<figure\b/);
    expect(noLabel).not.toMatch(/<figcaption\b/);
    const none = await renderAstro(ProjectDetails, { props: { variant: 'game', lang: 'ko', title: 't', rows } });
    expect(none).not.toMatch(/<figure\b/);
    expect(none).toMatch(/<section[^>]*class="pd-sec hud-grid pd-sec--nofig"/);
  });

  it('fix round 1: a cover that is also the body figure N carries its number and caption (shown once, here)', async () => {
    const html = await renderAstro(ProjectDetails, {
      props: { variant: 'game', lang: 'ko', title: 't', rows, figure: { src: cover, alt: '히트맵', label: 'CLUSTER PROFILES', number: 1, caption: '군집별 핵심 변수의 Z-score.' } },
    });
    expect(html).toMatch(/<figcaption id="figure-1" class="pd__figcap pd__figcap--cited"/);
    expect(html).toMatch(/<span class="pd__figcap-tag"[^>]*>FIG 1<\/span> · CLUSTER PROFILES/);
    expect(html).toMatch(/<span class="pd__figcap-text"[^>]*><b[^>]*>그림 1<\/b> 군집별 핵심 변수의 Z-score\.<\/span>/);
  });

  it('P2-21: from 1068px a short figure is centred beside the taller table (no empty block under it)', () => {
    const src = readSource('src/components/projects/ProjectDetails.astro');
    const desktop = /@media \(min-width: 1068px\) \{([\s\S]*?)\n {2}\}\n/.exec(src)?.[1] ?? '';
    expect(desktop).toMatch(/grid-template-areas:\s*"fig head" "fig table" "fig award"/);
    expect(desktop).toMatch(/\.pd__fig\s*\{\s*align-self:\s*center;/);
  });

  it('default slot renders inside the head', async () => {
    const html = await renderAstro(ProjectDetails, {
      props: { variant: 'game', lang: 'ko', title: '사각지대를 예측하다', rows },
      slots: { default: '<p>보호구역 밖 사고 위험을 예측했다.</p>' },
    });
    expect(html).toMatch(/<div[^>]*class="pd__lead"[^>]*>\s*<p>보호구역 밖 사고 위험을 예측했다\.<\/p>\s*<\/div>/);
    expect(html.indexOf('보호구역 밖')).toBeGreaterThan(html.indexOf('id="pd-title"'));
    expect(html.indexOf('보호구역 밖')).toBeLessThan(html.indexOf('<table'));
    const noSlot = await renderAstro(ProjectDetails, { props: { variant: 'game', lang: 'ko', title: 't', rows } });
    expect(noSlot).not.toContain('pd__lead');
  });

  it('P2-38/P2-39: the cover keeps its own width between ladder steps, WebP fallback, real column sizes', async () => {
    expect(parking.width).toBe(762);
    const html = await renderAstro(ProjectDetails, { props: { variant: 'game', lang: 'ko', title: 't', rows, figure: { src: parking, alt: 'a' } } });
    expect(html).toMatch(/\b560w\b/);
    expect(html).toMatch(/\b762w\b/);
    expect(html).not.toMatch(/\b840w\b/);
    expect(html).toMatch(/<img[^>]*src="[^"]*(?:\.webp|f=webp)"/);
    expect(html).not.toMatch(/f=png|\.png\b/);
    expect(html).toMatch(/<source[^>]*sizes="\(min-width: 1800px\) 659px, \(min-width: 1600px\) 626px, \(min-width: 1068px\) 540px, \(min-width: 734px\) 600px, calc\(100vw - 34px\)"/);
  });

  it('F-006: stacked cover is capped at 600px / 60vh between 734 and 1067 only', () => {
    const src = readSource('src/components/projects/ProjectDetails.astro');
    expect(src).toMatch(/@media \(min-width: 734px\) and \(max-width: 1067\.98px\) \{[\s\S]*?\.pd__fig\s*\{[\s\S]*?max-width:\s*600px/);
    expect(src).toMatch(/@media \(min-width: 734px\) and \(max-width: 1067\.98px\) \{[\s\S]*?max-height:\s*min\(60vh,\s*300px\)[\s\S]*?object-fit:\s*contain/);
  });
});
