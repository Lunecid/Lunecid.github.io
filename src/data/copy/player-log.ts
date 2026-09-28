import type { Localized } from '../../i18n/utils';

interface PlayerLogCopy {
  membership: { fields: { label: string; value: string }[]; sticker: string; memberSince: string };
  gamePlatforms: { label: string }[];
}

// Platforms whose achievements appear once an account is linked (spec §7.1). Brand names stay in Latin on both pages.
const GAME_PLATFORMS: { label: string }[] = [
  { label: 'League of Legends' },
  { label: 'Dungeon & Fighter' },
  { label: 'Steam' },
  { label: 'Genshin Impact' },
  { label: 'Zenless Zone Zero' },
];

export const playerLogCopy: Localized<PlayerLogCopy> = {
  ko: {
    membership: {
      fields: [
        { label: 'NAME', value: '백성은 · Lunecid' },
        { label: 'CLASS', value: '게임 데이터 분석가 · 연구자' },
        { label: 'FAVORITE', value: '레미엘 · 유라 · 모나' },
      ],
      sticker: 'CoG 2026 ORAL',
      memberSince: 'MEMBER SINCE 2025',
    },
    gamePlatforms: GAME_PLATFORMS,
  },
  en: {
    membership: {
      fields: [
        { label: 'NAME', value: 'Seongeun Baek · Lunecid' },
        { label: 'CLASS', value: 'Game Data Analyst · Researcher' },
        { label: 'FAVORITE', value: 'Remielle · Eula · Mona' },
      ],
      sticker: 'CoG 2026 ORAL',
      memberSince: 'MEMBER SINCE 2025',
    },
    gamePlatforms: GAME_PLATFORMS,
  },
};
