// scripts/accounts/enka-common.mjs — what the two Enka.Network fetchers share (account-link spec §6.1–6.4): the
// variable check before any request, the Enka status map, store files, image downloads and free-text cleaning.
// Node built-ins, safe-fetch and the two import-free rule files only (fetch-accounts-deps.test.mjs). Nothing here logs.
import { createHash } from 'node:crypto';
import { imageKind, safeFetch } from './safe-fetch.mjs';
import { normalize, parseHoyoUid, sameName } from '../../src/lib/account-ids.ts';
import { ACCOUNT_MAX_AGE_DAYS, FREE_TEXT_MAX, MEDAL_UNITS, METRIC_MAX } from '../../src/lib/account-config.ts';

/** @typedef {import('./reasons.mjs').AccountFailReason} AccountFailReason */
/** @typedef {{ name: string; image?: string; meta?: string }} AccountItem */
/**
 * @typedef {{ key: string; value: number | string; max?: number; unit?: 'hours' | 'stars' | 'score' }} AccountMetric
 * @typedef {{ lang: 'ko' | 'en'; title: string; subtitle?: string; image?: string; banner?: string; stats: [];
 *   metrics: AccountMetric[]; items: AccountItem[] }} AccountCard
 * @typedef {{ schemaVersion: 1; platform: string; status: 'ok' | 'error'; fetchedAt: string; maxAgeDays: number;
 *   attribution: string; ttl?: number; reason?: AccountFailReason; cards: AccountCard[] }} AccountFeed
 * @typedef {{ platform: string; state: 'skipped' }
 *   | { platform: string; state: 'written'; feed: AccountFeed; images: { name: string; bytes: Uint8Array }[] }} PlatformResult
 * @typedef {{ metricMax: { ar: number | null; abyssStars: number | null; worldLevel: number | null; ikLevel: number | null };
 *   medalUnits: Partial<Record<1 | 2 | 3 | 4, 'score' | 'stars'>> }} EnkaConfig
 * @typedef {{ fetchImpl: typeof fetch; now: () => Date; config?: Partial<EnkaConfig> }} EnkaDeps
 * @typedef {(url: string) => string | undefined} ImageName url → file name under accounts/img, or undefined (no picture)
 */

export const ENKA_ORIGIN = 'https://enka.network';
export const STORE_BASE = 'https://raw.githubusercontent.com/EnkaNetwork/API-docs/master/store/';
export const LANGS = /** @type {const} */ (['ko', 'en']);
export const MAX_METRICS = 4;
export const MAX_ITEMS = 4;

/** The committed maxima and medal units (both 미확인, spec §3.3/§14; OQ-4 default: null / empty), or a test's own. */
/** @param {Partial<EnkaConfig> | undefined} config @returns {EnkaConfig} */
export const enkaConfig = (config) => ({ metricMax: config?.metricMax ?? METRIC_MAX, medalUnits: config?.medalUnits ?? MEDAL_UNITS });

// Image paths (spec §6.2, §6.3): a single file name under /ui/ (Genshin) or /ui/zzz/ (ZZZ); no dot segments, no
// query, no other host. The URL is always ENKA_ORIGIN + path.
const PATHS = { genshin: /^\/ui\/[A-Za-z0-9_]+\.(png|jpg)$/, zzz: /^\/ui\/zzz\/[A-Za-z0-9_]+\.(png|jpg|webp)$/ };

/** @param {'genshin' | 'zzz'} game @param {unknown} path */
export function imagePathOk(game, path) {
  return typeof path === 'string' && PATHS[game].test(path);
}
/** @param {'genshin' | 'zzz'} game @param {unknown} path @returns {string | null} */
export function imageUrl(game, path) {
  return imagePathOk(game, path) ? ENKA_ORIGIN + /** @type {string} */ (path) : null;
}

// C0/C1 controls, the bidi embeddings/overrides/isolates (as account-ids.ts) and the bidi marks LRM, RLM, ALM.
const STRIP = /[\p{Cc}؜‎‏‪-‮⁦-⁩]/gu;

/**
 * Free text from a game (nickname, title, character name; spec §6.1): controls and bidi characters removed, NFC,
 * trimmed, cut to FREE_TEXT_MAX code points. account-ids.ts `normalize` refuses such text instead (it guards input);
 * a fetched name is shown, so it is cleaned. Empty → null.
 * @param {unknown} raw @returns {string | null}
 */
export function cleanText(raw) {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.replace(STRIP, '').normalize('NFC').trim();
  const cut = Array.from(cleaned).slice(0, FREE_TEXT_MAX).join('').trim();
  return cut === '' ? null : cut;
}

