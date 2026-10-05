import { describe, expect, it } from 'vitest';
import InterestCards from '../../src/components/research/InterestCards.astro';
import InProgressList from '../../src/components/research/InProgressList.astro';
import PublicationItem from '../../src/components/research/PublicationItem.astro';
import thumb from '../../src/assets/research/cog-2026/label-horizon.webp';
import { researchPage } from '../../src/data/research-page';
import { resolveLocalizedDeep } from '../../src/lib/facts';
import type { PaperCardData } from '../../src/lib/publications';
import { loadFactSource } from '../helpers/fact-source';
import { renderAstro } from './helpers';

// The lists as ResearchView passes them since P1-8: { ko, en } pairs, each leaf resolved in its own language (CA-6).
const interests = resolveLocalizedDeep(researchPage.interests, loadFactSource());
const ongoing = resolveLocalizedDeep(researchPage.ongoing, loadFactSource());

const HUD = /(?<![\w-])(read-sec|read|lh-rows|lh-row|lh-idx|lh-chips|lh-chip|lh-tag|lh-frame|bracket|btn|cut|badge|hud-label)(?![\w-])/;
const paper: PaperCardData = {
  id: 'cog-2026-engagement', href: '/data/research/cog-2026-engagement/', title: 'Kill-Conditioned Engagement Outcome Prediction',
  titleGloss: '교전 결과 예측', authors: [{ name: 'Seongeun Baek', me: true }, { name: 'Joonho Kwon', me: false }],
  venue: 'IEEE Conference on Games (CoG 2026)', venueShort: 'IEEE CoG 2026', year: 2026, oral: true, tldr: '한 줄 요약입니다.',
  abstract: '초록입니다.', abstractLang: 'ko', bibtex: '@inproceedings{a,\n  year = {2026}\n}', pdf: null, doi: null,
  code: 'https://github.com/Lunecid/LOL_teamfight_Lab/tree/v1.0-cog2026', statusNote: null, thumb, thumbAlt: '논문 그림',
};

describe('research page components on the general version (P2-8)', () => {
  // Named change (DS-8): plain rows → plain cards (aria-hidden number, no data-serif); figures and numbering unchanged.
  it('InterestCards: plain cards with an aria-hidden number, figures numbered 그림 1–3 in page order, the AUC chart in the editorial tone', async () => {
    const html = await renderAstro(InterestCards, { props: { variant: 'data', lang: 'ko', interests } });
    expect(html).toMatch(/<section id="interests" class="interests ed-sec"/);
    expect(html).toMatch(/<ol class="ed-icards" role="list"/);
    expect(html.match(/<li class="ed-icard"[^>]*data-interest=/g)).toHaveLength(interests.length);
    const marks = [...html.matchAll(/<span class="ed-icard__n" aria-hidden="true"[^>]*>(\d\d)<\/span>/g)].map((m) => m[1]);
    expect(marks).toEqual(interests.map((_, i) => String(i + 1).padStart(2, '0')));
    const numbers = [...html.matchAll(/<span class="ed-figcap__num"[^>]*>그림 (\d) —<\/span>/g)].map((m) => Number(m[1]));
    expect(numbers.sort()).toEqual([1, 2, 3]);
    expect(html.match(/<h3 class="ed-item__title"[^>]*>/g)).toHaveLength(interests.length);
    expect(html).not.toContain('data-serif');
    expect(html).toMatch(/<a class="interests__full hit"/);
    expect(html).toMatch(/class="interests__full hit"[^>]*data-viewer="figures"/);
    expect(html).toMatch(/chart--editorial/);
    expect(html.replace(/class="[^"]*chart[^"]*"/g, '')).not.toMatch(HUD);
    expect(html).not.toMatch(/FIG ·|KILL-GAP KDE|AUC BY MODEL/);
  });

  // Named change (DS-8): the quiet tag → the 진행 중 band pattern (status on a yellow painted cell, text cell beside it).
  it('InProgressList: each item as a 진행 중 band — the status on paint (data-paint-text), title and line in the neutral cell', async () => {
    for (const lang of ['ko', 'en'] as const) {
      const html = await renderAstro(InProgressList, { props: { variant: 'data', lang, items: ongoing } });
      expect(html).toMatch(/<section id="in-progress" class="progress-list ed-sec"/);
      expect(html.match(/<li class="ed-now ed-now--row"[^>]*data-item=/g)).toHaveLength(ongoing.length);
      const labels = [...html.matchAll(/<p class="ed-now__label" data-paint-text[^>]*>([^<]+)<\/p>/g)].map((m) => m[1]);
      expect(labels).toEqual(ongoing.map((item) => item.status[lang]));
      expect(html.match(/<div class="ed-now__text"[^>]*><h3 class="ed-item__title"/g)).toHaveLength(ongoing.length);
      expect(html).not.toMatch(/data-serif|ed-tag/);
      expect(html).not.toMatch(HUD);
    }
  });

  it('PublicationItem: no panel or corner marks, the oral talk as words, the title link with a 44px hit area', async () => {
    const html = await renderAstro(PublicationItem, { props: { variant: 'data', lang: 'ko', paper } });
    expect(html).toMatch(/<article class="pub pub--ed"[^>]*data-paper="cog-2026-engagement"/);
    expect(html).toMatch(/<a class="hit" href="\/data\/research\/cog-2026-engagement\/"/);
    expect(html).toMatch(/<span class="pub__oral-ed ed-tbox"[^>]*>구두 발표<\/span>/); // DS-7 (named): the ink-boxed tag (one badge per view)
    expect(html).not.toMatch(/bracket|pub--oral|>ORAL</);
  });
});
