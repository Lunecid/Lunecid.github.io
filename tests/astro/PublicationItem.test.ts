import { describe, expect, it } from 'vitest';
import PublicationItem from '../../src/components/research/PublicationItem.astro';
import thumb from '../../src/assets/research/cog-2026/label-horizon.webp';
import type { PaperCardData } from '../../src/lib/publications';
import { readSource, renderAstro } from './helpers';

const ko: PaperCardData = {
  id: 'cog-2026-engagement',
  href: '/game/research/cog-2026-engagement/',
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
  tldr: '교전 직전 30초의 공개 Riot 기록만으로 교전 뒤 어느 팀이 이득을 볼지 예측했습니다.',
  abstract: '공개 Riot API에서 교전 결과 예측에 쓸 수 있는 교전 전 신호가 얼마나 복원되는지 살펴본다.',
  abstractLang: 'ko',
  bibtex: '@inproceedings{baek2026killconditioned,\n  author    = {Baek, Seongeun and Kwon, Joonho},\n  year      = {2026}\n}',
  pdf: null,
  doi: null,
  code: 'https://github.com/Lunecid/LOL_teamfight_Lab/tree/v1.0-cog2026',
  statusNote: 'IEEE Xplore 게재 예정',
  thumb,
  thumbAlt: '논문 그림 1. 킬 사건과 60초 타임라인 프레임이 하나의 교전이 된다.',
};

const en: PaperCardData = {
  ...ko,
  href: '/en/game/research/cog-2026-engagement/',
  titleGloss: null,
  tldr: 'Predicts which team gains from a fight using only 30 seconds of public telemetry.',
  abstract: 'We study how much pre-engagement signal is recoverable from the public Riot API.',
  abstractLang: 'en',
  statusNote: 'To appear in IEEE Xplore',
  thumbAlt: 'Figure 1 of the paper.',
};

const render = (props: Record<string, unknown>) => renderAstro(PublicationItem, { props });