/**
 * Text from an Enka store `locs` table. Text that still holds template markup (`{…}`, e.g. ZZZ gendered text or a
 * player-name placeholder) is left out: the markup syntax is not in the spec's sources (enka-py
 * `_parse_gendered_text` resolves it to a neutral form; not available here), so it is not guessed.
 * @param {unknown} locs @param {'ko' | 'en'} lang @param {unknown} key @returns {string | null}
 */
export function locText(locs, lang, key) {
  if ((typeof key !== 'string' && typeof key !== 'number') || key === '') return null;
  const table = rec(rec(locs)?.[lang]);
  const text = table?.[String(key)];
  if (typeof text !== 'string' || /[{}]/.test(text)) return null;
  return cleanText(text);
}

/** @param {unknown} v @returns {Record<string, unknown> | null} a plain object, or null */
export function rec(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? /** @type {Record<string, unknown>} */ (v) : null;
}
/** @param {unknown} v @returns {number | null} a non-negative safe integer (a count or level), else null */
export function count(v) {
  return typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null;
}
/** @param {unknown} v @returns {string | null} an id usable as a store key (positive integer or digit string) */
export function idKey(v) {
  if (typeof v === 'number' && Number.isSafeInteger(v) && v > 0) return String(v);
  if (typeof v === 'string' && /^[1-9][0-9]{0,15}$/.test(v)) return v;
  return null;
}
/**
 * One metric; `max` only when the committed maximum is confirmed (not null, OQ-4).
 * @param {string} key @param {number | string} value @param {number | null} [max] @returns {AccountMetric}
 */
export function metric(key, value, max = null) {
  return max === null ? { key, value } : { key, value, max };
}

/**
 * Variable check before any request (spec §6.4 table, plan AL-5): an unset/blank UID skips the platform; an invalid
 * UID or a missing identity name is an error feed with zero requests.
 * @param {string | undefined} uidRaw @param {string | undefined} nameRaw
 * @returns {{ skip: true } | { reason: AccountFailReason } | { uid: string; name: string }}
 */
export function checkVars(uidRaw, nameRaw) {
  if (typeof uidRaw !== 'string' || uidRaw.trim() === '') return { skip: true };
  const uid = parseHoyoUid(uidRaw);
  if (uid === null) return { reason: 'invalid-id' };
  const name = typeof nameRaw === 'string' ? normalize(nameRaw) : null;
  // A name that normalize refuses (over 64 characters or with control characters) cannot be matched: treated as missing.
  if (!name) return { reason: 'no-name' };
  return { uid, name };
}

/** Enka's documented statuses (spec §6.4); other statuses and transport failures are `bad-response`. */
/** @param {{ status: number | null; error: string }} failed @returns {AccountFailReason} */
export function enkaReason(failed) {
  if (failed.error === 'timeout') return 'timeout';
  if (failed.error === 'http') {
    const s = failed.status ?? 0;
    if (s === 400) return 'http-400';
    if (s === 404) return 'http-404';
    if (s === 424) return 'http-424';
    if (s === 429) return 'http-429';
    // 500, 503 and 504 are the spec's rows (504 from enka-py); any other 5xx is reported the same way.
    if (s >= 500 && s <= 599) return 'http-5xx';
  }
  return 'bad-response';
}

/** @param {Uint8Array} bytes @returns {unknown} parsed JSON, or undefined when the body is not JSON */
export function parseJson(bytes) {
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return undefined;
  }
}

/** @param {string} platform @param {Date} now @param {AccountFailReason} reason @returns {AccountFeed} */
export function errorFeed(platform, now, reason) {
  return { schemaVersion: 1, platform, status: 'error', fetchedAt: now.toISOString(), maxAgeDays: ACCOUNT_MAX_AGE_DAYS, attribution: 'Enka.Network', reason, cards: [] };
}

/**
 * @param {string} platform @param {Date} now @param {unknown} ttl @param {AccountCard[]} cards @returns {AccountFeed}
 * `ttl` (seconds, Enka's cache hint) is recorded, never rendered (spec §6.4).
 */
export function okFeed(platform, now, ttl, cards) {
  /** @type {AccountFeed} */
  const feed = { schemaVersion: 1, platform, status: 'ok', fetchedAt: now.toISOString(), maxAgeDays: ACCOUNT_MAX_AGE_DAYS, attribution: 'Enka.Network' };
  const t = count(ttl);
  if (t !== null) feed.ttl = t;
  feed.cards = cards;
  return feed;
}

/**
 * The profile request. Returns the parsed body or the failure reason.
 * @param {URL} url @param {EnkaDeps} deps @param {{ used: number }} budget
 * @returns {Promise<{ body: Record<string, unknown> } | { reason: AccountFailReason }>}
 */
export async function fetchProfile(url, deps, budget) {
  const res = await safeFetch(url.href, { kind: 'json', budget, fetchImpl: deps.fetchImpl });
  if (!res.ok) return { reason: enkaReason(res) };
  const body = rec(parseJson(res.bytes));
  return body ? { body } : { reason: 'bad-response' };
}

