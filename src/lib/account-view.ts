// src/lib/account-view.ts — the LINKED ACCOUNTS view model (account-link spec §3.1–3.5, §5.6). Build only: called from
// .astro frontmatter; islands receive the result as props and `import type` from here at most.
// Tiles are per game, not per platform (owner answer 2026-10-01 on OQ-2; plan DV-27): LoL and TFT are two tiles that
// both read links/riot.json (one Riot ID variable); each Riot tile picks its own link.
import type { ImageMetadata } from 'astro';
import type { FavoriteGameData } from '../content/schemas';
import type { Lang, UiKey } from '../i18n/ui';
import { formatDate, formatNumber, t } from '../i18n/utils';
import { GAME_IDS, type NoticeKey } from '../types';
import { RECENT_PLAYTIME_WEEKS } from './account-config';
import { HREF_ALLOW } from './account-ids';
import { isFresh } from './freshness';
import type { AccountCard, AccountFeed, AccountMetric, AccountMetricKey, RiotLinks } from './generated';
import type { IslandImage } from './island-image';
import { islandImage } from './island-image.server';

/** favorites.yaml game ids that can make a tile. */
export type AccountTileKey = 'genshin' | 'zzz' | 'lol' | 'tft' | 'steam';
/** = integration.platform of the tile's game. */
export type AccountSource = 'enka-genshin' | 'enka-zzz' | 'steam' | 'riot';
export type AccountGlyph = 'GI' | 'ZZZ' | 'STM' | 'LOL' | 'TFT';

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

/** The site's own HUD monograms (R-11: no game logo). */
export const TILE_GLYPHS: Readonly<Record<AccountTileKey, AccountGlyph>> = { genshin: 'GI', zzz: 'ZZZ', steam: 'STM', lol: 'LOL', tft: 'TFT' };

/** The dialog's mono profile label (lang="en"). ACCOUNT_HEADS in favorites.ts stays untouched (DV-27). */
export const DIALOG_HEADS: Readonly<Record<AccountTileKey, string>> = {
  genshin: 'ADVENTURER PROFILE',
  zzz: 'INTER-KNOT PROFILE',
  steam: 'STEAM PROFILE',
  lol: 'PROFILE LINK',
  tft: 'PROFILE LINK',
};

/** Metric key → its label key (R-7). A Record so a new AccountMetricKey without a label fails the type check. */
export const METRIC_LABEL_KEYS: Readonly<Record<AccountMetricKey, UiKey>> = {
  ar: 'accounts.stat.ar',
  achievements: 'accounts.stat.achievements',
  abyss: 'accounts.stat.abyss',
  theater: 'accounts.stat.theater',
  worldLevel: 'accounts.stat.worldLevel',
  ikLevel: 'accounts.stat.ikLevel',
  'medal.1': 'accounts.stat.medal.1',
  'medal.2': 'accounts.stat.medal.2',
  'medal.3': 'accounts.stat.medal.3',
  'medal.4': 'accounts.stat.medal.4',
  steamLevel: 'accounts.stat.steamLevel',
  ownedGames: 'accounts.stat.ownedGames',
  playtimeTotal: 'accounts.stat.playtimeTotal',
  playtime2w: 'accounts.stat.playtime2w',
};

const GAME_NAME_KEYS: Readonly<Record<AccountTileKey, UiKey>> = {
  genshin: 'accounts.game.genshin',
  zzz: 'accounts.game.zzz',
  lol: 'accounts.game.lol',
  tft: 'accounts.game.tft',
  steam: 'accounts.game.steam',
};

/** Per-card rights-holder notices (spec §9.3). The Riot tiles carry none (§3.4). */
const CARD_NOTICES: Readonly<Record<AccountTileKey, readonly NoticeKey[]>> = {
  genshin: ['cognosphere'],
  zzz: ['zzz-fan-guide'],
  steam: ['valve'],
  lol: [],
  tft: [],
};

/** The Enka cards' courtesy data line (spec §9.3); Steam's attribution lives in the valve notice. */
const DATA_SOURCE: Readonly<Partial<Record<AccountSource, string>>> = { 'enka-genshin': 'Enka.Network', 'enka-zzz': 'Enka.Network' };

const NEUTRAL_TINT: Readonly<Record<'steam' | 'riot', string>> = { steam: 'var(--acct-tint-steam)', riot: 'var(--acct-tint-riot)' };

export type TileState = 'shown' | 'unlinked' | 'error' | 'stale';

export interface AccountStatView {
  key: AccountMetricKey;
  label: string;
  display: string;
  /** The number to count up to; null for templated or non-numeric values (they never count up, spec §3.3). */
  countTo: number | null;
  sr: string;
}

export interface AccountCardView {
  title: string;
  subtitle?: string;
  avatar?: IslandImage;
  banner?: IslandImage;
  stats: AccountStatView[];
  items: { name: string; meta?: string; image?: IslandImage }[];
  /** Steam only, HREF_ALLOW.steam. */
  profileLink?: string;
  /** lol → op.gg link, tft → lolchess.gg link. */
  riot?: { riotId: string; href: string; site: 'op.gg' | 'lolchess.gg' };
  /** Absent for the Riot tiles (links do not go stale). */
  fetchedAt?: string;
  fetchedAtText?: string;
  /** '데이터: Enka.Network' / 'Data: Enka.Network' (Enka cards only). */
  dataLine?: string;
  notices: NoticeKey[];
}

