// Who wrote each Player Log string that the owner still has to confirm. 'placeholder' = the implementer's wording,
// shown until the owner's copy review replaces it; 'owner' = the owner's own words. Tests pin the structure of the
// strings registered here, never their words.
import type { UiKey } from '../../i18n/utils';

export type CopyStatus = 'owner' | 'placeholder';

export const PLAYER_LOG_COPY_STATUS: Readonly<Partial<Record<UiKey, { ko: CopyStatus; en: CopyStatus }>>> = {
  'playerLog.gameAchievements': { ko: 'owner', en: 'placeholder' }, // the owner named the section "내 게임 업적"
  'gameRecords.tier': { ko: 'placeholder', en: 'placeholder' },
  'gameRecords.rank': { ko: 'placeholder', en: 'placeholder' }, // the ribbon wording follows the owner's "Legend" ruling
  'gameRecords.reached': { ko: 'placeholder', en: 'placeholder' },
  'gameRecords.main': { ko: 'placeholder', en: 'placeholder' },
  'gameRecords.alt': { ko: 'placeholder', en: 'placeholder' },
  'gameRecords.dateCapture': { ko: 'placeholder', en: 'placeholder' },
  'gameRecords.dateSaved': { ko: 'placeholder', en: 'placeholder' },
  'gameRecords.evidence': { ko: 'placeholder', en: 'placeholder' },
  'gameRecords.viewerLabel': { ko: 'placeholder', en: 'placeholder' },
  // Riot's sentence is verbatim; only the project title in it is a placeholder.
  'notice.riotAssets': { ko: 'placeholder', en: 'placeholder' },
  'notice.blizzard': { ko: 'placeholder', en: 'placeholder' },
};
