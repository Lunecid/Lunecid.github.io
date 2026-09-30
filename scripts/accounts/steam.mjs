// scripts/accounts/steam.mjs — the Steam card through the Steam Web API (account-link spec §3.3, §6.5, R-13, R-15).
// Calls, in order: GetPlayerSummaries (visibility, then the identity check), the keyless ?xml=1 profile page (the
// privacy gate), GetSteamLevel, and GetOwnedGames only while STEAM_SHOW_GAMES is on; then the pictures.
// The key travels only in the x-webapi-key header of api.steampowered.com requests (never `key=`); safe-fetch sends
// every keyed request with redirect: 'error'. Kept: steamid (as the link), personaname, avatarfull, player_level,
// game_count, the two playtime totals and, per top game after the filter, appid/name/playtime_forever/
// playtime_2weeks/img_icon_url. Never kept: realname, loccountrycode, timecreated, lastlogoff, personastate,
// gameextrainfo, groups. Nothing here logs.
import { cleanText, count, fetchImages, LANGS, MAX_METRICS, parseJson, rec } from './enka-common.mjs';
import { safeFetch } from './safe-fetch.mjs';
import { normalize, parseSteamId64, sameName } from '../../src/lib/account-ids.ts';
import { ACCOUNT_MAX_AGE_DAYS, STEAM_GAME_FILTER, STEAM_SHOW_GAMES, STEAM_TOP_GAMES } from '../../src/lib/account-config.ts';

/** @typedef {import('./reasons.mjs').AccountFailReason} AccountFailReason */
/** @typedef {import('./enka-common.mjs').AccountItem} AccountItem */
/** @typedef {import('./enka-common.mjs').AccountMetric} AccountMetric */
/** @typedef {import('./enka-common.mjs').ImageName} ImageName */
/**
 * @typedef {{ lang: 'ko' | 'en'; title: string; image?: string; stats: []; metrics: AccountMetric[]; items: AccountItem[];
 *   link: { kind: 'steam'; href: string } }} SteamCard
 * @typedef {{ schemaVersion: 1; platform: 'steam'; status: 'ok' | 'error'; fetchedAt: string; maxAgeDays: number;
 *   attribution: string; authFailed?: true; reason?: AccountFailReason; cards: SteamCard[] }} SteamFeed
 * @typedef {{ platform: 'steam'; state: 'skipped' }
 *   | { platform: 'steam'; state: 'written'; feed: SteamFeed; images: { name: string; bytes: Uint8Array }[] }} SteamResult
 * @typedef {{ readonly mode: 'exclude' | 'allow'; readonly appIds: readonly number[] }} GameFilter
 * @typedef {{ showGames: boolean; filter: GameFilter; topGames: number }} SteamConfig
 * @typedef {{ fetchImpl: typeof fetch; now: () => Date; config?: Partial<SteamConfig> }} SteamDeps
 */

const PLATFORM = 'steam';
const ATTRIBUTION = 'Steam Web API';
const API = 'https://api.steampowered.com';
const COMMUNITY = 'https://steamcommunity.com';
const ICON_BASE = 'https://media.steampowered.com/steamcommunity/public/images/apps/';
/** GetPlayerSummaries: 3 = public (spec §6.5). */
const VISIBILITY_PUBLIC = 3;
const MINUTES_PER_HOUR = 60;
/** Steam's icon hash is a file-name segment; anything else would change the path, so it is refused. */
const ICON_HASH = /^[A-Za-z0-9_]+$/;

/** The committed switches (account-config.ts), or a test's own. @param {Partial<SteamConfig> | undefined} c @returns {SteamConfig} */
export const steamConfig = (c) => ({ showGames: c?.showGames ?? STEAM_SHOW_GAMES, filter: c?.filter ?? STEAM_GAME_FILTER, topGames: c?.topGames ?? STEAM_TOP_GAMES });

/** @param {string} path @param {Record<string, string>} params */
function apiUrl(path, params) {
  const url = new URL(path, API);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url.href;
}
/** Visitor link and the ?xml=1 page; the ID has passed parseSteamId64 (digits only). @param {string} id */
export const profileHref = (id) => `${COMMUNITY}/profiles/${id}`;

/**
 * Steam status map (spec §6.5 "실패"): 401/403 on a keyed request → auth (the key); the rest as Enka's table; a
 * redirect (never followed on a keyed request) or any other failure → bad-response. The keyless profile page cannot
 * reject the key, so there 401/403 are bad-response.
 * @param {{ status: number | null; error: string }} failed @param {boolean} [keyed] @returns {AccountFailReason}
 */
export function steamReason(failed, keyed = true) {
  if (failed.error === 'timeout') return 'timeout';
  if (failed.error === 'http') {
    const s = failed.status ?? 0;
    if (s === 401 || s === 403) return keyed ? 'auth' : 'bad-response';
    if (s === 400) return 'http-400';
    if (s === 404) return 'http-404';
    if (s === 429) return 'http-429';
    if (s >= 500 && s <= 599) return 'http-5xx';
  }
  return 'bad-response';
}

