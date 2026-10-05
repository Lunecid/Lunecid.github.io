// src/data/copy/data/records.ts — the general version's records copy (DS-7). Facts appear only as fact tokens (R-4;
// resolved with resolveDeep in RecordsView): the sidebar's 주요 기록 tiles are the award counts by level and the CoG
// paper's format — the same facts as the home profile's 주요 기록 line and the evidence line.
import type { Localized } from '../../../i18n/utils';
import type { StatDef } from './home';

export interface DataRecordsCopy {
  /** DS-7: the sidebar's stat tiles (label first, as the 주요 기록 line reads: "최우수상 ×2 · 장려상 ×1"). */
  sidebarStats: StatDef[];
}

export const dataRecordsCopy: Localized<DataRecordsCopy> = {
  ko: {
    sidebarStats: [
      { label: '{awards.name:top}', value: '×{awards.count:top}', labelFirst: true },
      { label: '{awards.name:encouragement}', value: '×{awards.count:encouragement}', labelFirst: true },
      { label: '{pub.cog-2026-engagement.venueShort}', value: '{pub.cog-2026-engagement.format}', labelFirst: true },
    ],
  },
  en: {
    sidebarStats: [
      { label: '{awards.name:top}', value: '×{awards.count:top}', labelFirst: true },
      { label: '{awards.name:encouragement}', value: '×{awards.count:encouragement}', labelFirst: true },
      { label: '{pub.cog-2026-engagement.venueShort}', value: '{pub.cog-2026-engagement.format}', labelFirst: true },
    ],
  },
};
