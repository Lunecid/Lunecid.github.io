// src/data/copy/chooser.ts — the chooser's per-version lines (spec §6). Facts only through tokens (fact lint). P2-10 adds
// the design copy ([ MODE 01 ] labels, CTAs).
import type { Localized } from '../../i18n/utils';
import type { VariantId } from '../../variants/ids';

export type ChooserCopy = Record<VariantId, { title: string; evidence: string }>;

export const chooserCopy: Localized<ChooserCopy> = {
  ko: {
    game: { title: '게임 데이터 분석가', evidence: '{pub.cog-2026-engagement.venueShort} 구두 발표' },
    data: { title: '데이터 분석가', evidence: '{awards.name:top} ×{awards.count:top}' }, // one count style (P-01/F-074)
  },
  en: {
    game: { title: 'Game Data Analyst', evidence: 'Oral at {pub.cog-2026-engagement.venueShort}' },
    data: { title: 'Data Analyst', evidence: '{awards.name:top} ×{awards.count:top}' },
  },
};
