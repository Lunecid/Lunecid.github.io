import type { ImageMetadata } from 'astro';
import type { FavoriteGameData } from '../content/schemas';
import type { Lang } from '../i18n/ui';
import type { FavoriteGame } from '../islands/FavoriteGames';
import type { CharacterId } from '../types';
import { CHARACTER_GAME_LABEL, POSITIONS, SHOWCASE_SIZES, SHOWCASE_SIZES_LIST, SHOWCASE_WIDTHS, characters } from './characters';
import type { createCharacterLookup } from './characters';
import { islandImage } from './island-image.server';

type CharacterLookup = ReturnType<typeof createCharacterLookup>;

/** Account-card header per integration.platform (spec §7 common card format). */
export const ACCOUNT_HEADS: Record<string, string> = {
  'enka-zzz': 'INTER-KNOT PROFILE',
  'enka-genshin': 'ADVENTURER PROFILE',
  riot: 'SUMMONER PROFILE',
  neople: 'CHARACTER PROFILE',
  steam: 'STEAM PROFILE',
  'nimble-neuron': 'PLAYER PROFILE',
  'battle-net': 'BATTLE.NET PROFILE',
};

export interface FavoriteTile {
  id: CharacterId;
  name: string;
  caption: string;
  image: ImageMetadata;
  objectPosition: string;
}

/** 'Zenless Zone Zero' → ['Zenless', 'Zone Zero']; 'Dungeon & Fighter' → ['Dungeon', '& Fighter']. */
function splitTitle(title: string): [string, string?] {
  const i = title.indexOf(' ');
  return i === -1 ? [title] : [title.slice(0, i), title.slice(i + 1)];
}

/**
 * favorites.yaml games → FavoriteGames island props, in yaml order.
 * Art = first character of the game whose PNG exists (showcase widths/sizes, objectPosition = yaml position).
 */
export async function buildFavoriteGames(
  games: readonly FavoriteGameData[],
  lang: Lang,
  lookup: CharacterLookup = characters,
): Promise<FavoriteGame[]> {
  return Promise.all(
    games.map(async (g): Promise<FavoriteGame> => {
      const platform = g.integration.platform;
      const game: FavoriteGame = {
        id: g.id,
        tabTitle: g.title[lang],
        tabCaption: g.locked ? (g.reason?.[lang] ?? '') : g.title.en.toUpperCase(),
        locked: g.locked,
        title: splitTitle(g.title.en),
        subtitle: lang === 'ko' ? `${g.title.ko} · ${g.studio}` : g.studio,
        account: { key: platform, head: ACCOUNT_HEADS[platform] ?? platform.toUpperCase() },
      };
      if (g.why) game.why = g.why[lang];
      if (g.meta.length > 0) game.meta = g.meta.map((m) => `${m.label[lang]} ${m.value[lang]}`);
      const withArt = g.characters.find((c) => lookup.art(c.id) !== undefined);
      const src = withArt ? lookup.art(withArt.id) : undefined;
      if (withArt && src) {
        // The island shows two or three games as a tab row over a 520px stage, four or more as a tab column beside a
        // 600px one (FavoriteGames tabsRow); the taller stage paints the portrait art wider.
        const sizes = games.length <= 3 ? SHOWCASE_SIZES : SHOWCASE_SIZES_LIST;
        game.art = { image: await islandImage(src, SHOWCASE_WIDTHS, sizes), objectPosition: withArt.position };
      }
      // The tint is the showcase's colour for the game (D-1): the art's character, or without art the game's first
      // favourite character, so the stage is never flat black.
      const tint = withArt ?? g.characters[0];
      if (tint) game.tint = tint.id;
      return game;
    }),
  );
}

/** One tile per character whose PNG exists, in favorites order (Player Log intro). */
export function buildFavoriteTiles(
  games: readonly FavoriteGameData[],
  lang: Lang,
  lookup: CharacterLookup = characters,
): FavoriteTile[] {
  const tiles: FavoriteTile[] = [];
  for (const g of games) {
    for (const c of g.characters) {
      const image = lookup.art(c.id);
      if (!image) continue;
      tiles.push({
        id: c.id,
        name: c.name[lang],
        caption: `${CHARACTER_GAME_LABEL[c.id].en.toUpperCase()} · FAVORITE`,
        image,
        objectPosition: POSITIONS.tile[c.id] ?? c.position,
      });
    }
  }
  return tiles;
}
