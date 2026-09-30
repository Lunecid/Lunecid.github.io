import { describe, expect, it } from 'vitest';
import PaperSheet from '../../src/components/research/PaperSheet.astro';
import type { PaperPageData } from '../../src/lib/publications';
import { readSource, renderAstro } from './helpers';

const TITLE = 'Kill-Conditioned Engagement Outcome Prediction in League of Legends Under Minute-Resolution Public Telemetry';
const ABSTRACT = 'We study how much pre-engagement signal is recoverable from the public Riot API.';
const ABSTRACT_KO = '공개 Riot API에서 교전 전 신호가 얼마나 복원되는지 살펴본다.';

const en: PaperPageData = {
  id: 'cog-2026-engagement',
  venueLine: '2026 IEEE Conference on Games (CoG)',
  title: TITLE,
  titleKo: null,
  authors: [
    { name: 'Seongeun Baek', me: true, affiliation: ['Pusan National University', 'South Korea'] },
    { name: 'Joonho Kwon', me: false, affiliation: ['Pusan National University', 'South Korea'] },
  ],
  abstract: ABSTRACT,
  keywords: ['League of Legends', 'esports analytics', 'engagement-outcome prediction', 'public game telemetry'],
  abstractKo: null,
  presentation: 'Oral presentation · Madrid, Spain · Sep 1–4, 2026',
  statusNote: 'To appear in IEEE Xplore',
  code: 'https://github.com/Lunecid/LOL_teamfight_Lab/tree/v1.0-cog2026',
  doi: null,
  pdf: null,
  bibtex: '@inproceedings{baek2026killconditioned,\n  author    = {Baek, Seongeun and Kwon, Joonho},\n  year      = {2026}\n}',
};

const ko: PaperPageData = {
  ...en,
  titleKo: '1분 해상도 공개 텔레메트리에서의 리그 오브 레전드 킬 조건부 교전 결과 예측',
  abstractKo: ABSTRACT_KO,
  presentation: '구두 발표 · 스페인 마드리드 · 2026.09.01–04',
  statusNote: 'IEEE Xplore 게재 예정',
};

const render = (lang: 'ko' | 'en', paper: PaperPageData) => renderAstro(PaperSheet, { props: { lang, paper } });
const text = (html: string) => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');

