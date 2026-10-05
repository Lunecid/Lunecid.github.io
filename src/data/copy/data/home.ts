// src/data/copy/data/home.ts — the general version's home copy (spec §8 hero, §10.2 order, B-12). Facts appear only as
// fact tokens (R-4; resolved with resolveDeep in HomeView); hrefs are base form (pageHref adds /data and /en).
import type { Localized } from '../../../i18n/utils';

/**
 * DS-4: one stat tile — a fact (value, with an optional small unit or prefix) and the words the site's own sentence
 * puts next to it. labelFirst: the sentence names the label first, so the tile's DOM order does too.
 */
export interface StatDef {
  value: string;
  label: string;
  unit?: string;
  prefix?: string;
  labelFirst?: boolean;
}

export interface DataHomeCopy {
  /** §8 "근거 줄": the hero's evidence line (the hero shows it as the second and third stat tiles). */
  evidence: string;
  /** DS-4: the hero's stat tiles = the identity status line, then the evidence line, in their own order. */
  heroStats: StatDef[];
  /** DS-4: the research figure tiles: the paper's abstract numbers with fragments of the same-language abstract. */
  researchStats: StatDef[];
  cta: { projects: { label: string; href: string }; cv: { label: string } };
  /** B-12: the hero figure is the school-zone risk heatmap (that project's cover); its caption and the project link. */
  heroFigure: { caption: string; href: string };
  /** §10.2 item 3: the CoG paper told as it is. */
  researchSentence: string;
  moreProjects: string;
}

export const dataHomeCopy: Localized<DataHomeCopy> = {
  ko: {
    evidence: '{awards.name:top} {awards.count:top}회 · {pub.cog-2026-engagement.venueShort} {pub.cog-2026-engagement.format}',
    heroStats: [
      { value: '{person.graduation}', label: '석사 졸업 예정' },
      { label: '{awards.name:top}', value: '{awards.count:top}회', labelFirst: true },
      { label: '{pub.cog-2026-engagement.venueShort}', value: '{pub.cog-2026-engagement.format}', labelFirst: true },
    ],
    researchStats: [
      { label: '한국 서버 마스터 이상 솔로 랭크', value: '{pub.cog-2026-engagement.fact.matches}', unit: '경기', labelFirst: true },
      { label: 'LightGBM', prefix: 'AUC', value: '{pub.cog-2026-engagement.fact.bestAuc}', labelFirst: true },
      { label: '비표 형식 신경망 기준선', value: '{pub.cog-2026-engagement.fact.neuralRange}', labelFirst: true },
    ],
    cta: { projects: { label: '프로젝트 보기', href: '/projects/' }, cv: { label: '이력서 PDF' } },
    heroFigure: { caption: '{project.school-zone-blindspots.title} — 부산 도로 지점별 어린이 보행자 사고 위험도를 예측한 지도입니다.', href: '/projects/school-zone-blindspots/' },
    researchSentence: '공개 경기 기록으로 교전 결과를 예측한 연구입니다.',
    moreProjects: '프로젝트 전체 보기',
  },
  en: {
    evidence: '{awards.name:top} ×{awards.count:top} · {pub.cog-2026-engagement.format} at {pub.cog-2026-engagement.venueShort}',
    heroStats: [
      { label: 'M.S. expected', value: '{person.graduation}', labelFirst: true },
      { label: '{awards.name:top}', value: '×{awards.count:top}', labelFirst: true },
      { value: '{pub.cog-2026-engagement.format}', label: '{pub.cog-2026-engagement.venueShort}' },
    ],
    researchStats: [
      { value: '{pub.cog-2026-engagement.fact.matches}', label: 'Korean Master+ ranked solo/duo', unit: 'matches' },
      { label: 'LightGBM', prefix: 'AUC', value: '{pub.cog-2026-engagement.fact.bestAuc}', labelFirst: true },
      { label: 'non-tabular neural baselines', value: '{pub.cog-2026-engagement.fact.neuralRange}', labelFirst: true },
    ],
    cta: { projects: { label: 'See projects', href: '/projects/' }, cv: { label: 'Résumé PDF' } },
    heroFigure: { caption: '{project.school-zone-blindspots.title} — a map of the predicted child-pedestrian accident risk at each road point in Busan.', href: '/projects/school-zone-blindspots/' },
    researchSentence: 'A study that predicts engagement outcomes from public match records.',
    moreProjects: 'See all projects',
  },
};
