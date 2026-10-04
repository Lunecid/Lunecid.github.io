import type { Localized } from '../../i18n/utils';

interface PlayerLogCopy {
  membership: { name: { label: string; value: string }; favorite: { label: string; value: string }; sticker: string; memberSince: string };
}

export const playerLogCopy: Localized<PlayerLogCopy> = {
  ko: {
    membership: {
      name: { label: 'NAME', value: '백성은 · Lunecid' },
      favorite: { label: 'FAVORITE', value: '레미엘 · 유라 · 모나' },
      sticker: '{pub.cog-2026-engagement.venueAbbr} ORAL',
      memberSince: 'MEMBER SINCE {edu.ms-pnu.startYear}',
    },
  },
  en: {
    membership: {
      name: { label: 'NAME', value: 'Seongeun Baek · Lunecid' },
      favorite: { label: 'FAVORITE', value: 'Remielle · Eula · Mona' },
      sticker: '{pub.cog-2026-engagement.venueAbbr} ORAL',
      memberSince: 'MEMBER SINCE {edu.ms-pnu.startYear}',
    },
  },
};

/** The membership card's fields in their order: NAME, CLASS (the version headline, contract §1.6), FAVORITE. */
export function membershipCard(
  copy: PlayerLogCopy['membership'],
  classLine: string,
): { fields: { label: string; value: string }[]; sticker: string; memberSince: string } {
  return { fields: [copy.name, { label: 'CLASS', value: classLine }, copy.favorite], sticker: copy.sticker, memberSince: copy.memberSince };
}
