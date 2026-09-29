// src/data/copy/home.ts — home-only copy (hero and MAIN MENU copy live in ./hero.ts).
// Hrefs are never stored here; views build them with pageHref.
// The CoG card comes from the publication's frontmatter card (toPaperCartridge, A-16).
import type { Localized } from '../../i18n/utils';

interface HomeCopy {
  moreProjects: string;
  researchNowPlaying: string;
  helloRecords: string[];
}

export const homeCopy: Localized<HomeCopy> = {
  ko: {
    moreProjects: '프로젝트 전체 보기',
    researchNowPlaying: '준비 중: 석사 학위논문 · CoG 논문 저널 확장 / 진행 중: PUBG 생존 모델',
    helloRecords: ['{pub.cog-2026-engagement.venueShort} 구두 발표', '{awards.name:top} ×{awards.count:top} · {awards.name:encouragement} ×{awards.count:encouragement}', '{cert.adsp.short} · {cert.cds-bigdata-2.short}'],
  },
  en: {
    moreProjects: 'See all projects',
    researchNowPlaying: 'In preparation: M.S. thesis · journal extension of the CoG paper / Ongoing: PUBG survival model',
    helloRecords: ['{pub.cog-2026-engagement.venueShort} oral presentation', '{awards.name:top} ×{awards.count:top} · {awards.name:encouragement} ×{awards.count:encouragement}', '{cert.adsp.short} · {cert.cds-bigdata-2.short}'],
  },
};