export interface AccountTile {
  /** Index into TILE_SLOTS (= the #acct-status slot). */
  slot: number;
  key: AccountTileKey;
  source: AccountSource;
  glyph: AccountGlyph;
  name: string;
  head: string;
  state: TileState;
  /** 'var(--tint-…)' | 'var(--acct-tint-steam)' | 'var(--acct-tint-riot)': a background only. */
  tint: string;
  teaser?: string;
  teaserSr?: string;
  card?: AccountCardView;
  fetchedAt?: string;
  maxAgeDays?: number;
}

export interface AccountStatus {
  runId: string | null;
  platforms: { slot: number; state: 'shown' | 'hidden' | 'absent'; fetchedAt?: string }[];
}

const RIOT_SITE: Readonly<Record<'lol' | 'tft', 'op.gg' | 'lolchess.gg'>> = { lol: 'op.gg', tft: 'lolchess.gg' };

function isTileKey(id: string): id is AccountTileKey {
  return Object.hasOwn(TILE_SOURCES, id);
}

/** The favorites games that make a tile: an AccountTileKey with integration.enabled, in GAME_IDS order. */
function tileGames(games: readonly FavoriteGameData[]): (FavoriteGameData & { id: AccountTileKey })[] {
  return games
    .filter((g): g is FavoriteGameData & { id: AccountTileKey } => isTileKey(g.id) && g.integration.enabled)
    .sort((a, b) => GAME_IDS.indexOf(a.id) - GAME_IDS.indexOf(b.id));
}

function pickCard(feed: AccountFeed, lang: Lang): AccountCard | undefined {
  return feed.cards.find((c) => c.lang === lang) ?? feed.cards[0];
}

interface Resolved {
  state: TileState;
  feed?: AccountFeed;
  card?: AccountCard;
  riotHref?: string;
}

