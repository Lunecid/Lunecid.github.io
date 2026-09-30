// scripts/accounts/enka-genshin.mjs — the Genshin Impact showcase through Enka.Network (account-link spec §3.3, §6.2,
// §6.4). One profile request, the identity check, four store files, then the pictures. Read from the response:
// playerInfo.{nickname, level, worldLevel, nameCardId, finishAchievementNum, towerFloorIndex, towerLevelIndex,
// theaterActIndex, showAvatarInfoList, profilePicture} and the top-level ttl. Never read: uid, region, owner, signature,
// equipment.
import { cleanText, count, enkaConfig, fetchStore, idKey, imageUrl, locText, MAX_ITEMS, MAX_METRICS, metric, rec, runEnka } from './enka-common.mjs';

/** @typedef {import('./enka-common.mjs').AccountCard} AccountCard */
/** @typedef {import('./enka-common.mjs').AccountItem} AccountItem */
/** @typedef {import('./enka-common.mjs').EnkaConfig} EnkaConfig */
/** @typedef {import('./enka-common.mjs').EnkaDeps} EnkaDeps */
/** @typedef {import('./enka-common.mjs').ImageName} ImageName */
/** @typedef {import('./enka-common.mjs').PlatformResult} PlatformResult */
/**
 * @typedef {{ avatars: Record<string, unknown> | null; namecards: Record<string, unknown> | null;
 *   pfps: Record<string, unknown> | null; locs: Record<string, unknown> | null }} GenshinStore
 */

const STORE_FILES = /** @type {const} */ (['avatars', 'namecards', 'pfps', 'locs']);
/** @type {ImageName} */
const noImage = () => undefined;

/**
 * `GET https://enka.network/api/uid/{uid}?info` — profile only; no trailing '/' (that form answers 308, spec §6.2).
 * The UID has passed parseHoyoUid (digits only) before it reaches the path.
 * @param {string} uid
 */
function profileUrl(uid) {
  const url = new URL(`/api/uid/${uid}`, 'https://enka.network');
  url.search = '?info';
  return url;
}

/**
 * The side icon of one avatar, or of its costume when the showcase names one. The costume entry's field name is
 * assumed to match the avatar's (`SideIconName`, 미확인: spec §6.2 names only `Costumes[costumeId]`); without it the
 * avatar's own icon is used. Only /ui/<name>.(png|jpg) paths are accepted (a bare icon name is not turned into a path).
 * @param {Record<string, unknown> | null} avatar @param {unknown} costumeId @returns {string | null}
 */
function sideIcon(avatar, costumeId) {
  if (!avatar) return null;
  const costumeKey = idKey(costumeId);
  const costume = costumeKey === null ? null : rec(rec(avatar.Costumes)?.[costumeKey]);
  return imageUrl('genshin', costume?.SideIconName) ?? imageUrl('genshin', avatar.SideIconName);
}

/**
 * The profile picture: new form `{ id }` → pfps[id].IconPath (미확인 form, enka-py); old form `{ avatarId }` → that
 * avatar's side icon (confirmed). Either may be absent: then no avatar image (the tile glyph stands in).
 * @param {unknown} picture @param {GenshinStore} store @returns {string | null}
 */
function profilePictureUrl(picture, store) {
  const p = rec(picture);
  if (!p) return null;
  const pfpKey = idKey(p.id);
  if (pfpKey !== null) return imageUrl('genshin', rec(store.pfps?.[pfpKey])?.IconPath);
  const avatarKey = idKey(p.avatarId);
  if (avatarKey !== null) return sideIcon(rec(store.avatars?.[avatarKey]), undefined);
  return null;
}

/**
 * One language card from a profile response and the store (pure; spec §3.3 row "원신", §5.5). Returns null when the
 * response has no usable nickname (the fetcher reports `bad-response`).
 * @param {unknown} profile the parsed response (with `playerInfo`)
 * @param {Partial<GenshinStore>} store store files; a missing one is null
 * @param {'ko' | 'en'} lang
 * @param {ImageName} [imageName] url → accounts/img file name; undefined leaves the picture out
 * @param {Partial<EnkaConfig>} [config] maxima (tests inject; the default is account-config.ts)
 * @returns {AccountCard | null}
 */
