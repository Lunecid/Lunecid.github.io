// Site-side view of the GitHub section on /projects/ (P1-17). The daily CI fetch (scripts/fetch-github.mjs) still
// writes every public repository to src/data/generated/github.json; src/lib/github.ts applies these lists at build
// time, so repositories that appear or disappear on GitHub need no change here.
import type { Localized } from '../i18n/utils';

/**
 * Never shown in the section.
 * - AudioSync: unrelated to this portfolio.
 * - PUBG_Lab: not shown until the owner marks the repository ready. Remove it from this list only then.
 * - Child_Abuse: code of a manuscript under double-anonymised review; not shown until the review has ended (owner decides).
 */
export const GITHUB_EXCLUDED: readonly string[] = ['AudioSync', 'PUBG_Lab', 'Child_Abuse'];

/** Shown first, in this order, when present in the fetched data. */
export const GITHUB_FIRST: readonly string[] = ['LOL_teamfight_Lab'];

/**
 * Descriptions written on the site from facts on the pages the repositories belong to (the GitHub descriptions are
 * partly Korean-only or empty). /en/ never shows Hangul: a repository without an entry here shows its GitHub
 * description on /en/ only when that description has no Hangul.
 */
export const GITHUB_DESCRIPTIONS: Readonly<Record<string, Localized>> = {
  LOL_teamfight_Lab: {
    ko: 'IEEE CoG 2026 논문 코드 (v1.0-cog2026)',
    en: 'Code for the IEEE CoG 2026 paper (v1.0-cog2026)',
  },
  'busan-school-zone-blindspots': {
    ko: '사각지대를 예측하다 · 2025 Big Data 활용 대회 최우수상(부산광역시장상) · XGBoost와 공간 교차검증',
    en: 'Predicting the Blind Spots · Top Excellence Award (Mayor of Busan Award), 2025 Big Data Utilization Contest · XGBoost with spatial cross-validation',
  },
  // The KickKick page: the public repository's Django service takes return-photo uploads and keeps a cumulative-score
  // ranking (fixed points per photo); the judgment model was trained separately. Say only that.
  MultiCamp_Final: {
    ko: '킥킥파크 · 멀티캠퍼스 최우수상 · 반납 사진 업로드와 누적 점수 랭킹을 갖춘 Django 웹 서비스',
    en: 'KickKick Park · Multicampus Top Excellence Award · a Django web service with return-photo uploads and a cumulative-score ranking',
  },
  'busan-youth-startup-location': {
    ko: '청년 창업가를 위한 부산 상권 입지 제안 · 상권 유형화(K-Means)와 음식점 매출 예측(LightGBM)',
    en: 'Restaurant locations for young founders in Busan · commercial-area types (K-Means) and restaurant sales prediction (LightGBM)',
  },
};