describe('PublicationItem.astro', () => {
  it('English title, gloss only on ko', async () => {
    const koHtml = await render({ lang: 'ko', paper: ko });
    expect(koHtml).toMatch(
      /<h3(?=[^>]*class="pub__title")(?=[^>]*lang="en")[^>]*>\s*<a[^>]*href="\/game\/research\/cog-2026-engagement\/"[^>]*>Kill-Conditioned Engagement Outcome Prediction/,
    );
    expect(koHtml).toMatch(/<p(?=[^>]*class="pub__gloss")[^>]*>1분 해상도 공개 텔레메트리/);
    // P2-28: the Korean title is marked "(국문 제목)", never "한국어 풀이".
    expect(koHtml).toMatch(/<span class="pub__gloss-mark"[^>]*>\(국문 제목\)<\/span><\/p>/);
    expect(koHtml).not.toContain('풀이');

    // Even if a caller forgets to drop the gloss, English pages never show it.
    const enHtml = await render({ lang: 'en', paper: { ...en, titleGloss: 'GLOSS MUST NOT RENDER' } });
    expect(enHtml).toContain('Kill-Conditioned Engagement Outcome Prediction');
    expect(enHtml).not.toContain('pub__gloss');
    expect(enHtml).not.toContain('GLOSS MUST NOT RENDER');
  });

  it('own name in strong', async () => {
    const html = await render({ lang: 'ko', paper: ko });
    expect(html).toMatch(/<strong[^>]*>Seongeun Baek<\/strong>/);
    expect(html).toContain('Joonho Kwon');
    expect(html).not.toMatch(/<strong[^>]*>Joonho Kwon/);
  });

  it('ORAL badge', async () => {
    const html = await render({ lang: 'ko', paper: ko });
    expect(html.match(/class="pub__oral"/g)).toHaveLength(1);
    expect(html).toMatch(/<span(?=[^>]*class="pub__oral")(?=[^>]*lang="en")[^>]*>ORAL<\/span>/);
    const poster = await render({ lang: 'ko', paper: { ...ko, oral: false } });
    expect(poster).not.toContain('pub__oral');
  });

  it('abstract is a real button (aria-expanded/aria-controls) carrying data-trigger=open-abstract, panel below the row, open by default (works without JS)', async () => {
    const html = await render({ lang: 'ko', paper: ko });
    expect(html.match(/data-trigger="open-abstract"/g)).toHaveLength(1);
    // Fix round 2 item 5: aria-expanded starts "false" — the actual state once JS runs, which now collapses the
    // panel pre-paint via CSS instead of a deferred script (no open-then-collapse flash/CLS). The panel itself
    // still has no `hidden` attribute, so a no-JS visitor (who never gets the `html.js` class the CSS keys on)
    // still reads it inline, unaffected.
    expect(html).toMatch(
      /<button(?=[^>]*type="button")(?=[^>]*aria-expanded="false")(?=[^>]*aria-controls="cog-2026-engagement-abstract")(?=[^>]*data-trigger="open-abstract")(?=[^>]*data-disclosure)[^>]*>\s*초록\s*<\/button>/,
    );
    expect(html).toMatch(
      /<div(?=[^>]*id="cog-2026-engagement-abstract")(?=[^>]*class="pub__panel")(?![^>]*hidden)(?![^>]*data-open)[^>]*>\s*<p[^>]*class="pub__panel-label"[^>]*>초록<\/p>\s*<p(?=[^>]*class="pub__abstract")(?=[^>]*lang="ko")[^>]*>공개 Riot API/,
    );
    // The disclosure-trigger module is bundled with the shared link row (PaperLinks.astro, final review fix 1 item 4).
    expect(html).toMatch(/<script(?=[^>]*type="module")(?=[^>]*src="[^"]*type=script)/);
    const enHtml = await render({ lang: 'en', paper: en });
    expect(enHtml).toMatch(/>\s*Abstract\s*<\/button>/);
    expect(enHtml).toMatch(/<p[^>]*class="pub__panel-label"[^>]*>Abstract<\/p>/);
    expect(enHtml).toMatch(/<p(?=[^>]*lang="en")[^>]*>We study/);
  });

  it('fix round 3 item 3: disclosure toggles stay hidden without JS and show under html.js', async () => {
    // Whitespace-tolerant check of the CSS intent (not exact source formatting). Live behaviour is in e2e/nojs.
    const src = readSource('src/components/research/PaperLinks.astro').replace(/\s+/g, ' ');
    expect(src).toMatch(/\.pub__btn\[data-disclosure\]\s*\{\s*display:\s*none\s*;?\s*\}/);
    expect(src).toMatch(/html\.js\)\s*\.pub__btn\[data-disclosure\]\s*\{\s*display:\s*inline-flex\s*;?\s*\}/);
    const html = await render({ lang: 'ko', paper: ko });
    expect(html).toMatch(/data-disclosure/);
  });

  it('BibTeX button has no data-trigger and its panel reuses BibtexBlock (P2-9: wraps, has a copy button, no heading)', async () => {
    const html = await render({ lang: 'ko', paper: ko });
    expect(html).toMatch(
      /<button(?=[^>]*type="button")(?=[^>]*aria-expanded="false")(?=[^>]*aria-controls="cog-2026-engagement-bibtex")(?![^>]*data-trigger)(?=[^>]*data-disclosure)[^>]*>\s*BibTeX\s*<\/button>/,
    );
    expect(html).toMatch(
      /<div(?=[^>]*id="cog-2026-engagement-bibtex")(?=[^>]*class="pub__panel")(?![^>]*hidden)[^>]*>\s*<p[^>]*class="pub__panel-label"[^>]*>BibTeX<\/p>/,
    );
    // BibtexBlock.astro embedded with heading={false} square (fix round 1 item 7): a plain <div> (not <section
    // aria-labelledby>, no nested <h2> under this article's h3/h4), the copy button named directly instead, and
    // square corners (P1-9) instead of the paper page's rounded ones.
    expect(html).toMatch(/<div(?=[^>]*id="cog-2026-engagement-bib")(?=[^>]*class="bib bib--square")[^>]*data-bib/);
    expect(html).not.toMatch(/<h2[^>]*>BibTeX<\/h2>/);
    expect(html).not.toContain('aria-labelledby="cog-2026-engagement-bib-title"');
    // Fix round 2 item 6: no fixed aria-label — the accessible name comes from whichever visible-state span is
    // showing (idle/done/fail), never a stale "BibTeX 복사" once the text has moved on.
    expect(html).toMatch(/<button(?=[^>]*class="bib__copy")(?![^>]*aria-label)[^>]*>/);
    expect(html).toMatch(/<span(?=[^>]*class="bib__line")[^>]*>@inproceedings\{baek2026killconditioned,<\/span>/);
    expect(html).toContain('author    = {Baek, Seongeun and Kwon, Joonho}');
  });

  it('pending label instead of PDF/DOI', async () => {
    const html = await render({ lang: 'ko', paper: ko });
    expect(html).toMatch(/<span(?=[^>]*class="pub__pending")[^>]*>PDF · IEEE Xplore 게재 예정<\/span>/);
    expect(html).not.toMatch(/<a[^>]*>PDF<\/a>/);
    expect(html).not.toContain('doi.org');

    const published = await render({ lang: 'ko', paper: { ...ko, pdf: '/papers/cog-2026.pdf', doi: '10.1109/CoG.2026.1' } });
    expect(published).not.toContain('pub__pending');
    expect(published).toMatch(/<a[^>]*href="\/papers\/cog-2026\.pdf"[^>]*>PDF<\/a>/);
    expect(published).toMatch(/<a[^>]*href="https:\/\/doi\.org\/10\.1109\/CoG\.2026\.1"[^>]*>DOI<\/a>/);
  });

  it('Code link to the tag', async () => {
    const html = await render({ lang: 'ko', paper: ko });
    expect(html).toMatch(/<a[^>]*href="https:\/\/github\.com\/Lunecid\/LOL_teamfight_Lab\/tree\/v1\.0-cog2026"[^>]*>Code/);
    const noCode = await render({ lang: 'ko', paper: { ...ko, code: null } });
    expect(noCode).not.toContain('LOL_teamfight_Lab');
  });

  it('compact variant has no thumbnail; full row uses empty alt (F-057: Fig. 1 alt is on the interest figure only)', async () => {
    const full = await render({ lang: 'ko', paper: ko });
    expect(full).toMatch(/<img[^>]*\salt(?:="")?[\s>]/);
    expect(full).not.toMatch(/alt="논문 그림 1/);
    const compact = await render({ lang: 'ko', paper: ko, compact: true });
    expect(compact).not.toMatch(/<img\b/);
    expect(compact).not.toContain('pub__media');
    expect(compact).toContain('pub__title');
  });

  it('links the paper page only when href is set', async () => {
    const html = await render({ lang: 'ko', paper: ko });
    expect(html.match(/href="\/game\/research\/cog-2026-engagement\/"/g)).toHaveLength(2); // title + 논문 페이지 button
    expect(html).toMatch(/<a[^>]*href="\/game\/research\/cog-2026-engagement\/"[^>]*>논문 페이지<\/a>/);
    const plain = await render({ lang: 'ko', paper: { ...ko, href: null } });
    expect(plain).not.toContain('/research/cog-2026-engagement/');
    expect(plain).toMatch(/<h3[^>]*class="pub__title"[^>]*>Kill-Conditioned/);
  });

  it('renders the requested heading level', async () => {
    const html = await render({ lang: 'ko', paper: ko, headingLevel: 4 });
    expect(html).toMatch(/<h4[^>]*class="pub__title"/);
    expect(html).not.toMatch(/<h3\b/);
  });
});
