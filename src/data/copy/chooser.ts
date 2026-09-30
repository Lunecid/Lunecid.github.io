// src/data/copy/chooser.ts — the chooser's copy (spec §6, A안). Facts only as tokens (R-4); `num` is a label number
// (fact-lint skips the key).
import type { Localized } from '../../i18n/utils';

export interface ChooserCopy {
  game: { num: string; title: string; evidence: string; cta: string };
  data: { kicker: string; title: string; evidence: string; cta: string; chartCaption: string };
}

export const chooserCopy: Localized<ChooserCopy> = {
  ko: {
    game: { num: '01', title: '게임 데이터 분석가', evidence: '{pub.cog-2026-engagement.venueShort} {pub.cog-2026-engagement.format}', cta: '게임 버전 보기' },
    data: { kicker: '일반 버전', title: '데이터 분석가', evidence: '{awards.name:top} {awards.count:top}회', cta: '일반 버전 보기', chartCaption: '모델별 AUC' },
  },
  en: {
    game: { num: '01', title: 'Game Data Analyst', evidence: 'Oral at {pub.cog-2026-engagement.venueShort}', cta: 'View game version' },
    data: { kicker: 'General version', title: 'Data Analyst', evidence: '{awards.name:top} ×{awards.count:top}', cta: 'View general version', chartCaption: 'AUC by model' },
  },
};
