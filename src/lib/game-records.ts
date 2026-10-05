// src/lib/game-records.ts — the game records (src/data/game-records.yaml) as rows for the player log. Pure: no
// astro:* import, so Vitest and schemas.ts can load it; the evidence images are built in game-records.server.ts.
import type { FavoriteGameData, GameRecordData } from '../content/schemas';
import type { Lang } from '../i18n/ui';
import { formatDate, formatNumber } from '../i18n/utils';
import type { GameId, NoticeKey } from '../types';

/** The notices the records carry today: Riot's for the TFT screenshots, Blizzard's for the Hearthstone one (the schema takes any NoticeKey). */
export const GAME_RECORD_NOTICES = ['riot-assets', 'blizzard'] as const satisfies readonly NoticeKey[];
export type GameRecordNotice = (typeof GAME_RECORD_NOTICES)[number];

export interface GameRecordView {
  id: string;
  game: GameId;
  gameName: string;
  title: string;
  /** The queue, the tier (if the record names one) and the rank (rank records) in `lang`; tierLatin is the English tier. */
  queue: string;
  tier: string | undefined;
  tierLatin: string | undefined;
  rank: number | undefined;
  account: string;
  alt: boolean;
  dateIso: string;
  dateText: string;
  dateSource: 'capture' | 'saved';
  notices: NoticeKey[];
  imageAlt: string;
}

const PLACEHOLDER = /\{(\w+)\}/g;

/**
 * The record's template (by kind) with {tier}, {queue} and {rank} filled from the record; a rank record may name its
 * tier too. A placeholder the record has no value for throws, so a title is never shown half filled.
 */
function recordTitle(record: GameRecordData, lang: Lang, templates: { tier: string; rank: string }): string {
  const values: Record<string, string | undefined> = {
    tier: record.tier?.[lang],
    queue: record.queue[lang],
    rank: record.kind === 'rank' ? formatNumber(record.rank, lang) : undefined,
  };
  const template = templates[record.kind];
  return template.replace(PLACEHOLDER, (match: string, name: string) => {
    const value = Object.hasOwn(values, name) ? values[name] : undefined;
    if (value === undefined) throw new Error(`game record '${record.id}': no value for ${match} in "${template}"`);
    return value;
  });
}

/** The records in data order, each with its game's favorites.yaml title in `lang` and the date in the site's format. */
export function recordViews(
  records: readonly GameRecordData[],
  games: readonly FavoriteGameData[],
  lang: Lang,
  templates: { tier: string; rank: string },
): GameRecordView[] {
  return records.map((record) => {
    const game = games.find((g) => g.id === record.game);
    if (!game) throw new Error(`game record '${record.id}': game '${record.game}' is not in favorites.yaml`);
    return {
      id: record.id,
      game: record.game,
      gameName: game.title[lang],
      title: recordTitle(record, lang, templates),
      queue: record.queue[lang],
      tier: record.tier?.[lang],
      tierLatin: record.tier?.en,
      rank: record.kind === 'rank' ? record.rank : undefined,
      account: record.account,
      alt: record.alt,
      dateIso: record.date,
      dateText: formatDate(record.date, lang),
      dateSource: record.dateSource,
      notices: [...record.notices],
      imageAlt: record.imageAlt[lang],
    };
  });
}
