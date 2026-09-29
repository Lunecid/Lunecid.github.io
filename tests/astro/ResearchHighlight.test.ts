import { describe, expect, it } from 'vitest';
import ResearchHighlight from '../../src/components/home/ResearchHighlight.astro';
import thumb from '../../src/assets/research/cog-2026/label-horizon.webp';
import { figureCopy } from '../../src/data/research/cog-2026';
import type { PaperCardData } from '../../src/lib/publications';
import { readSource, renderAstro } from './helpers';

const paper: PaperCardData = {
  id: 'cog-2026-engagement',
  href: '/research/cog-2026-engagement/',
  title: 'Kill-Conditioned Engagement Outcome Prediction in League of Legends Under Minute-Resolution Public Telemetry',
  titleGloss: '1분 해상도 공개 텔레메트리에서의 리그 오브 레전드 킬 조건부 교전 결과 예측',
  authors: [
    { name: 'Seongeun Baek', me: true },
    { name: 'Joonho Kwon', me: false },
  ],
  venue: 'IEEE Conference on Games (CoG 2026)',
  venueShort: 'IEEE CoG 2026',
  year: 2026,
  oral: true,
  tldr: '교전 직전 30초의 공개 경기 기록(Riot API)만으로 교전 뒤 어느 팀이 이득을 볼지 예측했습니다.',
  abstract: '공개 Riot API에서 교전 전 신호가 얼마나 복원되는지 살펴본다.',
  abstractLang: 'ko',
  bibtex: '@inproceedings{baek2026killconditioned,\n  year = {2026}\n}',
  pdf: null,
  doi: null,
  code: 'https://github.com/Lunecid/LOL_teamfight_Lab/tree/v1.0-cog2026',
  statusNote: 'IEEE Xplore 게재 예정',
  thumb,
  thumbAlt: '논문 그림 1',
};

