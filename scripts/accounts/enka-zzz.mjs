// scripts/accounts/enka-zzz.mjs — the Zenless Zone Zero showcase through Enka.Network (account-link spec §3.3, §6.3,
// §6.4). The endpoint is not in Enka's docs (enka-py constants; 미확인 as documented API): a response of another shape
// is `bad-response`. Read from the response: PlayerInfo.SocialDetail.ProfileDetail.{Nickname, Level, ProfileId,
// CallingCardId, TitleInfo.Title}, SocialDetail.MedalList[].{MedalType, Value}, ShowcaseDetail.AvatarList[].{Id, Level}
// and the top-level ttl. Never read: uid, region, Desc, ObtainmentTimestamp, equipment, ProfileDetail.Title (0 in real
// responses), the title colours ColorA/ColorB (colour literals live only in tokens.css).
import { cleanText, count, enkaConfig, fetchStore, idKey, imageUrl, locText, MAX_ITEMS, MAX_METRICS, metric, rec, runEnka } from './enka-common.mjs';

/** @typedef {import('./enka-common.mjs').AccountCard} AccountCard */
/** @typedef {import('./enka-common.mjs').AccountItem} AccountItem */
/** @typedef {import('./enka-common.mjs').EnkaConfig} EnkaConfig */
/** @typedef {import('./enka-common.mjs').EnkaDeps} EnkaDeps */
/** @typedef {import('./enka-common.mjs').ImageName} ImageName */
/** @typedef {import('./enka-common.mjs').PlatformResult} PlatformResult */
/**
 * @typedef {{ avatars: Record<string, unknown> | null; pfps: Record<string, unknown> | null;
 *   namecards: Record<string, unknown> | null; titles: Record<string, unknown> | null; locs: Record<string, unknown> | null }} ZzzStore
 */

// medals.json is not fetched: medal item names are never shown (spec §6.3); the label comes from MedalType.
const STORE_FILES = /** @type {const} */ (['avatars', 'pfps', 'namecards', 'titles', 'locs']);
const MAX_MEDALS = 3;
const MEDAL_TYPES = new Set([1, 2, 3, 4]);
/** @type {ImageName} */
const noImage = () => undefined;

/** `GET https://enka.network/api/zzz/uid/{uid}` (no ?info: it has no effect here, spec §6.3). */
/** @param {string} uid */
const profileUrl = (uid) => new URL(`/api/zzz/uid/${uid}`, 'https://enka.network');

/** @param {unknown} profile */
const profileDetail = (profile) => rec(rec(rec(rec(profile)?.PlayerInfo)?.SocialDetail)?.ProfileDetail);

/**
 * One language card (pure; spec §3.3 row "젠존제", §5.5). Returns null when the response has no usable nickname.
 * @param {unknown} profile the parsed response (with `PlayerInfo`)
 * @param {Partial<ZzzStore>} store store files; a missing one is null
 * @param {'ko' | 'en'} lang
 * @param {ImageName} [imageName]
 * @param {Partial<EnkaConfig>} [config] ikLevel maximum and medal units (tests inject; default account-config.ts)
 * @returns {AccountCard | null}
 */
export function shapeZzz(profile, store, lang, imageName = noImage, config = {}) {
  const player = rec(rec(profile)?.PlayerInfo);
  const social = rec(player?.SocialDetail);
  const detail = rec(social?.ProfileDetail);
  const title = cleanText(detail?.Nickname);
  if (!detail || title === null) return null;
  /** @type {ZzzStore} */
  const s = { avatars: store.avatars ?? null, pfps: store.pfps ?? null, namecards: store.namecards ?? null, titles: store.titles ?? null, locs: store.locs ?? null };
  const { metricMax, medalUnits: units } = enkaConfig(config);
  const ikMax = metricMax.ikLevel;

  const metrics = [];
  const ik = count(detail.Level);
  if (ik !== null) metrics.push(metric('ikLevel', ik, ikMax));
  // Medals: only types with a confirmed unit (MEDAL_UNITS; 미확인, empty today → none), at most three, in list order.
  let medals = 0;
  for (const entry of Array.isArray(social?.MedalList) ? social.MedalList : []) {
    if (medals >= MAX_MEDALS) break;
    const m = rec(entry);
    const type = m?.MedalType;
    if (typeof type !== 'number' || !MEDAL_TYPES.has(type)) continue;
    const unit = units[/** @type {1 | 2 | 3 | 4} */ (type)];
    const value = count(m?.Value);
    if (unit === undefined || value === null) continue;
    metrics.push({ key: `medal.${type}`, value, unit });
    medals += 1;
  }

  /** @type {AccountItem[]} */
  const items = [];
  const list = rec(player?.ShowcaseDetail)?.AvatarList;
  for (const entry of Array.isArray(list) ? list : []) {
    if (items.length >= MAX_ITEMS) break;
    const e = rec(entry);
    const key = idKey(e?.Id);
    const agent = key === null ? null : rec(s.avatars?.[key]);
    const name = agent ? locText(s.locs, lang, agent.Name) : null;
    if (!e || name === null) continue;
    /** @type {AccountItem} */
    const item = { name };
    // CircleIcon only; the portrait (IconRole*.png, about 1.5 MB) is never used (spec §6.3).
    const url = imageUrl('zzz', agent?.CircleIcon);
    const file = url === null ? undefined : imageName(url);
    if (file !== undefined) item.image = file;
    const level = count(e.Level);
    if (level !== null) item.meta = `Lv ${level}`;
    items.push(item);
  }

  /** @type {AccountCard} */
  const card = { lang, title };
  // The title: TitleInfo.Title → titles.Titles[id].TitleText → locs. Gendered text is not guessed (locText).
  const titleKey = idKey(rec(detail.TitleInfo)?.Title);
  const titleEntry = titleKey === null ? null : rec(rec(s.titles?.Titles)?.[titleKey]);
  const subtitle = titleEntry ? locText(s.locs, lang, titleEntry.TitleText) : null;
  if (subtitle !== null) card.subtitle = subtitle;
  const pfpKey = idKey(detail.ProfileId);
  const avatarUrl = pfpKey === null ? null : imageUrl('zzz', rec(s.pfps?.[pfpKey])?.Icon);
  const avatarFile = avatarUrl === null ? undefined : imageName(avatarUrl);
  if (avatarFile !== undefined) card.image = avatarFile;
  const cardKey = idKey(detail.CallingCardId);
  const bannerUrl = cardKey === null ? null : imageUrl('zzz', rec(s.namecards?.[cardKey])?.Icon);
  const bannerFile = bannerUrl === null ? undefined : imageName(bannerUrl);
  if (bannerFile !== undefined) card.banner = bannerFile;
  card.stats = [];
  card.metrics = metrics.slice(0, MAX_METRICS);
  card.items = items;
  return card;
}

/**
 * @param {Record<string, string | undefined>} env ACCOUNT_ZZZ_UID, ACCOUNT_ZZZ_NAME
 * @param {EnkaDeps} deps
 * @returns {Promise<PlatformResult>}
 */
export function fetchZzz(env, deps) {
  return runEnka(
    {
      platform: 'enka-zzz',
      vars: { uid: env.ACCOUNT_ZZZ_UID, name: env.ACCOUNT_ZZZ_NAME },
      url: profileUrl,
      nickname: (body) => profileDetail(body)?.Nickname,
      store: (d, budget) => fetchStore('zzz', STORE_FILES, d, budget),
      shape: shapeZzz,
    },
    deps,
  );
}