function resolve(key: AccountTileKey, feeds: Readonly<Record<string, AccountFeed>>, links: RiotLinks | undefined, lang: Lang, now: number): Resolved {
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

const num = (value: number, lang: Lang): string => formatNumber(value, lang);

function metricMap(card: AccountCard): Map<AccountMetricKey, AccountMetric> {
  const map = new Map<AccountMetricKey, AccountMetric>();
  for (const m of card.metrics ?? []) if (Object.hasOwn(METRIC_LABEL_KEYS, m.key) && !map.has(m.key)) map.set(m.key, m);
  return map;
}

/** One metric → a stat row; null drops it (unknown key, or a value its template cannot read). */
function statView(m: AccountMetric, lang: Lang): AccountStatView | null {
  if (!Object.hasOwn(METRIC_LABEL_KEYS, m.key)) return null;
  const label = t(lang, METRIC_LABEL_KEYS[m.key], { n: RECENT_PLAYTIME_WEEKS });
  let display: string;
  let countTo: number | null = null;
  if (m.key === 'abyss') {
    const hit = /^(\d+)-(\d+)$/.exec(String(m.value));
    if (!hit) return null;
    display = t(lang, 'accounts.value.abyss', { floor: hit[1] as string, chamber: hit[2] as string });
  } else if (m.key === 'theater') {
    if (typeof m.value !== 'number') return null;
    display = t(lang, 'accounts.value.theater', { act: num(m.value, lang) });
  } else if (m.unit === 'hours') {
    if (typeof m.value !== 'number') return null;
    display = t(lang, 'accounts.value.hours', { n: num(m.value, lang) });
  } else if (typeof m.value === 'number') {
    display = num(m.value, lang);
    countTo = m.value;
  } else {
    display = m.value;
  }
  if (typeof m.max === 'number') display += ` / ${num(m.max, lang)}`;
  return { key: m.key, label, display, countTo, sr: `${label} ${display}` };
}

function teaserOf(key: AccountTileKey, card: AccountCard | undefined, lang: Lang): { teaser?: string; teaserSr?: string } {
  if (key === 'lol' || key === 'tft') {
    return { teaser: t(lang, key === 'lol' ? 'accounts.teaser.lol' : 'accounts.teaser.tft'), teaserSr: t(lang, key === 'lol' ? 'accounts.teaserSr.lol' : 'accounts.teaserSr.tft') };
  }
  if (card === undefined) return {};
  const metrics = metricMap(card);
  const numeric = (k: AccountMetricKey): number | undefined => {
    const v = metrics.get(k)?.value;
    return typeof v === 'number' ? v : undefined;
  };
  const pair = (value: number | undefined, teaser: UiKey, sr: UiKey) =>
    value === undefined ? undefined : { teaser: t(lang, teaser, { n: num(value, lang) }), teaserSr: t(lang, sr, { n: num(value, lang) }) };
  if (key === 'genshin') return pair(numeric('ar'), 'accounts.teaser.genshin', 'accounts.teaserSr.genshin') ?? {};
  if (key === 'zzz') return pair(numeric('ikLevel'), 'accounts.teaser.zzz', 'accounts.teaserSr.zzz') ?? {};
  // Steam: total hours, else the level while the games part is off (DV-17, OQ-15), else none.
  return (
    pair(numeric('playtimeTotal'), 'accounts.teaser.steam', 'accounts.teaserSr.steam') ??
    pair(numeric('steamLevel'), 'accounts.teaser.steamLevel', 'accounts.teaserSr.steamLevel') ??
    {}
  );
}

async function imageOf(name: string | undefined, images: Readonly<Record<string, ImageMetadata>>, widths: number[], sizes: string): Promise<IslandImage | undefined> {
  if (name === undefined || !Object.hasOwn(images, name)) return undefined;
  return islandImage(images[name] as ImageMetadata, widths, sizes);
}

async function cardView(key: AccountTileKey, r: Resolved, links: RiotLinks | undefined, images: Readonly<Record<string, ImageMetadata>>, lang: Lang): Promise<AccountCardView | undefined> {
  const { source, link } = TILE_SOURCES[key];
  if (link !== undefined) {
    if (links === undefined || r.riotHref === undefined) return undefined;
    return { title: links.riotId, stats: [], items: [], riot: { riotId: links.riotId, href: r.riotHref, site: RIOT_SITE[link] }, notices: [...CARD_NOTICES[key]] };
  }
  const { feed, card } = r;
  if (feed === undefined || card === undefined) return undefined;
  const view: AccountCardView = {
    title: card.title,
    stats: [...metricMap(card).values()].map((m) => statView(m, lang)).filter((s): s is AccountStatView => s !== null),
    items: await Promise.all(
      (card.items ?? []).map(async (item) => {
        const row: { name: string; meta?: string; image?: IslandImage } = { name: item.name };
        if (item.meta !== undefined) row.meta = item.meta;
        const image = await imageOf(item.image, images, [48, 96], '48px');
        if (image !== undefined) row.image = image;
        return row;
      }),
    ),
    fetchedAt: feed.fetchedAt,
    fetchedAtText: formatAsOfKst(feed.fetchedAt, lang),
    notices: [...CARD_NOTICES[key]],
  };
  if (card.subtitle !== undefined) view.subtitle = card.subtitle;
  const avatar = await imageOf(card.image, images, [96, 192], '96px');
  if (avatar !== undefined) view.avatar = avatar;
  const banner = await imageOf(card.banner, images, [480], '480px');
  if (banner !== undefined) view.banner = banner;
  if (source === 'steam' && card.link?.kind === 'steam' && HREF_ALLOW.steam.test(card.link.href)) view.profileLink = card.link.href;
  const dataSource = DATA_SOURCE[source];
  if (dataSource !== undefined) view.dataLine = t(lang, 'accounts.data', { source: dataSource });
  return view;
}

function tintOf(game: FavoriteGameData & { id: AccountTileKey }): string {
  const source = TILE_SOURCES[game.id].source;
  if (source === 'steam') return NEUTRAL_TINT.steam;
  if (source === 'riot') return NEUTRAL_TINT.riot;
  const first = game.characters[0];
  return first === undefined ? NEUTRAL_TINT.riot : `var(--tint-${first.id})`;
}

/**
 * favorites.yaml switches + feeds + Riot links + images → one tile per enabled tile game (GAME_IDS order). Every
 * enabled tile is listed with its state (owner mode); `card` and the teaser only when `shown`.
 */
export async function buildAccountView(
  games: readonly FavoriteGameData[],
  feeds: Readonly<Record<string, AccountFeed>>,
  links: RiotLinks | undefined,
  images: Readonly<Record<string, ImageMetadata>>,
  lang: Lang,
  now: number = Date.now(),
): Promise<AccountTile[]> {
  return Promise.all(
    tileGames(games).map(async (game): Promise<AccountTile> => {
      const key = game.id;
      const r = resolve(key, feeds, links, lang, now);
      const tile: AccountTile = {
        slot: TILE_SLOTS.indexOf(key),
        key,
        source: TILE_SOURCES[key].source,
        glyph: TILE_GLYPHS[key],
        name: t(lang, GAME_NAME_KEYS[key]),
        head: DIALOG_HEADS[key],
        state: r.state,
        tint: tintOf(game),
      };
      if (r.feed !== undefined) {
        tile.fetchedAt = r.feed.fetchedAt;
        tile.maxAgeDays = r.feed.maxAgeDays;
      }
      if (r.state === 'shown') {
        const card = await cardView(key, r, links, images, lang);
        if (card !== undefined) tile.card = card;
        Object.assign(tile, teaserOf(key, r.card, lang));
      }
      return tile;
    }),
  );
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
    const r = resolve(key, feeds, links, 'ko', now);
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

/** 'YYYY.MM.DD HH:MM KST' (ko) / 'Mon D, YYYY HH:MM KST' (en), in Asia/Seoul: the same output as StatsSummary's asOf. */
export function formatAsOfKst(iso: string, lang: Lang): string {
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  return `${formatDate(day, lang)} ${time} KST`;
}