describe('ResearchHighlight.astro', () => {
  it('section#research-highlight with ORAL badge, bold own name, the abstract disclosure with data-trigger=open-abstract, pending PDF label', async () => {
    const html = await renderAstro(ResearchHighlight, { props: { lang: 'ko', paper, nowPlaying: '준비 중: 석사 학위논문', figureLabel: 'FIG · CoG 2026 · AUC BY MODEL' } });
    expect(html).toMatch(/<section[^>]*id="research-highlight"[^>]*class="rh read read-sec"/);
    expect(html).toContain('연구 하이라이트');
    expect(html).toMatch(/<span[^>]*class="paper__oral"[^>]*>ORAL<\/span>/);
    expect(html).toMatch(/<strong[^>]*>Seongeun Baek<\/strong>/);
    expect(html).not.toMatch(/<strong[^>]*>Joonho Kwon<\/strong>/);
    expect(html).toMatch(/<p(?=[^>]*class="pub__abstract")(?=[^>]*lang="ko")[^>]*>/);
    expect(html).toMatch(/<span[^>]*class="pub__pending"[^>]*>PDF · IEEE Xplore 게재 예정<\/span>/);
    // fix round 1 minor: reuses BibtexBlock.astro (heading={false} square) instead of a duplicated <pre>.
    expect(html).toMatch(/<div(?=[^>]*id="rh-bib")(?=[^>]*class="bib bib--square")(?=[^>]*data-bib)[^>]*>/);
    expect(html).toMatch(/<span[^>]*class="bib__line"[^>]*>@inproceedings\{baek2026killconditioned,<\/span>/);
    expect(html).toMatch(/<a[^>]*href="\/research\/cog-2026-engagement\/"[^>]*>논문 페이지<\/a>/);
    expect(html).toMatch(/<a[^>]*href="https:\/\/github.com\/Lunecid\/LOL_teamfight_Lab\/tree\/v1.0-cog2026"/);
    expect(html).toContain('[ NOW PLAYING ]');
    expect(html).toContain('준비 중: 석사 학위논문');
    // P2-28: the Korean title is marked "(국문 제목)", not the old screen-reader "한국어 풀이:" prefix.
    expect(html).toMatch(/<span class="paper__gloss-mark"[^>]*>\(국문 제목\)<\/span>/);
    expect(html).not.toContain('풀이');
    expect(html).toMatch(/<script\b[^>]*src="[^"]*PaperLinks\.astro\?astro&(?:amp;)?type=script/);
  });

  it('final review fix 1 item 4: the P2-9 disclosure pattern of /research/ (buttons in one row, panels below it, visible without JS)', async () => {
    const html = await renderAstro(ResearchHighlight, { props: { lang: 'ko', paper, nowPlaying: 'x', figureLabel: 'FIG · CoG 2026 · AUC BY MODEL' } });
    // No <details> growing inside the chip row any more (the chart's own "view as table" <details> is in .paper__fig).
    const body = html.slice(html.indexOf('class="paper__body"'), html.indexOf('class="paper__fig"'));
    expect(body.length).toBeGreaterThan(0);
    expect(body).not.toMatch(/<details|<summary/);
    const row = /<div class="pub__links"[^>]*>([\s\S]*?)<\/div>\s*<div(?=[^>]*id="rh-abstract")/.exec(html)?.[1];
    expect(row, 'the link row is followed by the abstract panel').toBeDefined();
    expect(row).toMatch(
      /<button(?=[^>]*type="button")(?=[^>]*aria-expanded="false")(?=[^>]*aria-controls="rh-abstract")(?=[^>]*data-trigger="open-abstract")(?=[^>]*data-disclosure)[^>]*>\s*초록\s*<\/button>/,
    );
    expect(row).toMatch(/<button(?=[^>]*aria-controls="rh-bibtex")(?![^>]*data-trigger)(?=[^>]*data-disclosure)[^>]*>\s*BibTeX\s*<\/button>/);
    expect(row).not.toContain('pub__panel');
    // Panels come after the row, open in the markup (a no-JS visitor reads them inline; html.js collapses them pre-paint).
    expect(html).toMatch(/<div(?=[^>]*id="rh-abstract")(?=[^>]*class="pub__panel")(?![^>]*hidden)(?![^>]*data-open)[^>]*>\s*<p[^>]*class="pub__panel-label"[^>]*>초록<\/p>/);
    expect(html).toMatch(/<div(?=[^>]*id="rh-bibtex")(?=[^>]*class="pub__panel")(?![^>]*hidden)[^>]*>\s*<p[^>]*class="pub__panel-label"[^>]*>BibTeX<\/p>/);
    // One implementation: the home copy renders the same component as /research/ and /records/.
    const home = readSource('src/components/home/ResearchHighlight.astro');
    expect(home).toMatch(/<PaperLinks lang=\{lang\} paper=\{paper\} idBase="rh" \/>/);
    expect(readSource('src/components/research/PublicationItem.astro')).toMatch(/<PaperLinks lang=\{lang\} paper=\{paper\} \/>/);
  });

  it('links the PDF and DOI instead of the pending label once they exist', async () => {
    const html = await renderAstro(ResearchHighlight, {
      props: { lang: 'en', paper: { ...paper, pdf: '/papers/cog-2026.pdf', doi: '10.1109/CoG00000.2026.0000000', statusNote: null, titleGloss: null, abstractLang: 'en' }, nowPlaying: 'In preparation', figureLabel: 'FIG · CoG 2026 · AUC BY MODEL' },
    });
    expect(html).not.toContain('pub__pending');
    expect(html).toMatch(/<a[^>]*href="\/papers\/cog-2026.pdf"[^>]*>PDF<\/a>/);
    expect(html).toMatch(/<a[^>]*href="https:\/\/doi.org\/10.1109\/CoG00000.2026.0000000"[^>]*>DOI<\/a>/);
    expect(html).not.toContain('paper__gloss');
    expect(html).not.toContain('연구 하이라이트');
    expect(html).toMatch(/>Paper page<\/a>/);
  });

  it('P1-9: the paper AUC chart replaces the 160px diagram thumbnail, in one bracketed light-HUD panel', async () => {
    const html = await renderAstro(ResearchHighlight, { props: { lang: 'ko', paper, nowPlaying: 'x', figureLabel: 'FIG · CoG 2026 · AUC BY MODEL' } });
    expect(html).not.toMatch(/<img/);
    expect(html).toMatch(/<article class="paper lh-frame bracket bracket--sm"/);
    expect(html).toMatch(/class="chart chart--overall"/);
    expect(html).toContain('id="rh-auc-title-wide"'); // its own ids: the no-art hero shows the same chart on /
    expect(html).toContain(figureCopy.aucOverall.alt.ko);
    expect(html).toContain('FIG</span> · CoG 2026 · AUC BY MODEL');
    expect(html).not.toMatch(/border-radius/);
  });
});
