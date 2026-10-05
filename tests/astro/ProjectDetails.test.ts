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
    expect(html).toMatch(/<figure id="figure-1" class="pd__fig bracket"[\s\S]*<figcaption class="pd__figcap pd__figcap--cited"/);
    expect(html).toMatch(/<span class="pd__figcap-tag"[^>]*>FIG<\/span> · CLUSTER PROFILES/);
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
  it('P-06 F-007 step 2 (P2-5 review): the cover, when it is the body figure N, shows that figure\'s data table', async () => {
    const table = { columns: [{ ko: '변수', en: 'Feature' }, { ko: '군집 0', en: 'Cluster 0' }], rows: [['a', '-0.13']] };
    const html = await renderAstro(ProjectDetails, {
      props: { lang: 'ko', variant: 'game', title: 't', rows: [], figure: { src: cover, alt: 'alt', label: 'RISK HEATMAP', number: 1, caption: 'cap', table } },
    });
    expect(html).toMatch(/<details class="chart__table chart__table--hud"[^>]*>\s*<summary class="chart__summary" id="figure-1-table"/);
    expect(html).toMatch(/<td class="num"[^>]*>-0\.13<\/td>/);
    const none = await renderAstro(ProjectDetails, {
      props: { lang: 'ko', variant: 'game', title: 't', rows: [], figure: { src: cover, alt: 'alt', label: 'RISK HEATMAP', number: 1, caption: 'cap' } },
    });
    expect(none).not.toContain('chart__table');
  });

  it('P2-6 (P2-5 review carry): the general version\'s cover, when it is the body figure N, shows the same data table in the editorial tone', async () => {
    const table = { columns: [{ ko: '변수', en: 'Feature' }, { ko: '군집 0', en: 'Cluster 0' }], rows: [['a', '-0.13']] };
    const html = await renderAstro(ProjectDetails, {
      props: { lang: 'ko', variant: 'data', title: 't', rows: [], figure: { src: cover, alt: 'alt', label: 'RISK HEATMAP', number: 1, caption: 'cap', table } },
    });
    // DS-6 (named): the cover is the map spread (ed-spread)
    expect(html).toMatch(/<figure id="figure-1" class="ed-figure ed-spread pd-ed__fig"[\s\S]*<\/figcaption>\s*<details class="chart__table chart__table--editorial"[^>]*>\s*<summary class="chart__summary" id="figure-1-table"/);
    expect(html).toMatch(/<table class="ed-table"[\s\S]*<td class="num"[^>]*>-0\.13<\/td>/);
  });

  it('P-07 F-042: an uncited cover with a caption shows the FIG strip and the caption sentence, without a figure number', async () => {
    const html = await renderAstro(ProjectDetails, {
      props: { variant: 'game', lang: 'ko', title: 't', rows, figure: { src: cover, alt: '히트맵', label: 'RISK HEATMAP', caption: '사고 위험도 지도.' } },
    });
    // Step 5b item 2's regex, with [^>]* for the scoped data-astro-cid-* attribute every element carries.
    expect(html).toMatch(/<figcaption class="pd__figcap"[^>]*><span class="pd__figcap-strip" lang="en"[^>]*><span class="pd__figcap-tag"[^>]*>FIG<\/span> · RISK HEATMAP<\/span><span class="pd__figcap-text"[^>]*>/);
    expect(html).not.toMatch(/<b[^>]*>그림/);
  });

  // DS-6 (named rewrite of the P2-6 test): the v5 head (PageHeadData: label block with the back link, slug + period
  // job line, the English display title, the h1 pd-title), the cover as the map spread with its painted square, the
  // overview table with the 내 역할 row marked for paint, the award as a badge (real text) beside it.
  it('general version (DS-6): v5 head, map spread, overview rows unchanged in text, 내 역할 row marked, award badge text, certificate trigger unchanged', async () => {
    const html = await renderAstro(ProjectDetails, {
      props: {
        variant: 'data', lang: 'ko', title: '사각지대를 예측하다', rows, display: 'Predicting the Blind Spots', job: ['school-zone-blindspots', '2025.05 – 2025.07'],
        figure: { src: cover, alt: '히트맵', label: 'RISK HEATMAP', number: 1, caption: '사고 위험도 지도.' },
        award: { name: '최우수상(부산광역시장상)', certificateId: 'busan-mayor-award', certificateHref: '/_astro/cert.webp', certificateWidth: 1280, certificateHeight: 1810, certificateSrcSet: '/_astro/cert-640.webp 640w', certificateSizes: '100vw', certificateAlt: '상장', certificateCaption: '상장 캡션' },
      },
      url: '/data/projects/school-zone-blindspots/',
    });
    expect(html).toMatch(/<section[^>]*id="details"[^>]*class="pd-ed ed-sec ed-case"/);
    expect(html).toMatch(/<h1 id="pd-title" class="ed-phead__title"[^>]*>사각지대를 예측하다<\/h1>/);
    expect(html).toMatch(/<p class="ed-display" aria-hidden="true" lang="en" data-display[^>]*>Predicting the Blind Spots<\/p>/);
    expect(html).toMatch(/<span[^>]*>school-zone-blindspots<\/span><span[^>]*>2025\.05 – 2025\.07<\/span>/);
    expect(html).not.toMatch(/data-serif/);
    expect(html).toMatch(/<table class="ed-table pd-ed__table"/);
    expect(html.match(/<th scope="row"/g)).toHaveLength(rows.length);
    for (const row of rows) expect(html).toContain(`>${row.value}</td>`);
    expect(html).toMatch(/<tr class="pd-ed__hl"[^>]*><th scope="row" data-paint-text[^>]*>내 역할<\/th>/);
    expect(html.match(/pd-ed__hl/g)).toHaveLength(1);
    expect(html).toMatch(/<p class="ed-stamp"[^>]*><span class="ed-stamp__ink" data-paint-text[^>]*>최우수상<span class="ed-stamp__small"[^>]*>\(부산광역시장상\)<\/span><\/span><\/p>/);
    // The viewer trigger contract (0b2d199): a link with only data-cert-id is not intercepted.
    expect(html).toMatch(/<a class="ed-link" href="\/_astro\/cert\.webp"[^>]*data-cert-id="busan-mayor-award"[^>]*data-viewer="certificates"[^>]*aria-haspopup="dialog"/);
    expect(html).toMatch(/data-viewer-w="1280"[^>]*data-viewer-h="1810"/);
    expect(html).toMatch(/>상장 보기<span class="sr-only"[^>]*> · 최우수상\(부산광역시장상\)<\/span><\/a>/);
    // F-065 (P-06): the id sits on the <figure>, not the figcaption.
    expect(html).toMatch(/<figure id="figure-1" class="ed-figure ed-spread pd-ed__fig"/);
    expect(html).toMatch(/<i class="ed-spread__sq" aria-hidden="true"/);
    expect(html).toMatch(/<figcaption class="ed-figcap ed-spread__cap"[^>]*><span class="ed-figcap__num"[^>]*>그림 1 —<\/span> 사고 위험도 지도\.<\/figcaption>/);
    expect(html).toMatch(/<img[^>]*fetchpriority="high"/);
    expect(html).not.toMatch(/badge|◆|FIG|RISK HEATMAP|hud-grid|bracket|\bcut\b/);
  });

  it('DS-6: the band slot sits between the head and the overview; en splits the award name the same way', async () => {
    const html = await renderAstro(ProjectDetails, {
      props: { variant: 'data', lang: 'en', title: 'Predicting the Blind Spots', rows, display: 'Predicting the Blind Spots', award: { name: 'Top Excellence Award (Mayor of Busan Award)' } },
      slots: { band: '<div class="band-probe"></div>' },
      url: '/en/data/projects/school-zone-blindspots/',
    });
    expect(html.indexOf('band-probe')).toBeGreaterThan(html.indexOf('pd-title'));
    expect(html.indexOf('band-probe')).toBeLessThan(html.indexOf('pd-ed__table'));
    expect(html).toMatch(/<span class="ed-stamp__ink" data-paint-text[^>]*>Top Excellence Award<span class="ed-stamp__small"[^>]*>\(Mayor of Busan Award\)<\/span>/);
  });

  it('P-07 F-005: the back link to the project list; the game numbers it as its nav does, the general version is a plain underlined link', async () => {
    const game = await renderAstro(ProjectDetails, { props: { variant: 'game', lang: 'ko', title: 't', rows } });
    expect(game).toMatch(/<a class="pd__back" href="\/game\/projects\/"[^>]*><span aria-hidden="true"[^>]*>←<\/span> <span class="pd__back-num" aria-hidden="true"[^>]*>02<\/span> 프로젝트<\/a>/);
    const gameEn = await renderAstro(ProjectDetails, { props: { variant: 'game', lang: 'en', title: 't', rows } });
    expect(gameEn).toMatch(/<a class="pd__back" href="\/en\/game\/projects\/"[^>]*>[\s\S]*?PROJECTS<\/a>/);
    const data = await renderAstro(ProjectDetails, { props: { variant: 'data', lang: 'ko', title: 't', rows } });
    expect(data).toMatch(/<a class="ed-link pd-ed__back" href="\/data\/projects\/"[^>]*><span aria-hidden="true"[^>]*>←<\/span> 프로젝트<\/a>/); // DS-6 (named): + class
    expect(data).not.toMatch(/pd__back/);
  });

  it('P-07 F-042 (P2-6 review): the general version shows an uncited cover\'s own caption, without a figure number', async () => {
    const html = await renderAstro(ProjectDetails, {
      props: { variant: 'data', lang: 'ko', title: 't', rows, figure: { src: cover, alt: '히트맵', label: 'RISK HEATMAP', caption: '사고 위험도 지도.' } },
    });
    expect(html).toMatch(/<figure class="ed-figure ed-spread pd-ed__fig"[\s\S]*<figcaption class="ed-figcap ed-spread__cap"[^>]*>사고 위험도 지도\.<\/figcaption>/); // DS-6 (named): the spread
    expect(html).not.toMatch(/ed-figcap__num|id="figure-/);
  });
});
