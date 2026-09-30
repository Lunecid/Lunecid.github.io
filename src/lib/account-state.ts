// src/lib/account-state.ts — the pure part of the LINKED ACCOUNTS view model (account-link spec §3.5, §5.6, R-4, R-10):
// which tile games exist, and each tile's state from the committed switches + feeds + Riot links. No astro:assets and
// no copy, so the e2e suite computes the expected tile set with the same function the page uses (spec §11.1).
// src/lib/account-view.ts builds the cards on top of this and re-exports every name below.
import type { FavoriteGameData } from '../content/schemas';
import type { Lang } from '../i18n/ui';
import { GAME_IDS } from '../types';
import { HREF_ALLOW } from './account-ids';
import { isFresh } from './freshness';
import type { AccountCard, AccountFeed, RiotLinks } from './generated';

/** favorites.yaml game ids that can make a tile. */
export type AccountTileKey = 'genshin' | 'zzz' | 'lol' | 'tft' | 'steam';
/** = integration.platform of the tile's game. */
export type AccountSource = 'enka-genshin' | 'enka-zzz' | 'steam' | 'riot';

/** Tile key → where its data comes from; Riot tiles pick one link each (owner answer 2026-10-01). */
export const TILE_SOURCES: Readonly<Record<AccountTileKey, { source: AccountSource; link?: 'lol' | 'tft' }>> = {
  genshin: { source: 'enka-genshin' },
  zzz: { source: 'enka-zzz' },
  steam: { source: 'steam' },
  lol: { source: 'riot', link: 'lol' },
  tft: { source: 'riot', link: 'tft' },
};

/** #acct-status slot order: the ACCOUNT_VARS account order, the two Riot tiles last (both use ACCOUNT_RIOT_ID). */
export const TILE_SLOTS: readonly AccountTileKey[] = ['genshin', 'zzz', 'steam', 'lol', 'tft'];

export type TileState = 'shown' | 'unlinked' | 'error' | 'stale';

export interface AccountStatus {
  runId: string | null;
  platforms: { slot: number; state: 'shown' | 'hidden' | 'absent'; fetchedAt?: string }[];
}

export function isTileKey(id: string): id is AccountTileKey {
  return Object.hasOwn(TILE_SOURCES, id);
}

/** The favorites games that make a tile: an AccountTileKey with integration.enabled, in GAME_IDS order. */
export function tileGames(games: readonly FavoriteGameData[]): (FavoriteGameData & { id: AccountTileKey })[] {
  return games
    .filter((g): g is FavoriteGameData & { id: AccountTileKey } => isTileKey(g.id) && g.integration.enabled)
    .sort((a, b) => GAME_IDS.indexOf(a.id) - GAME_IDS.indexOf(b.id));
}

function pickCard(feed: AccountFeed, lang: Lang): AccountCard | undefined {
  return feed.cards.find((c) => c.lang === lang) ?? feed.cards[0];
}

export interface ResolvedTile {
  state: TileState;
  feed?: AccountFeed;
  card?: AccountCard;
  riotHref?: string;
}

/** One tile's state (spec §3.5): shown only for an ok, fresh feed with a card, or a Riot tile whose own link is valid. */
export function resolveTile(key: AccountTileKey, feeds: Readonly<Record<string, AccountFeed>>, links: RiotLinks | undefined, lang: Lang, now: number): ResolvedTile {
  const { source, link } = TILE_SOURCES[key];
  if (link !== undefined) {
    if (links === undefined) return { state: 'unlinked' };
    const href = links.links[link];
    return typeof href === 'string' && HREF_ALLOW[link].test(href) ? { state: 'shown', riotHref: href } : { state: 'error' };
  }
  const feed = Object.hasOwn(feeds, source) ? feeds[source] : undefined;
  if (feed === undefined) return { state: 'unlinked' };
  const card = feed.status === 'ok' ? pickCard(feed, lang) : undefined;
  if (card === undefined) return { state: 'error', feed };
  if (!isFresh(feed, now)) return { state: 'stale', feed };
  return { state: 'shown', feed, card };
}

/** The #acct-status JSON (R-10): coarse states only, never an ID, a name or a reason. One entry per enabled tile. */
export function accountStatus(
  games: readonly FavoriteGameData[],
  feeds: Readonly<Record<string, AccountFeed>>,
  links: RiotLinks | undefined,
  now: number = Date.now(),
  runId: string | null = process.env.GITHUB_RUN_ID ?? null,
): AccountStatus {
  const enabled = new Set(tileGames(games).map((g) => g.id));
  const platforms: AccountStatus['platforms'] = [];
  TILE_SLOTS.forEach((key, slot) => {
    if (!enabled.has(key)) return;
    const r = resolveTile(key, feeds, links, 'ko', now);
    const entry: AccountStatus['platforms'][number] = { slot, state: r.state === 'shown' ? 'shown' : r.state === 'unlinked' ? 'absent' : 'hidden' };
    if (r.feed !== undefined && typeof r.feed.fetchedAt === 'string') entry.fetchedAt = r.feed.fetchedAt;
    platforms.push(entry);
  });
  return { runId, platforms };
}

/** JSON for the inline #acct-status script: '<' escaped so no value can close the element (as src/lib/analytics.ts). */
export function accountStatusJson(status: AccountStatus): string {
  return JSON.stringify(status).replace(/</g, '\\u003c');
}