/** @param {Date} now @param {AccountFailReason} reason @returns {SteamFeed} */
function errorFeed(now, reason) {
  /** @type {SteamFeed} */
  const feed = { schemaVersion: 1, platform: PLATFORM, status: 'error', fetchedAt: now.toISOString(), maxAgeDays: ACCOUNT_MAX_AGE_DAYS, attribution: ATTRIBUTION };
  if (reason === 'auth') feed.authFailed = true; // only a real key rejection turns the run red (fetch-health)
  feed.reason = reason;
  feed.cards = [];
  return feed;
}
/** @param {Date} now @param {AccountFailReason} reason @returns {SteamResult} */
const failed = (now, reason) => ({ platform: PLATFORM, state: 'written', feed: errorFeed(now, reason), images: [] });

/** @param {unknown} v @returns {number | null} a positive app id */
const appId = (v) => (typeof v === 'number' && Number.isSafeInteger(v) && v > 0 ? v : null);
/** @param {number} minutes */
const hours = (minutes) => Math.round(minutes / MINUTES_PER_HOUR);

/**
 * The games part (R-15): totals from Steam's full list; the filter runs **before** the top N, so a filtered game
 * reaches no item, icon or name.
 * @param {unknown} games GetOwnedGames `response` @param {SteamConfig} config
 * @returns {{ metrics: AccountMetric[]; top: { name: string; minutes: number; icon: string | null }[] } | null}
 */
function gamesPart(games, config) {
  const g = rec(games);
  if (!g) return null;
  const list = Array.isArray(g.games) ? g.games.map(rec).filter((e) => e !== null && appId(e.appid) !== null) : [];
  /** @type {AccountMetric[]} */
  const metrics = [];
  const owned = count(g.game_count);
  if (owned !== null) metrics.push({ key: 'ownedGames', value: owned });
  if (list.length > 0) {
    let total = 0;
    let recent = 0;
    for (const e of list) {
      total += count(e.playtime_forever) ?? 0;
      recent += count(e.playtime_2weeks) ?? 0; // Steam leaves the field out for games not played in two weeks
    }
    metrics.push({ key: 'playtimeTotal', value: hours(total), unit: 'hours' }, { key: 'playtime2w', value: hours(recent), unit: 'hours' });
  }
  const ids = new Set(config.filter.appIds);
  const kept = list.filter((e) => (config.filter.mode === 'allow' ? ids.has(Number(e.appid)) : !ids.has(Number(e.appid))));
  const top = kept
    .map((e) => ({ id: Number(e.appid), name: cleanText(e.name), minutes: count(e.playtime_forever) ?? 0, hash: e.img_icon_url }))
    .filter((e) => e.name !== null)
    .sort((a, b) => b.minutes - a.minutes || a.id - b.id)
    .slice(0, Math.max(0, config.topGames))
    .map((e) => ({ name: /** @type {string} */ (e.name), minutes: e.minutes, icon: typeof e.hash === 'string' && ICON_HASH.test(e.hash) ? `${ICON_BASE}${e.id}/${e.hash}.jpg` : null }));
  return { metrics, top };
}

/**
 * One card (pure). Steam text is not localised, so both languages carry the same content (the view picks uniformly).
 * @param {unknown} summary one GetPlayerSummaries player @param {number | null} level player_level, or null
 * @param {unknown} games GetOwnedGames `response`, or null (only read while `showGames` is on)
 * @param {'ko' | 'en'} lang @param {ImageName} [imageName] @param {Partial<SteamConfig>} [config]
 * @returns {SteamCard | null} null without a usable steamid or name
 */
export function shapeSteam(summary, level, games, lang, imageName = () => undefined, config = {}) {
  const s = rec(summary);
  const id = typeof s?.steamid === 'string' ? parseSteamId64(s.steamid) : null;
  const title = cleanText(s?.personaname);
  if (!s || id === null || title === null) return null;
  const c = steamConfig(config);
  /** @type {SteamCard} */
  const card = { lang, title };
  const avatar = typeof s.avatarfull === 'string' ? imageName(s.avatarfull) : undefined;
  if (avatar !== undefined) card.image = avatar;
  card.stats = [];
  /** @type {AccountMetric[]} */
  const metrics = [];
  const lv = count(level);
  if (lv !== null) metrics.push({ key: 'steamLevel', value: lv });
  /** @type {AccountItem[]} */
  const items = [];
  const part = c.showGames ? gamesPart(games, c) : null;
  if (part) {
    metrics.push(...part.metrics);
    for (const game of part.top) {
      /** @type {AccountItem} */
      const item = { name: game.name };
      const file = game.icon === null ? undefined : imageName(game.icon);
      if (file !== undefined) item.image = file;
      item.meta = `${hours(game.minutes)} H`;
      items.push(item);
    }
  }
  card.metrics = metrics.slice(0, MAX_METRICS);
  card.items = items;
  card.link = { kind: 'steam', href: profileHref(id) };
  return card;
}

/**
 * The ?xml=1 privacy gate (spec §6.5 step 2), read by regular expression only. A page that names another profile is
 * `bad-response`; anything without `<privacyState>public</privacyState>` is `not-public`.
 * @param {Uint8Array} bytes @param {string} id @returns {AccountFailReason | null}
 */