describe('PaperSheet.astro', () => {
  it('en: running header, the paper title as the only h1, author blocks with affiliation, no e-mail', async () => {
    const html = await render('en', en);
    expect(html).toMatch(/<p class="paper__running"[^>]*lang="en"[^>]*>2026 IEEE Conference on Games \(CoG\)<\/p>/);
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toMatch(new RegExp(`<h1(?=[^>]*id="paper-title")(?=[^>]*lang="en")[^>]*>${TITLE}</h1>`));
    expect(html).toMatch(/<ul(?=[^>]*class="paper__authors")(?=[^>]*aria-label="Authors")[^>]*>/);
    expect(html.match(/class="paper__author-name"[^>]*>(Seongeun Baek|Joonho Kwon)</g)).toHaveLength(2);
    expect(html.match(/class="paper__affil"[^>]*>Pusan National University</g)).toHaveLength(2);
    expect(html).not.toMatch(/@pusan|mailto:|[a-z0-9]@[a-z]/i);
    expect(html).not.toContain('paper__title-ko');
    expect(html).not.toContain('국문');
  });

  it('en: "Abstract—" and "Index Terms—" are real h2 run-ins inside labelled English sections', async () => {
    const html = await render('en', en);
    expect(html).toMatch(
      /<section(?=[^>]*id="abstract")(?=[^>]*lang="en")(?=[^>]*aria-labelledby="abstract-label")[^>]*>\s*<h2[^>]*id="abstract-label"[^>]*>Abstract<span aria-hidden="true"[^>]*>—<\/span><\/h2><p class="paper__text"[^>]*>We study/,
    );
    expect(html).toMatch(
      /<section(?=[^>]*lang="en")(?=[^>]*aria-labelledby="index-terms-label")[^>]*>\s*<h2[^>]*id="index-terms-label"[^>]*>Index Terms<span aria-hidden="true"[^>]*>—<\/span><\/h2><p class="paper__text"[^>]*>League of Legends, esports analytics, engagement-outcome prediction, public game telemetry<\/p>/,
    );
  });

  it('omits Index Terms when the paper has no keywords', async () => {
    const html = await render('en', { ...en, keywords: [] });
    expect(html).not.toContain('Index Terms');
    expect(html).toContain('id="abstract"');
  });

  it('ko: Korean title marked (국문 제목) under the English h1, and a "국문 초록—" run-in after the English abstract', async () => {
    const html = await render('ko', ko);
    expect(html).toMatch(/<p class="paper__title-ko"[^>]*lang="ko"[^>]*>1분 해상도[^<]*예측 <span class="paper__title-ko-mark"[^>]*>\(국문 제목\)<\/span><\/p>/);
    expect(html).toMatch(/<ul(?=[^>]*class="paper__authors")(?=[^>]*aria-label="저자")[^>]*>/);
    expect(html).toMatch(
      /<section(?=[^>]*lang="ko")(?=[^>]*aria-labelledby="abstract-ko-label")[^>]*>\s*<h2[^>]*id="abstract-ko-label"[^>]*>국문 초록<span aria-hidden="true"[^>]*>—<\/span><\/h2><p class="paper__text"[^>]*>공개 Riot API/,
    );
    // The Korean abstract section has no id, so ko and en pages expose the same section ids (i18n parity).
    expect(html).not.toMatch(/<section(?=[^>]*lang="ko")(?=[^>]*\bid=)[^>]*>/);
    const plain = text(html);
    expect(plain.indexOf(ABSTRACT)).toBeGreaterThan(-1);
    expect(plain.indexOf(ABSTRACT_KO)).toBeGreaterThan(plain.indexOf(ABSTRACT));
  });

  it('footnote: presentation, status note and the Code link; DOI/PDF only when set', async () => {
    const html = await render('en', en);
    expect(text(html)).toContain('Oral presentation · Madrid, Spain · Sep 1–4, 2026 To appear in IEEE Xplore');
    expect(html).toMatch(/Code:<\/span> <a class="paper__link" href="https:\/\/github\.com\/Lunecid\/LOL_teamfight_Lab\/tree\/v1\.0-cog2026"[^>]*>github\.com\/Lunecid\/LOL_teamfight_Lab\/tree\/v1\.0-cog2026<\/a>/);
    expect(html).not.toContain('doi.org');
    expect(html).not.toMatch(/>PDF:/);

    const published = await render('en', { ...en, doi: '10.1109/CoG00000.2026.0000000', pdf: '/papers/cog-2026.pdf', statusNote: null });
    expect(published).toMatch(/DOI:<\/span> <a class="paper__link" href="https:\/\/doi\.org\/10\.1109\/CoG00000\.2026\.0000000"[^>]*>10\.1109\/CoG00000\.2026\.0000000<\/a>/);
    expect(published).toMatch(/PDF:<\/span> <a class="paper__link" href="\/papers\/cog-2026\.pdf"/);
    expect(published).not.toContain('To appear');
  });

  it('link list: DOI without a PDF, and a PDF without a DOI, each show only their own line', async () => {
    const linkLabels = (html: string) => [...html.matchAll(/<span class="paper__link-label"[^>]*>([^<]+):<\/span>/g)].map((m) => m[1]);

    const doiOnly = await render('en', { ...en, doi: '10.1109/CoG00000.2026.0000000', pdf: null, statusNote: null });
    expect(linkLabels(doiOnly)).toEqual(['Code', 'DOI']);
    expect(doiOnly).toMatch(/<a class="paper__link" href="https:\/\/doi\.org\/10\.1109\/CoG00000\.2026\.0000000"/);
    expect(doiOnly).not.toMatch(/\.pdf"/);

    const pdfOnly = await render('ko', { ...ko, doi: null, pdf: '/papers/cog-2026.pdf' });
    expect(linkLabels(pdfOnly)).toEqual(['Code', 'PDF']);
    expect(pdfOnly).toMatch(/<a class="paper__link" href="\/papers\/cog-2026\.pdf"[^>]*>\/papers\/cog-2026\.pdf<\/a>/);
    expect(pdfOnly).not.toContain('doi.org');

    const noCode = await render('en', { ...en, code: null, doi: '10.1109/CoG00000.2026.0000000' });
    expect(linkLabels(noCode)).toEqual(['DOI']);
    const none = await render('en', { ...en, code: null });
    expect(none).not.toContain('paper__links');
  });

  it('ends with the BibTeX block and the end-of-page sentinel that unlocks finish-cog-story', async () => {
    const html = await render('ko', ko);
    const bib = html.indexOf('id="bibtex"');
    const end = html.indexOf('data-paper-end');
    expect(bib).toBeGreaterThan(html.indexOf('abstract-ko-label'));
    expect(end).toBeGreaterThan(bib);
    const src = readSource('src/components/research/PaperSheet.astro');
    expect(src).toMatch(/querySelector\('\[data-paper-end\]'\)/);
    expect(src.match(/emitTrigger\('finish-cog-story'\)/g)).toHaveLength(1);
  });

  it('typography: Times-like system serif token, justified hyphenated English, left-aligned keep-all Korean', () => {
    const src = readSource('src/components/research/PaperSheet.astro');
    const tokens = readSource('src/styles/tokens.css');
    expect(tokens).toMatch(/--font-paper: "Times New Roman", Times, "TeX Gyre Termes", "Nimbus Roman", "Liberation Serif",\s*"Noto Serif KR", "Nanum Myeongjo", "AppleMyungjo", "Batang", serif;/);
    expect(src).toMatch(/\.paper \{[^}]*font-family: var\(--font-paper\);[^}]*font-size: 17px;[^}]*line-height: 1\.5;/);
    // Fix round 1: ragged right on phones, justified from 640px; hyphens: auto in both.
    expect(src).toMatch(/\n  \.paper__block--en \{ text-align: left; hyphens: auto;/);
    expect(src).toMatch(/@media \(min-width: 640px\) \{\s*\.paper__block--en \{ text-align: justify; text-justify: inter-word; \}/);
    expect(src).toMatch(/\.paper__block--ko \{[^}]*text-align: start;[^}]*word-break: keep-all;/);
    expect(src).toMatch(/\.paper__block--ko \.paper__runin \{ font-style: normal; \}/);
    // Batch 2: the Korean text uses the Korean serif first (its font rule is on the Korean page only).
    expect(tokens).toMatch(/--font-paper-ko: "SB Serif KR", var\(--font-paper\);/);
    expect(src).toMatch(/\.paper \[lang="ko"\], \.paper__foot:lang\(ko\) \{ font-family: var\(--font-paper-ko\); \}/);
    expect(src).not.toMatch(/@import|@font-face|fonts\.googleapis/);
  });

  it('P-07 F-048 (owner decision 18): with requestEmail, a line under Code asks for the full text by email', async () => {
    const html = await renderAstro(PaperSheet, { props: { lang: 'ko', paper: ko, requestEmail: 'me@example.com' } });
    expect(text(html)).toContain('전문은 이메일로 요청해 주세요: me@example.com');
    expect(html).toMatch(/<a class="paper__link" href="mailto:me@example\.com"/);
    expect(text(html).indexOf('Code:')).toBeGreaterThan(-1);
    expect(text(html).indexOf('Code:')).toBeLessThan(text(html).indexOf('전문은 이메일로'));
    expect(await render('en', en)).not.toContain('mailto:');
  });
});