export function shapeGenshin(profile, store, lang, imageName = noImage, config = {}) {
  const info = rec(rec(profile)?.playerInfo);
  const title = cleanText(info?.nickname);
  if (!info || title === null) return null;
  /** @type {GenshinStore} */
  const s = { avatars: store.avatars ?? null, namecards: store.namecards ?? null, pfps: store.pfps ?? null, locs: store.locs ?? null };
  const max = enkaConfig(config).metricMax;

  // Metrics, in order: ar, achievements, abyss (floor-chamber; the stars form of spec §3.3 waits for OQ-4 because
  // towerStarIndex and its maximum are unconfirmed), then theater when present, else worldLevel.
  const metrics = [];
  const ar = count(info.level);
  if (ar !== null) metrics.push(metric('ar', ar, max.ar));
  const achievements = count(info.finishAchievementNum);
  if (achievements !== null) metrics.push(metric('achievements', achievements));
  const floor = count(info.towerFloorIndex);
  const chamber = count(info.towerLevelIndex);
  if (floor !== null && chamber !== null) metrics.push(metric('abyss', `${floor}-${chamber}`));
  // theaterActIndex: an optional field absent without a record (미확인 in a real response, spec §6.2).
  const theater = count(info.theaterActIndex);
  const worldLevel = count(info.worldLevel);
  if (theater !== null) metrics.push(metric('theater', theater));
  else if (worldLevel !== null) metrics.push(metric('worldLevel', worldLevel, max.worldLevel));

  /** @type {AccountItem[]} */
  const items = [];
  const shown = Array.isArray(info.showAvatarInfoList) ? info.showAvatarInfoList : [];
  for (const entry of shown) {
    if (items.length >= MAX_ITEMS) break;
    const e = rec(entry);
    const key = idKey(e?.avatarId);
    const avatar = key === null ? null : rec(s.avatars?.[key]);
    const name = avatar ? locText(s.locs, lang, avatar.NameTextMapHash) : null;
    if (!e || name === null) continue; // no store entry or no name → no row (spec §6.2)
    /** @type {AccountItem} */
    const item = { name };
    const url = sideIcon(avatar, e.costumeId);
    const file = url === null ? undefined : imageName(url);
    if (file !== undefined) item.image = file;
    const level = count(e.level);
    if (level !== null) item.meta = `Lv ${level}`;
    items.push(item);
  }

  /** @type {AccountCard} */
  const card = { lang, title };
  const avatarUrl = profilePictureUrl(info.profilePicture, s);
  const avatarFile = avatarUrl === null ? undefined : imageName(avatarUrl);
  if (avatarFile !== undefined) card.image = avatarFile;
  // nameCardId (capital C in real responses; the docs' namecardId is not read, spec §6.2) → namecards[id].Icon.
  const cardKey = idKey(info.nameCardId);
  const bannerUrl = cardKey === null ? null : imageUrl('genshin', rec(s.namecards?.[cardKey])?.Icon);
  const bannerFile = bannerUrl === null ? undefined : imageName(bannerUrl);
  if (bannerFile !== undefined) card.banner = bannerFile;
  card.stats = [];
  card.metrics = metrics.slice(0, MAX_METRICS);
  card.items = items;
  return card;
}

/**
 * @param {Record<string, string | undefined>} env ACCOUNT_GENSHIN_UID, ACCOUNT_GENSHIN_NAME
 * @param {EnkaDeps} deps
 * @returns {Promise<PlatformResult>}
 */
export function fetchGenshin(env, deps) {
  return runEnka(
    {
      platform: 'enka-genshin',
      vars: { uid: env.ACCOUNT_GENSHIN_UID, name: env.ACCOUNT_GENSHIN_NAME },
      url: profileUrl,
      nickname: (body) => rec(body.playerInfo)?.nickname,
      store: (d, budget) => fetchStore('gi', STORE_FILES, d, budget),
      shape: shapeGenshin,
    },
    deps,
  );
}