function xmlGate(bytes, id) {
  const text = new TextDecoder('utf-8').decode(bytes);
  const named = /<steamID64>\s*(\d+)\s*<\/steamID64>/.exec(text);
  if (named && named[1] !== id) return 'bad-response';
  return /<privacyState>\s*public\s*<\/privacyState>/.test(text) ? null : 'not-public';
}

/**
 * @param {Record<string, string | undefined>} env ACCOUNT_STEAM_ID64, ACCOUNT_STEAM_NAME, STEAM_API_KEY
 * @param {SteamDeps} deps
 * @returns {Promise<SteamResult>}
 */
export async function fetchSteam(env, deps) {
  const rawId = env.ACCOUNT_STEAM_ID64;
  if (typeof rawId !== 'string' || rawId.trim() === '') return { platform: PLATFORM, state: 'skipped' };
  let now = new Date(0); // only if deps.now() throws: an epoch time stamp is never fresh
  try {
    now = deps.now();
    // Variable checks before any request: the ID, the identity name, then the key (no-key never sets authFailed).
    const id = parseSteamId64(rawId);
    if (id === null) return failed(now, 'invalid-id');
    const name = typeof env.ACCOUNT_STEAM_NAME === 'string' ? normalize(env.ACCOUNT_STEAM_NAME) : null;
    if (!name) return failed(now, 'no-name');
    const key = typeof env.STEAM_API_KEY === 'string' ? env.STEAM_API_KEY.trim() : '';
    if (key === '') return failed(now, 'no-key');

    const config = steamConfig(deps.config);
    const budget = { used: 0 };
    const keyed = { kind: /** @type {const} */ ('json'), headers: { 'x-webapi-key': key }, budget, fetchImpl: deps.fetchImpl };

    // 1. Summaries → visibility → identity (before any other call, R-13).
    const sum = await safeFetch(apiUrl('/ISteamUser/GetPlayerSummaries/v2/', { steamids: id }), keyed);
    if (!sum.ok) return failed(now, steamReason(sum));
    const players = rec(rec(parseJson(sum.bytes))?.response)?.players;
    if (!Array.isArray(players)) return failed(now, 'bad-response');
    // Steam answers an unknown ID with an empty list: reported like a missing account (the owner checks the ID).
    if (players.length === 0) return failed(now, 'http-404');
    const player = rec(players[0]);
    if (!player || player.steamid !== id || typeof player.personaname !== 'string') return failed(now, 'bad-response');
    if (player.communityvisibilitystate !== VISIBILITY_PUBLIC) return failed(now, 'not-public');
    if (!sameName(player.personaname, name)) return failed(now, 'name-mismatch');

    // 2. The keyless profile page must say public; a transport failure is reported as such (still nothing stored).
    const xml = await safeFetch(`${profileHref(id)}/?xml=1`, { kind: 'json', budget, fetchImpl: deps.fetchImpl });
    if (!xml.ok) return failed(now, steamReason(xml, false));
    const gate = xmlGate(xml.bytes, id);
    if (gate !== null) return failed(now, gate);

    // 3. Level: the field name is unconfirmed (미확인), so a missing field or a failed call only leaves the metric out;
    // a rejected key is still an auth failure.
    let level = null;
    const lv = await safeFetch(apiUrl('/IPlayerService/GetSteamLevel/v1/', { steamid: id }), keyed);
    if (!lv.ok && steamReason(lv) === 'auth') return failed(now, 'auth');
    if (lv.ok) level = count(rec(rec(parseJson(lv.bytes))?.response)?.player_level);

    // 4. Games, only behind the committed switch (spec §6.5); a failure leaves the games part out (auth excepted).
    let games = null;
    if (config.showGames) {
      const owned = await safeFetch(apiUrl('/IPlayerService/GetOwnedGames/v1/', { steamid: id, include_appinfo: '1', include_played_free_games: '1' }), keyed);
      if (!owned.ok && steamReason(owned) === 'auth') return failed(now, 'auth');
      if (owned.ok) games = rec(parseJson(owned.bytes))?.response ?? null;
    }

    // Pictures (no key; safe-fetch refuses any host outside the Steam image list), then two identical cards.
    /** @type {Set<string>} */
    const wanted = new Set();
    shapeSteam(player, level, games, 'ko', (u) => {
      wanted.add(u);
      return undefined;
    }, config);
    const { names, images } = await fetchImages(wanted, deps, budget);
    /** @type {SteamCard[]} */
    const cards = [];
    for (const lang of LANGS) {
      const card = shapeSteam(player, level, games, lang, (u) => names.get(u), config);
      if (card === null) return failed(now, 'bad-response');
      cards.push(card);
    }
    return {
      platform: PLATFORM,
      state: 'written',
      feed: { schemaVersion: 1, platform: PLATFORM, status: 'ok', fetchedAt: now.toISOString(), maxAgeDays: ACCOUNT_MAX_AGE_DAYS, attribution: ATTRIBUTION, cards },
      images,
    };
  } catch {
    return failed(now, 'bad-response');
  }
}
