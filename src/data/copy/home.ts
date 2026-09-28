// src/data/copy/home.ts — home-only copy (hero and MAIN MENU copy live in ./hero.ts).
// Hrefs are never stored here; views build them with localizeHref.
import type { Localized } from '../../i18n/utils';
import type { TagKey } from '../../content/tags';

/** Tags of the CoG wide cartridge (language-neutral; labels come from tagLabel). */
export const cogCartridgeTagKeys: readonly TagKey[] = ['ml', 'collection'];

// cogCartridge.meta is the tool line like the other cartridges (P2-30): the CoG paper's tools as the job-fit and
// skill evidence name them (the paper page itself shows the abstract only since D-15).
interface HomeCopy {
  cogCartridge: { title: string; meta: string; sticker: { text: string; sr: string } };
  moreProjects: string;
  researchNowPlaying: string;
  helloRecords: string[];
}

export const homeCopy: Localized<HomeCopy> = {
  ko: {
    cogCartridge: { title: '리그 오브 레전드 교전 결과 예측', meta: 'Python · LightGBM · PyTorch', sticker: { text: 'ORAL', sr: '구두 발표' } },
    moreProjects: '프로젝트 전체 보기',
    researchNowPlaying: '준비 중: 석사 학위논문 · CoG 논문 저널 확장 / 진행 중: PUBG 생존 모델',
    helloRecords: ['IEEE CoG 2026 구두 발표', '최우수상 2회 · 장려상 1회', 'ADsP · CDS 빅데이터 2급'],
  },
  en: {
    cogCartridge: { title: 'Predicting League of Legends engagement outcomes', meta: 'Python · LightGBM · PyTorch', sticker: { text: 'ORAL', sr: 'oral presentation' } },
    moreProjects: 'See all projects',
    researchNowPlaying: 'In preparation: M.S. thesis · journal extension of the CoG paper / Ongoing: PUBG survival model',
    helloRecords: ['IEEE CoG 2026 oral presentation', 'Top Excellence Award ×2 · Honorable Mention (Encouragement Award) ×1', 'ADsP · CDS Big Data Level 2'],
  },
};