/**
 * Store files, one request each, in order (spec §6.2, §6.3). A failed or non-object file is null: only the parts that
 * need it are left out.
 * @template {string} F
 * @param {'gi' | 'zzz'} dir @param {readonly F[]} files @param {EnkaDeps} deps @param {{ used: number }} budget
 * @returns {Promise<Record<F, Record<string, unknown> | null>>}
 */
export async function fetchStore(dir, files, deps, budget) {
  /** @type {Record<string, Record<string, unknown> | null>} */
  const out = {};
  for (const file of files) {
    const res = await safeFetch(`${STORE_BASE}${dir}/${file}.json`, { kind: 'store', budget, fetchImpl: deps.fetchImpl });
    out[file] = res.ok ? rec(parseJson(res.bytes)) : null;
  }
  return /** @type {Record<F, Record<string, unknown> | null>} */ (out);
}

/**
 * Downloads each distinct URL once. File name = sha1(url)[0..12] + '.' + the magic-byte kind (spec §5.4): no game
 * trademark or platform key reaches a built asset name. A failed image is only left out.
 * @param {Iterable<string>} urls @param {EnkaDeps} deps @param {{ used: number }} budget
 * @returns {Promise<{ names: Map<string, string>; images: { name: string; bytes: Uint8Array }[] }>}
 */
export async function fetchImages(urls, deps, budget) {
  const names = new Map();
  /** @type {{ name: string; bytes: Uint8Array }[]} */
  const images = [];
  for (const url of new Set(urls)) {
    const res = await safeFetch(url, { kind: 'image', budget, fetchImpl: deps.fetchImpl });
    if (!res.ok) continue;
    const kind = imageKind(res.bytes);
    if (kind === null) continue;
    const name = `${createHash('sha1').update(url).digest('hex').slice(0, 12)}.${kind}`;
    names.set(url, name);
    images.push({ name, bytes: res.bytes });
  }
  return { names, images };
}

/**
 * The shared fetch flow: variables → profile → identity (before any store or image call, R-13) → store → images →
 * two cards (ko, en). Any unexpected throw is a `bad-response` feed; a fetcher never throws.
 * @param {{
 *   platform: 'enka-genshin' | 'enka-zzz';
 *   vars: { uid: string | undefined; name: string | undefined };
 *   url: (uid: string) => URL;
 *   nickname: (body: Record<string, unknown>) => unknown;
 *   store: (deps: EnkaDeps, budget: { used: number }) => Promise<unknown>;
 *   shape: (body: Record<string, unknown>, store: any, lang: 'ko' | 'en', imageName: ImageName, config: EnkaConfig) => AccountCard | null;
 * }} spec
 * @param {EnkaDeps} deps
 * @returns {Promise<PlatformResult>}
 */
export async function runEnka(spec, deps) {
  const { platform } = spec;
  const vars = checkVars(spec.vars.uid, spec.vars.name);
  if ('skip' in vars) return { platform, state: 'skipped' };
  let now = new Date(0); // only if deps.now() throws: an epoch time stamp is never fresh, so the card stays hidden
  try {
    now = deps.now();
    if ('reason' in vars) return { platform, state: 'written', feed: errorFeed(platform, now, vars.reason), images: [] };
    const budget = { used: 0 };
    const profile = await fetchProfile(spec.url(vars.uid), deps, budget);
    if ('reason' in profile) return written(platform, errorFeed(platform, now, profile.reason));
    const fetchedName = spec.nickname(profile.body);
    if (typeof fetchedName !== 'string') return written(platform, errorFeed(platform, now, 'bad-response'));
    if (!sameName(fetchedName, vars.name)) return written(platform, errorFeed(platform, now, 'name-mismatch'));

    const config = enkaConfig(deps.config);
    const store = await spec.store(deps, budget);
    /** @type {Set<string>} */
    const wanted = new Set();
    for (const lang of LANGS) {
      spec.shape(profile.body, store, lang, (u) => {
        wanted.add(u);
        return undefined;
      }, config);
    }
    const { names, images } = await fetchImages(wanted, deps, budget);
    /** @type {AccountCard[]} */
    const cards = [];
    for (const lang of LANGS) {
      const card = spec.shape(profile.body, store, lang, (u) => names.get(u), config);
      if (card === null) return written(platform, errorFeed(platform, now, 'bad-response'));
      cards.push(card);
    }
    return { platform, state: 'written', feed: okFeed(platform, now, profile.body.ttl, cards), images };
  } catch {
    return written(platform, errorFeed(platform, now, 'bad-response'));
  }
}

/** @param {string} platform @param {AccountFeed} feed @returns {PlatformResult} */
const written = (platform, feed) => ({ platform, state: 'written', feed, images: [] });
