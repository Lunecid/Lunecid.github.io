// src/data/award-levels.ts — award level names and medal labels (common frame, A-15). Counts and names in copy come from
// here through fact tokens ({awards.name:top}, {awards.count:top}), never as literals (R-4).
import type { Localized } from '../i18n/utils';
import type { AwardLevel } from '../types';

export const AWARD_LEVEL_NAME: Readonly<Record<AwardLevel, Localized>> = {
  top: { ko: '최우수상', en: 'Top Excellence Award' },
  encouragement: { ko: '장려상', en: 'Honorable Mention (Encouragement Award)' },
};

export const AWARD_LEVEL_MEDAL: Readonly<Record<AwardLevel, { tier: 'gold' | 'silver'; label: Localized }>> = {
  top: { tier: 'gold', label: { ko: '최우수', en: 'Top Excellence' } },
  encouragement: { tier: 'silver', label: { ko: '장려', en: 'Honorable Mention' } },
};
