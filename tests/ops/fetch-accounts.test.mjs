// AL-5 (account-link spec §5.5, §6.1–6.4, R-7, R-13): the Enka.Network fetchers for the two HoYoverse showcases.
// Every fetch is injected (a recording fetchImpl returning Response objects); no test reaches the network. The
// fixtures under tests/ops/fixtures/accounts/ are synthetic (built from the spec's field lists, OQ-9); their `_note` key
// is stripped before use. The UIDs are the spec's public examples, never the owner's.
// AL-6 (spec §5.1–5.5, §6.5–6.7, R-3, R-10, R-13, R-15) adds the Steam, Riot and entry parts below the Enka part: the
// Steam fixtures are synthetic too (§6.5 field list; the XML ones carry the note as a comment), the Steam ID and Riot
// ID are the spec's public examples, and the Steam key is a fake built at run time.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchGenshin, shapeGenshin } from '../../scripts/accounts/enka-genshin.mjs';
import { fetchZzz, shapeZzz } from '../../scripts/accounts/enka-zzz.mjs';
import { cleanText, imagePathOk } from '../../scripts/accounts/enka-common.mjs';
import { USER_AGENT } from '../../scripts/accounts/safe-fetch.mjs';
import { REASON_TEXT } from '../../scripts/accounts/reasons.mjs';
import { fetchSteam, shapeSteam } from '../../scripts/accounts/steam.mjs';
import { fetchRiotLinks } from '../../scripts/accounts/riot-links.mjs';
import { fetchAccounts, runFetchAccounts, summaryMarkdown, writeAccounts } from '../../scripts/fetch-accounts.mjs';
import { STEAM_GAME_FILTER, STEAM_SHOW_GAMES, STEAM_TOP_GAMES } from '../../src/lib/account-config.ts';

const GI_UID = '618285856';
const ZZZ_UID = '1300025292';
const GI_URL = `https://enka.network/api/uid/${GI_UID}?info`;
const ZZZ_URL = `https://enka.network/api/zzz/uid/${ZZZ_UID}`;
const STORE = 'https://raw.githubusercontent.com/EnkaNetwork/API-docs/master/store/';
const NOW = new Date('2026-09-30T03:31:00Z');
const GI_ENV = { ACCOUNT_GENSHIN_UID: GI_UID, ACCOUNT_GENSHIN_NAME: 'synthwanderer' };
const ZZZ_ENV = { ACCOUNT_ZZZ_UID: ZZZ_UID, ACCOUNT_ZZZ_NAME: ' SynthProxy ' };

/** A fixture without its `_note` (spec-derived, synthetic). */
function fixture(name) {
  const data = JSON.parse(readFileSync(new URL(`./fixtures/accounts/${name}.json`, import.meta.url), 'utf8'));
  assert.match(String(data._note), /^synthetic fixture from spec §6\.[23]/, `${name} is marked synthetic`);
  delete data._note;
  return data;
}

const GI_STORE = () => ({ avatars: fixture('gi-store-avatars'), namecards: fixture('gi-store-namecards'), pfps: fixture('gi-store-pfps'), locs: fixture('gi-store-locs') });
const ZZZ_STORE = () => ({ avatars: fixture('zzz-store-avatars'), pfps: fixture('zzz-store-pfps'), namecards: fixture('zzz-store-namecards'), titles: fixture('zzz-store-titles'), locs: fixture('zzz-store-locs') });

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const JPG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46]);
const WEBP = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 4, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50]);
const jsonRes = (body, status = 200, type = 'application/json; charset=utf-8') =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': type } });
const imageRes = (url) => {
  const bytes = url.endsWith('.jpg') ? JPG : url.endsWith('.webp') ? WEBP : PNG;
  return new Response(bytes, { status: 200, headers: { 'content-type': 'image/png' } });
};

/**
 * A recording Enka + store + image fake. `profile` answers the profile URL; `store` maps `gi/avatars.json` style keys
 * to objects (a missing key answers 404); `override(url)` may return a Response first.
 */
function enkaFake({ profileUrl, profile, store, override }) {
  /** @type {{ url: string; headers: Headers; init: RequestInit }[]} */
  const calls = [];
  /** @type {typeof fetch} */
  const fetchImpl = async (input, init = {}) => {
    const url = String(input);
    calls.push({ url, headers: new Headers(init.headers), init });
    const forced = override?.(url);
    if (forced) return forced;
    if (url === profileUrl) return jsonRes(profile);
    if (url.startsWith(STORE)) {
      const key = url.slice(STORE.length);
      return key in store ? jsonRes(store[key], 200, 'text/plain; charset=utf-8') : new Response('404: Not Found', { status: 404 });
    }
    if (url.startsWith('https://enka.network/ui/')) return imageRes(url);
    return new Response('unexpected', { status: 599 });
  };
  return { calls, fetchImpl };
}
const giStoreFiles = (s = GI_STORE()) => ({ 'gi/avatars.json': s.avatars, 'gi/namecards.json': s.namecards, 'gi/pfps.json': s.pfps, 'gi/locs.json': s.locs });
const zzzStoreFiles = (s = ZZZ_STORE()) => ({ 'zzz/avatars.json': s.avatars, 'zzz/pfps.json': s.pfps, 'zzz/namecards.json': s.namecards, 'zzz/titles.json': s.titles, 'zzz/locs.json': s.locs });
const giFake = (opts = {}) => enkaFake({ profileUrl: GI_URL, profile: fixture('enka-genshin'), store: giStoreFiles(), ...opts });
const zzzFake = (opts = {}) => enkaFake({ profileUrl: ZZZ_URL, profile: fixture('enka-zzz'), store: zzzStoreFiles(), ...opts });
const deps = (fetchImpl, extra = {}) => ({ fetchImpl, now: () => NOW, ...extra });
const keys = (o) => Object.keys(o).sort();

const IMG_NAME = /^[0-9a-f]{12}\.(png|jpg|webp)$/;
/** The card fields each item may carry (spec §5.5). */
function assertItemShape(item) {
  for (const k of Object.keys(item)) assert.ok(['name', 'image', 'meta'].includes(k), `item key ${k}`);
  assert.equal(typeof item.name, 'string');
  if ('image' in item) assert.match(item.image, IMG_NAME);
}

// ——— Genshin ———

test('Genshin ok path: exact feed, card, metric and item key sets; ko then en; metric order; no max while METRIC_MAX is null', async () => {
  const { calls, fetchImpl } = giFake();
  const res = await fetchGenshin(GI_ENV, deps(fetchImpl));
  assert.equal(res.platform, 'enka-genshin');
  assert.equal(res.state, 'written');
  const { feed } = res;
  assert.deepEqual(keys(feed), ['attribution', 'cards', 'fetchedAt', 'maxAgeDays', 'platform', 'schemaVersion', 'status', 'ttl']);
  assert.equal(feed.schemaVersion, 1);
  assert.equal(feed.platform, 'enka-genshin');
  assert.equal(feed.status, 'ok');
  assert.equal(feed.fetchedAt, NOW.toISOString());
  assert.equal(feed.maxAgeDays, 7);
  assert.equal(feed.attribution, 'Enka.Network');
  assert.equal(feed.ttl, 60);
  assert.deepEqual(feed.cards.map((c) => c.lang), ['ko', 'en']);
  for (const card of feed.cards) {
    assert.deepEqual(keys(card), ['banner', 'image', 'items', 'lang', 'metrics', 'stats', 'title']);
    assert.deepEqual(card.stats, []);
    assert.equal(card.title, 'SynthWanderer');
    assert.match(card.image, IMG_NAME);
    assert.match(card.banner, /^[0-9a-f]{12}\.jpg$/);
    // ar, achievements, abyss (floor-chamber string; the stars form waits for OQ-4), theater (present, so no worldLevel)
    assert.deepEqual(card.metrics, [
      { key: 'ar', value: 57 },
      { key: 'achievements', value: 812 },
      { key: 'abyss', value: '12-3' },
      { key: 'theater', value: 8 },
    ]);
    for (const m of card.metrics) assert.deepEqual(keys(m), ['key', 'value']);
    assert.ok(card.items.length <= 4);
    for (const item of card.items) assertItemShape(item);
  }
  const [ko, en] = feed.cards;
  assert.deepEqual(ko.items.slice(0, 3).map((i) => i.name), ['합성 캐릭터 가', '합성 캐릭터 나', '합성 캐릭터 다']);
  assert.deepEqual(en.items.slice(0, 3).map((i) => i.name), ['Synthetic A', 'Synthetic B', 'Synthetic C']);
  assert.deepEqual(ko.items.map((i) => i.meta), ['Lv 90', 'Lv 80', 'Lv 70', 'Lv 60']);
  // Same pictures in both languages.
  assert.deepEqual(ko.items.map((i) => i.image), en.items.map((i) => i.image));
  assert.equal(ko.image, en.image);

  // Images: one file per distinct URL, named sha1(url)[0..12].<kind>; every card image name is in the list.
  const names = res.images.map((i) => i.name);
  assert.equal(new Set(names).size, names.length);
  for (const n of names) assert.match(n, IMG_NAME);
  for (const card of feed.cards) for (const n of [card.image, card.banner, ...card.items.map((i) => i.image).filter(Boolean)]) assert.ok(names.includes(n), n);
  for (const img of res.images) assert.ok(img.bytes instanceof Uint8Array && img.bytes.length > 0);

  // Request order: profile, then store files, then images; every request carries our User-Agent.
  assert.equal(calls[0].url, GI_URL);
  for (const c of calls) assert.equal(c.headers.get('user-agent'), USER_AGENT);
  const firstImage = calls.findIndex((c) => c.url.startsWith('https://enka.network/ui/'));
  const lastStore = calls.findLastIndex((c) => c.url.startsWith(STORE));
  assert.ok(lastStore > 0 && firstImage > lastStore, 'store before images');
  assert.deepEqual(calls.filter((c) => c.url.startsWith(STORE)).map((c) => c.url.slice(STORE.length)).sort(), ['gi/avatars.json', 'gi/locs.json', 'gi/namecards.json', 'gi/pfps.json']);
});

test('Genshin images: costume side icon when present, pfps IconPath for profilePicture.id, namecard banner; bad paths dropped', async () => {
  const { calls, fetchImpl } = giFake();
  const res = await fetchGenshin(GI_ENV, deps(fetchImpl));
  const imageUrls = calls.filter((c) => c.url.startsWith('https://enka.network/ui/')).map((c) => c.url).sort();
  assert.deepEqual(imageUrls, [
    'https://enka.network/ui/UI_AvatarIcon_Side_SynthA.png',
    'https://enka.network/ui/UI_AvatarIcon_Side_SynthB_Alt.png',
    'https://enka.network/ui/UI_AvatarIcon_SynthPfp.png',
    'https://enka.network/ui/UI_NameCardPic_0_P.jpg',
  ]);
  const [ko] = res.feed.cards;
  // SynthC (/ui/../) and SynthD (.gif) keep their row without a picture; 10000905 has no name and is left out.
  assert.equal('image' in ko.items[2], false);
  assert.equal('image' in ko.items[3], false);
  assert.equal(ko.items.length, 4);
});

test('Genshin old profilePicture form (avatarId) → the avatar side icon; theater absent → worldLevel; ttl kept', async () => {
  const { calls, fetchImpl } = giFake({ profile: fixture('enka-genshin-old') });
  const res = await fetchGenshin(GI_ENV, deps(fetchImpl));
  const [ko] = res.feed.cards;
  assert.deepEqual(ko.metrics, [
    { key: 'ar', value: 35 },
    { key: 'achievements', value: 120 },
    { key: 'abyss', value: '8-2' },
    { key: 'worldLevel', value: 4 },
  ]);
  const sideA = calls.filter((c) => c.url === 'https://enka.network/ui/UI_AvatarIcon_Side_SynthA.png');
  assert.equal(sideA.length, 1, 'one download for the avatar and the item that share a picture');
  assert.equal(ko.image, ko.items[0].image);
  assert.deepEqual(ko.items.map((i) => i.name), ['합성 캐릭터 가']);
});

test('shapeGenshin: optional fields; abyss only with both indexes; injected maxima add `max`; pure (no fetch)', () => {
  const profile = fixture('enka-genshin');
  delete profile.playerInfo.towerLevelIndex;
  delete profile.playerInfo.theaterActIndex;
  delete profile.playerInfo.profilePicture;
  delete profile.playerInfo.nameCardId;
  const card = shapeGenshin(profile, GI_STORE(), 'en');
  assert.deepEqual(card.metrics, [
    { key: 'ar', value: 57 },
    { key: 'achievements', value: 812 },
    { key: 'worldLevel', value: 8 },
  ]);
  assert.equal('image' in card, false, 'no profile picture → no avatar (the glyph stands in)');
  assert.equal('banner' in card, false);
  assert.equal(card.lang, 'en');

  const maxed = shapeGenshin(profile, GI_STORE(), 'ko', undefined, { metricMax: { ar: 1001, abyssStars: null, worldLevel: 1002, ikLevel: null } });
  assert.deepEqual(maxed.metrics.filter((m) => 'max' in m), [
    { key: 'ar', value: 57, max: 1001 },
    { key: 'worldLevel', value: 8, max: 1002 },
  ]);

  // Non-integer or negative numbers are not facts: the metric is left out.
  const odd = fixture('enka-genshin');
  odd.playerInfo.level = '57';
  odd.playerInfo.finishAchievementNum = -1;
  odd.playerInfo.theaterActIndex = 1.5;
  assert.deepEqual(shapeGenshin(odd, GI_STORE(), 'ko').metrics.map((m) => m.key), ['abyss', 'worldLevel']);
});

test('the serialised feed carries no UID and none of uid, owner, region, signature, Desc, ObtainmentTimestamp', async () => {
  for (const [fetcher, fake, env, uid] of [
    [fetchGenshin, giFake(), GI_ENV, GI_UID],
    [fetchZzz, zzzFake(), ZZZ_ENV, ZZZ_UID],
  ]) {
    const res = await fetcher(env, deps(fake.fetchImpl));
    assert.equal(res.feed.status, 'ok');
    const text = JSON.stringify(res.feed);
    assert.equal(text.includes(uid), false, 'no UID');
    for (const word of ['uid', 'owner', 'region', 'signature', 'Desc', 'ObtainmentTimestamp', 'synthetic player-written', 'SYNTH', 'synthetic-owner', 'Color', 'synthetic-a', 'TalentLevel', 'Equipped']) {
      assert.equal(text.includes(word), false, `${res.platform}: ${word}`);
    }
    for (const img of res.images) assert.equal(img.name.includes(uid), false);
  }
});

test('name mismatch → error name-mismatch, no cards, and zero store or image requests after the profile', async () => {
  for (const [fetcher, fake, env, platform] of [
    [fetchGenshin, giFake(), { ...GI_ENV, ACCOUNT_GENSHIN_NAME: 'SomeoneElse' }, 'enka-genshin'],
    [fetchZzz, zzzFake(), { ...ZZZ_ENV, ACCOUNT_ZZZ_NAME: 'SomeoneElse' }, 'enka-zzz'],
  ]) {
    const res = await fetcher(env, deps(fake.fetchImpl));
    assert.equal(res.state, 'written');
    assert.deepEqual(res.feed, { schemaVersion: 1, platform, status: 'error', fetchedAt: NOW.toISOString(), maxAgeDays: 7, attribution: 'Enka.Network', reason: 'name-mismatch', cards: [] });
    assert.deepEqual(res.images, []);
    assert.equal(fake.calls.length, 1, 'only the profile request');
  }
});

test('a fetched nickname with a bidi control never matches (identity check on the raw value)', async () => {
  const profile = fixture('enka-genshin');
  profile.playerInfo.nickname = 'Synth‮Wanderer';
  const { calls, fetchImpl } = giFake({ profile });
  const res = await fetchGenshin({ ...GI_ENV, ACCOUNT_GENSHIN_NAME: 'SynthWanderer' }, deps(fetchImpl));
  assert.equal(res.feed.reason, 'name-mismatch');
  assert.equal(calls.length, 1);
});

test('no UID → skipped (no file); UID without a name → no-name; invalid UID → invalid-id; both with zero requests', async () => {
  for (const [fetcher, uidVar, nameVar, platform] of [
    [fetchGenshin, 'ACCOUNT_GENSHIN_UID', 'ACCOUNT_GENSHIN_NAME', 'enka-genshin'],
    [fetchZzz, 'ACCOUNT_ZZZ_UID', 'ACCOUNT_ZZZ_NAME', 'enka-zzz'],
  ]) {
    const fake = platform === 'enka-genshin' ? giFake() : zzzFake();
    for (const env of [{}, { [uidVar]: '' }, { [uidVar]: '   ', [nameVar]: 'x' }]) {
      assert.deepEqual(await fetcher(env, deps(fake.fetchImpl)), { platform, state: 'skipped' });
    }
    const uid = platform === 'enka-genshin' ? GI_UID : ZZZ_UID;
    for (const name of [undefined, '', '  ']) {
      const res = await fetcher({ [uidVar]: uid, [nameVar]: name }, deps(fake.fetchImpl));
      assert.equal(res.state, 'written');
      assert.equal(res.feed.status, 'error');
      assert.equal(res.feed.reason, 'no-name');
      assert.deepEqual(res.feed.cards, []);
    }
    for (const bad of ['abc', '0618285856', '1', '12345678901', `${uid}/../x`]) {
      const res = await fetcher({ [uidVar]: bad, [nameVar]: 'x' }, deps(fake.fetchImpl));
      assert.equal(res.feed.reason, 'invalid-id', bad);
      assert.equal('authFailed' in res.feed, false);
    }
    assert.equal(fake.calls.length, 0, `${platform}: no request`);
  }
});

test('request URLs are exact (no trailing slash; ?info only for Genshin) and carry the User-Agent', async () => {
  const gi = giFake();
  await fetchGenshin(GI_ENV, deps(gi.fetchImpl));
  assert.equal(gi.calls[0].url, 'https://enka.network/api/uid/618285856?info');
  assert.equal(gi.calls[0].headers.get('user-agent'), 'lunecid-portfolio/1.0 (+https://lunecid.github.io)');
  const zzz = zzzFake();
  await fetchZzz(ZZZ_ENV, deps(zzz.fetchImpl));
  assert.equal(zzz.calls[0].url, 'https://enka.network/api/zzz/uid/1300025292');
  assert.equal(zzz.calls[0].headers.get('user-agent'), 'lunecid-portfolio/1.0 (+https://lunecid.github.io)');
  for (const c of [...gi.calls, ...zzz.calls]) assert.equal(new Headers(c.init.headers).has('x-webapi-key'), false);
});

test('each Enka status maps to its reason (spec §6.4); authFailed is never set; nothing else is requested', async () => {
  const cases = [
    [400, 'http-400'],
    [404, 'http-404'],
    [424, 'http-424'],
    [429, 'http-429'],
    [500, 'http-5xx'],
    [503, 'http-5xx'],
    [504, 'http-5xx'],
  ];
  for (const [fetcher, url, env, platform] of [
    [fetchGenshin, GI_URL, GI_ENV, 'enka-genshin'],
    [fetchZzz, ZZZ_URL, ZZZ_ENV, 'enka-zzz'],
  ]) {
    for (const [status, reason] of cases) {
      const fake = enkaFake({ profileUrl: url, profile: {}, store: {}, override: (u) => (u === url ? jsonRes({ message: 'x' }, status) : null) });
      const res = await fetcher(env, deps(fake.fetchImpl));
      assert.deepEqual(res.feed, { schemaVersion: 1, platform, status: 'error', fetchedAt: NOW.toISOString(), maxAgeDays: 7, attribution: 'Enka.Network', reason, cards: [] }, `${platform} ${status}`);
      assert.equal(fake.calls.length, 1);
      assert.ok(REASON_TEXT[reason], reason);
    }
    const timeout = enkaFake({
      profileUrl: url,
      profile: {},
      store: {},
      override: () => {
        throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
      },
    });
    const t = await fetcher(env, deps(timeout.fetchImpl));
    assert.equal(t.feed.reason, 'timeout');
    assert.equal('authFailed' in t.feed, false);
    for (const body of ['not json', '[]', '{"playerInfo":null}', '{"PlayerInfo":{}}', '{"playerInfo":{"nickname":5}}']) {
      const fake = enkaFake({ profileUrl: url, profile: {}, store: {}, override: (u) => (u === url ? jsonRes(body) : null) });
      const res = await fetcher(env, deps(fake.fetchImpl));
      assert.equal(res.feed.reason, 'bad-response', `${platform} ${body}`);
      assert.equal(fake.calls.length, 1);
    }
  }
});

test('a failed store file removes only what needs it (Genshin)', async () => {
  // namecards missing → no banner; everything else stays.
  const noNamecards = giStoreFiles();
  delete noNamecards['gi/namecards.json'];
  let res = await fetchGenshin(GI_ENV, deps(giFake({ store: noNamecards }).fetchImpl));
  assert.equal(res.feed.status, 'ok');
  assert.equal('banner' in res.feed.cards[0], false);
  assert.ok(res.feed.cards[0].image);
  assert.equal(res.feed.cards[0].items.length, 4);

  // locs missing → no item rows (no names); banner and avatar stay.
  const noLocs = giStoreFiles();
  delete noLocs['gi/locs.json'];
  res = await fetchGenshin(GI_ENV, deps(giFake({ store: noLocs }).fetchImpl));
  assert.deepEqual(res.feed.cards[0].items, []);
  assert.ok(res.feed.cards[0].banner);
  assert.ok(res.feed.cards[0].image);
  assert.equal(res.feed.cards[0].metrics.length, 4);

  // pfps broken (not JSON) → no avatar; avatars missing → no items (and no old-form avatar either).
  const brokenPfps = enkaFake({ profileUrl: GI_URL, profile: fixture('enka-genshin'), store: giStoreFiles(), override: (u) => (u.endsWith('gi/pfps.json') ? jsonRes('{oops', 200, 'text/plain') : null) });
  res = await fetchGenshin(GI_ENV, deps(brokenPfps.fetchImpl));
  assert.equal('image' in res.feed.cards[0], false);
  assert.ok(res.feed.cards[0].banner);
  const noAvatars = giStoreFiles();
  delete noAvatars['gi/avatars.json'];
  res = await fetchGenshin(GI_ENV, deps(giFake({ store: noAvatars }).fetchImpl));
  assert.deepEqual(res.feed.cards[0].items, []);
  assert.ok(res.feed.cards[0].banner);
});

test('a failed image drops only that picture; the card and its row stay', async () => {
  const fake = giFake({ override: (u) => (u.endsWith('UI_NameCardPic_0_P.jpg') ? new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } }) : u.endsWith('SynthPfp.png') ? new Response(null, { status: 404 }) : null) });
  const res = await fetchGenshin(GI_ENV, deps(fake.fetchImpl));
  assert.equal(res.feed.status, 'ok');
  const [ko] = res.feed.cards;
  assert.equal('banner' in ko, false);
  assert.equal('image' in ko, false);
  assert.ok(ko.items[0].image);
  assert.equal(res.images.length, 2);
});

// ——— ZZZ ———

test('ZZZ ok path: exact key sets; subtitle from the title; ikLevel; no medal while MEDAL_UNITS is empty; CircleIcon items', async () => {
  const { calls, fetchImpl } = zzzFake();
  const res = await fetchZzz(ZZZ_ENV, deps(fetchImpl));
  assert.equal(res.platform, 'enka-zzz');
  const { feed } = res;
  assert.deepEqual(keys(feed), ['attribution', 'cards', 'fetchedAt', 'maxAgeDays', 'platform', 'schemaVersion', 'status', 'ttl']);
  assert.equal(feed.status, 'ok');
  assert.equal(feed.attribution, 'Enka.Network');
  assert.equal(feed.ttl, 60);
  assert.deepEqual(feed.cards.map((c) => c.lang), ['ko', 'en']);
  const [ko, en] = feed.cards;
  for (const card of feed.cards) {
    assert.deepEqual(keys(card), ['banner', 'image', 'items', 'lang', 'metrics', 'stats', 'subtitle', 'title']);
    assert.equal(card.title, 'SynthProxy');
    assert.deepEqual(card.stats, []);
    assert.deepEqual(card.metrics, [{ key: 'ikLevel', value: 55 }]);
    assert.match(card.image, /^[0-9a-f]{12}\.webp$/);
    assert.match(card.banner, /^[0-9a-f]{12}\.png$/);
    for (const item of card.items) assertItemShape(item);
  }
  assert.equal(ko.subtitle, '합성 칭호');
  assert.equal(en.subtitle, 'Synthetic Title');
  assert.deepEqual(ko.items.map((i) => [i.name, i.meta]), [['합성 에이전트 가', 'Lv 60'], ['합성 에이전트 나', 'Lv 50'], ['합성 에이전트 다', 'Lv 40']]);
  assert.deepEqual(en.items.map((i) => i.name), ['Synthetic Agent A', 'Synthetic Agent B', 'Synthetic Agent C']);
  assert.match(ko.items[0].image, /\.png$/);
  assert.match(ko.items[1].image, /\.webp$/);
  assert.equal('image' in ko.items[2], false, '/ui/ without zzz/ is not a ZZZ path');
  const storeFiles = calls.filter((c) => c.url.startsWith(STORE)).map((c) => c.url.slice(STORE.length)).sort();
  assert.deepEqual(storeFiles, ['zzz/avatars.json', 'zzz/locs.json', 'zzz/namecards.json', 'zzz/pfps.json', 'zzz/titles.json']);
});

test('shapeZzz: medals only for types with a unit (injected), ≤ 3, after ikLevel; injected ikLevel max; no title → no subtitle', () => {
  const profile = fixture('enka-zzz');
  const plain = shapeZzz(profile, ZZZ_STORE(), 'ko');
  assert.deepEqual(plain.metrics, [{ key: 'ikLevel', value: 55 }]);

  profile.PlayerInfo.SocialDetail.MedalList.push(
    { MedalType: 2, Value: 7, MedalIcon: 1, MedalScore: 1 },
    { MedalType: 4, Value: 9, MedalIcon: 1, MedalScore: 1 },
    { MedalType: 9, Value: 1, MedalIcon: 1, MedalScore: 1 },
  );
  const config = { metricMax: { ar: null, abyssStars: null, worldLevel: null, ikLevel: 1003 }, medalUnits: { 1: 'score', 2: 'stars', 3: 'score', 4: 'score' } };
  const withUnits = shapeZzz(profile, ZZZ_STORE(), 'ko', undefined, config);
  assert.deepEqual(withUnits.metrics, [
    { key: 'ikLevel', value: 55, max: 1003 },
    { key: 'medal.1', value: 30, unit: 'score' },
    { key: 'medal.3', value: 5, unit: 'score' },
    { key: 'medal.2', value: 7, unit: 'stars' },
  ]);
  const onlyOne = shapeZzz(profile, ZZZ_STORE(), 'ko', undefined, { ...config, medalUnits: { 3: 'score' } });
  assert.deepEqual(onlyOne.metrics.map((m) => m.key), ['ikLevel', 'medal.3']);

  delete profile.PlayerInfo.SocialDetail.ProfileDetail.TitleInfo;
  delete profile.PlayerInfo.ShowcaseDetail;
  const bare = shapeZzz(profile, ZZZ_STORE(), 'en');
  assert.equal('subtitle' in bare, false);
  assert.deepEqual(bare.items, []);
});

test('ZZZ: gendered or templated text is not guessed (left out); titles or locs missing → no subtitle', async () => {
  const store = ZZZ_STORE();
  store.locs.ko.Title_Synth = '{M#합성}{F#합성}';
  const card = shapeZzz(fixture('enka-zzz'), store, 'ko');
  assert.equal('subtitle' in card, false);
  assert.equal(shapeZzz(fixture('enka-zzz'), store, 'en').subtitle, 'Synthetic Title');

  const noTitles = zzzStoreFiles();
  delete noTitles['zzz/titles.json'];
  const res = await fetchZzz(ZZZ_ENV, deps(zzzFake({ store: noTitles }).fetchImpl));
  assert.equal(res.feed.status, 'ok');
  assert.equal('subtitle' in res.feed.cards[0], false);
  assert.equal(res.feed.cards[0].items.length, 3);
});

// ——— shared rules ———

test('image paths: Genshin /ui/<name>.(png|jpg); ZZZ /ui/zzz/<name>.(png|jpg|webp); traversal, absolute URLs and .gif refused', () => {
  assert.equal(imagePathOk('genshin', '/ui/UI_NameCardPic_0_P.jpg'), true);
  assert.equal(imagePathOk('genshin', '/ui/UI_AvatarIcon_Side_SynthA.png'), true);
  assert.equal(imagePathOk('zzz', '/ui/zzz/IconRole21.png'), true);
  assert.equal(imagePathOk('zzz', '/ui/zzz/IconPfpSynth.webp'), true);
  for (const [game, bad] of [
    ['genshin', '/ui/../x.png'],
    ['genshin', 'https://enka.network/ui/x.png'],
    ['genshin', '/ui/x.gif'],
    ['genshin', '/ui/x.webp'],
    ['genshin', '/ui/zzz/x.png'],
    ['genshin', '/ui/x.png?y=1'],
    ['genshin', '//evil.example/ui/x.png'],
    ['zzz', '/ui/zzz/../x.png'],
    ['zzz', 'https://enka.network/ui/zzz/x.png'],
    ['zzz', '/ui/zzz/x.gif'],
    ['zzz', '/ui/x.png'],
    ['zzz', '/ui/zzz/sub/x.png'],
    ['genshin', 5],
    ['zzz', null],
  ]) {
    assert.equal(imagePathOk(game, bad), false, `${game} ${bad}`);
  }
});

test('image file names never carry a trademark, a platform key or "enka"', async () => {
  const terms = trademarkTerms();
  assert.ok(terms.length > 20 && terms.includes('Genshin') && terms.includes('ZZZ'));
  const all = [];
  for (const [fetcher, fake, env] of [
    [fetchGenshin, giFake(), GI_ENV],
    [fetchZzz, zzzFake(), ZZZ_ENV],
  ]) {
    const res = await fetcher(env, deps(fake.fetchImpl));
    all.push(...res.images.map((i) => i.name));
  }
  assert.ok(all.length >= 6);
  for (const name of all) {
    assert.match(name, IMG_NAME);
    assert.equal(containsTrademark(name, terms), false, name);
    assert.equal(/enka|genshin|zzz|hoyo/i.test(name), false, name);
  }
});

test('free text: controls and bidi marks removed, NFC, trimmed, cut to 40 characters', async () => {
  const sixty = '‮' + 'ㄱ'.repeat(30) + '\u0007' + 'b'.repeat(29) + '⁦';
  const out = cleanText(sixty);
  assert.ok(out.length <= 40);
  assert.equal(/[\u0000-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]/.test(out), false);
  assert.equal(out, 'ㄱ'.repeat(30) + 'b'.repeat(10));
  assert.equal(cleanText('  é  '), 'é');
  assert.equal(cleanText('‮⁦ '), null);
  assert.equal(cleanText(42), null);
  assert.equal([...cleanText('😀'.repeat(50))].length, 40, 'cut by code point, never half a surrogate pair');

  // Through the fetcher: the 60-character loc name with a bidi control (item 4) and a long nickname in the pure shaper.
  const res = await fetchGenshin(GI_ENV, deps(giFake().fetchImpl));
  for (const card of res.feed.cards) {
    const item = card.items[3];
    assert.ok(item.name.length <= 40, item.name);
    assert.equal(item.name.includes('‮'), false);
  }
  const profile = fixture('enka-genshin');
  profile.playerInfo.nickname = '⁧' + 'N'.repeat(59);
  assert.equal(shapeGenshin(profile, GI_STORE(), 'ko').title, 'N'.repeat(40));
  const zp = fixture('enka-zzz');
  zp.PlayerInfo.SocialDetail.ProfileDetail.Nickname = 'Z'.repeat(45) + '‪';
  assert.equal(shapeZzz(zp, ZZZ_STORE(), 'en').title, 'Z'.repeat(40));
});

test('a nickname that cleans to nothing is a bad response (no empty title is ever written)', () => {
  const profile = fixture('enka-genshin');
  profile.playerInfo.nickname = '‮';
  assert.equal(shapeGenshin(profile, GI_STORE(), 'ko'), null);
});

test('a store response of the wrong content type is dropped like a failed file', async () => {
  const fake = giFake({ override: (u) => (u.endsWith('gi/locs.json') ? new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } }) : null) });
  const res = await fetchGenshin(GI_ENV, deps(fake.fetchImpl));
  assert.equal(res.feed.status, 'ok');
  assert.deepEqual(res.feed.cards[0].items, []);
});

test('odd store shapes (arrays, numbers, nulls) never throw; the parts that need them are left out', async () => {
  for (const [file, value] of [['gi/avatars.json', []], ['gi/locs.json', { ko: 5, en: null }], ['gi/pfps.json', { 1901: null }], ['gi/namecards.json', { 210001: { Icon: 7 } }]]) {
    const store = giStoreFiles();
    store[file] = value;
    const res = await fetchGenshin(GI_ENV, deps(giFake({ store }).fetchImpl));
    assert.equal(res.feed.status, 'ok', file);
    assert.equal(res.feed.cards.length, 2, file);
  }
  const profile = fixture('enka-genshin');
  profile.playerInfo.showAvatarInfoList = [null, 5, { avatarId: {} }, { avatarId: 10000901, level: 'x' }];
  const card = shapeGenshin(profile, GI_STORE(), 'ko');
  assert.deepEqual(card.items.map((i) => keys(i)), [['name']]);
});

// ——— Steam (spec §6.5) ———

const STEAM_ID = '76561197960435530';
/** A Steam-key-shaped fake (32 hex), built at run time so no key-like literal is committed (gitleaks). */
const FAKE_KEY = ['0123456789', 'abcdef', '0123456789', 'ABCDEF'].join('');
const STEAM_ENV = { ACCOUNT_STEAM_ID64: STEAM_ID, ACCOUNT_STEAM_NAME: ' synthsteamer ', STEAM_API_KEY: FAKE_KEY };
const SUMMARIES_URL = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?steamids=${STEAM_ID}`;
const XML_URL = `https://steamcommunity.com/profiles/${STEAM_ID}/?xml=1`;
const LEVEL_URL = `https://api.steampowered.com/IPlayerService/GetSteamLevel/v1/?steamid=${STEAM_ID}`;
const GAMES_URL = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?steamid=${STEAM_ID}&include_appinfo=1&include_played_free_games=1`;
const AVATAR_URL = 'https://avatars.fastly.steamstatic.com/0000000000000000000000000000000000000abc_full.jpg';
const ICON_URL = (appid, hash) => `https://media.steampowered.com/steamcommunity/public/images/apps/${appid}/${hash}.jpg`;
const GAMES_ON = { showGames: true, filter: { mode: 'exclude', appIds: [] } };

/** A Steam fixture without its `_note`; the XML ones keep their note as a comment. */
function steamFixture(name) {
  const text = readFileSync(new URL(`./fixtures/accounts/${name}`, import.meta.url), 'utf8');
  if (name.endsWith('.xml')) {
    assert.match(text, /<!-- synthetic fixture from spec §6\.5/, `${name} is marked synthetic`);
    return text;
  }
  const data = JSON.parse(text);
  assert.match(String(data._note), /^synthetic fixture from spec §6\.5/, `${name} is marked synthetic`);
  delete data._note;
  return data;
}

/** A recording fake for the Steam hosts. Unknown URLs answer 599 (a test failure shows up as a missing part). */
function steamFake({ summaries = steamFixture('steam-summaries.json'), xml = steamFixture('steam-profile-public.xml'), level = steamFixture('steam-level.json'), games = steamFixture('steam-owned-games.json'), override } = {}) {
  /** @type {{ url: string; headers: Headers; init: RequestInit }[]} */
  const calls = [];
  /** @type {typeof fetch} */
  const fetchImpl = async (input, init = {}) => {
    const url = String(input);
    calls.push({ url, headers: new Headers(init.headers), init });
    const forced = override?.(url);
    if (forced) return forced;
    if (url === SUMMARIES_URL) return jsonRes(summaries);
    if (url === XML_URL) return new Response(xml, { status: 200, headers: { 'content-type': 'text/xml; charset=utf-8' } });
    if (url === LEVEL_URL) return jsonRes(level);
    if (url === GAMES_URL) return jsonRes(games);
    if (url.startsWith('https://avatars.fastly.steamstatic.com/') || url.startsWith('https://media.steampowered.com/')) {
      return new Response(JPG, { status: 200, headers: { 'content-type': 'image/jpeg' } });
    }
    return new Response('unexpected', { status: 599 });
  };
  return { calls, fetchImpl };
}
const keyedCalls = (calls) => calls.filter((c) => c.headers.has('x-webapi-key'));

test('Steam ok path (games off, the committed default): exact feed, card and metric key sets; level only; link; avatar', async () => {
  assert.equal(STEAM_SHOW_GAMES, false, 'the committed switch ships off (OQ-15, AL-24 turns it on)');
  const { calls, fetchImpl } = steamFake();
  const res = await fetchSteam(STEAM_ENV, deps(fetchImpl));
  assert.equal(res.platform, 'steam');
  assert.equal(res.state, 'written');
  const { feed } = res;
  assert.deepEqual(keys(feed), ['attribution', 'cards', 'fetchedAt', 'maxAgeDays', 'platform', 'schemaVersion', 'status']);
  assert.equal(feed.schemaVersion, 1);
  assert.equal(feed.platform, 'steam');
  assert.equal(feed.status, 'ok');
  assert.equal(feed.fetchedAt, NOW.toISOString());
  assert.equal(feed.maxAgeDays, 7);
  assert.equal(feed.attribution, 'Steam Web API');
  assert.deepEqual(feed.cards.map((c) => c.lang), ['ko', 'en']);
  const [ko, en] = feed.cards;
  assert.deepEqual({ ...ko, lang: 'x' }, { ...en, lang: 'x' }, 'Steam text is not localised: both cards carry the same content');
  assert.deepEqual(keys(ko), ['image', 'items', 'lang', 'link', 'metrics', 'stats', 'title']);
  assert.equal(ko.title, 'SynthSteamer');
  assert.deepEqual(ko.stats, []);
  assert.deepEqual(ko.metrics, [{ key: 'steamLevel', value: 42 }]);
  assert.deepEqual(ko.items, []);
  assert.deepEqual(ko.link, { kind: 'steam', href: `https://steamcommunity.com/profiles/${STEAM_ID}` });
  assert.match(ko.image, /^[0-9a-f]{12}\.jpg$/);
  assert.deepEqual(res.images.map((i) => i.name), [ko.image]);

  // Calls in the spec's order; no GetOwnedGames while the switch is off.
  assert.deepEqual(calls.map((c) => c.url), [SUMMARIES_URL, XML_URL, LEVEL_URL, AVATAR_URL]);
  assert.equal(calls.some((c) => c.url.includes('GetOwnedGames')), false);
  for (const c of calls) assert.equal(c.headers.get('user-agent'), USER_AGENT);
});

test('Steam: the key travels only in x-webapi-key on api.steampowered.com, never as key=, with redirect: error', async () => {
  const { calls, fetchImpl } = steamFake();
  await fetchSteam(STEAM_ENV, deps(fetchImpl, { config: GAMES_ON }));
  assert.equal(calls.length, 8, 'summaries, xml, level, games, the avatar and three icons, nothing else');
  for (const c of calls) {
    assert.equal(/[?&]key=/i.test(c.url), false, c.url);
    assert.equal(c.url.includes(FAKE_KEY), false, c.url);
    const host = new URL(c.url).hostname;
    if (host === 'api.steampowered.com') {
      assert.equal(c.headers.get('x-webapi-key'), FAKE_KEY);
      assert.equal(c.init.redirect, 'error');
    } else {
      assert.equal(c.headers.has('x-webapi-key'), false, `${host} gets no key`);
      assert.notEqual(c.init.redirect, 'error');
    }
  }
  assert.deepEqual(keyedCalls(calls).map((c) => c.url), [SUMMARIES_URL, LEVEL_URL, GAMES_URL]);
});

test('Steam games on (injected): ownedGames, playtimeTotal and playtime2w in hours; top 3 by playtime_forever with icons', async () => {
  const { calls, fetchImpl } = steamFake();
  const res = await fetchSteam(STEAM_ENV, deps(fetchImpl, { config: GAMES_ON }));
  const [ko] = res.feed.cards;
  assert.deepEqual(ko.metrics, [
    { key: 'steamLevel', value: 42 },
    { key: 'ownedGames', value: 5 },
    { key: 'playtimeTotal', value: 321, unit: 'hours' },
    { key: 'playtime2w', value: 3, unit: 'hours' },
  ]);
  assert.equal(STEAM_TOP_GAMES, 3);
  assert.deepEqual(ko.items.map((i) => [i.name, i.meta]), [['Synthetic Game B', '150 H'], ['Synthetic Game A', '100 H'], ['Synthetic Game C', '50 H']]);
  for (const item of ko.items) assertItemShape(item);
  for (const item of ko.items) assert.match(item.image, /^[0-9a-f]{12}\.jpg$/);
  const icons = calls.filter((c) => c.url.startsWith('https://media.steampowered.com/')).map((c) => c.url).sort();
  assert.deepEqual(icons, [ICON_URL(9000001, 'a1'.repeat(20)), ICON_URL(9000002, 'b2'.repeat(20)), ICON_URL(9000003, 'c3'.repeat(20))]);
  assert.equal(res.images.length, 4);
});

test('Steam game filter: a filtered appid appears in no item, icon or name; totals are Steam full values', async () => {
  for (const [filter, expectNames, hidden] of [
    [{ mode: 'exclude', appIds: [9000002] }, ['Synthetic Game A', 'Synthetic Game C', 'Synthetic Game D'], ['Synthetic Game B', '9000002', 'b2b2']],
    [{ mode: 'allow', appIds: [9000004, 9000005] }, ['Synthetic Game D', 'Synthetic Game E'], ['Synthetic Game A', 'Synthetic Game B', 'Synthetic Game C', '9000001', '9000002', '9000003']],
  ]) {
    const { calls, fetchImpl } = steamFake();
    const res = await fetchSteam(STEAM_ENV, deps(fetchImpl, { config: { showGames: true, filter } }));
    const [ko] = res.feed.cards;
    assert.deepEqual(ko.items.map((i) => i.name), expectNames, filter.mode);
    assert.deepEqual(ko.metrics.slice(1), [
      { key: 'ownedGames', value: 5 },
      { key: 'playtimeTotal', value: 321, unit: 'hours' },
      { key: 'playtime2w', value: 3, unit: 'hours' },
    ]);
    const text = JSON.stringify(res.feed);
    const iconCalls = calls.filter((c) => c.url.startsWith('https://media.steampowered.com/')).map((c) => c.url).join(' ');
    for (const h of hidden) {
      assert.equal(text.includes(h), false, `${filter.mode}: ${h} in the feed`);
      assert.equal(iconCalls.includes(h), false, `${filter.mode}: ${h} icon requested`);
    }
  }
});

test('Steam games off → no GetOwnedGames request and no game metric or item; the default config is account-config.ts', async () => {
  for (const config of [undefined, { showGames: STEAM_SHOW_GAMES, filter: STEAM_GAME_FILTER }, { showGames: false, filter: { mode: 'allow', appIds: [9000001] } }]) {
    const { calls, fetchImpl } = steamFake();
    const res = await fetchSteam(STEAM_ENV, deps(fetchImpl, config ? { config } : {}));
    assert.equal(calls.some((c) => c.url.includes('GetOwnedGames')), false);
    assert.deepEqual(res.feed.cards[0].metrics.map((m) => m.key), ['steamLevel']);
    assert.deepEqual(res.feed.cards[0].items, []);
  }
  // The pure shaper, both ways.
  const summary = steamFixture('steam-summaries.json').response.players[0];
  const games = steamFixture('steam-owned-games.json').response;
  const off = shapeSteam(summary, 42, games, 'ko', undefined, { showGames: false, filter: STEAM_GAME_FILTER });
  assert.deepEqual(off.metrics, [{ key: 'steamLevel', value: 42 }]);
  assert.deepEqual(off.items, []);
  const on = shapeSteam(summary, 42, games, 'en', undefined, GAMES_ON);
  assert.equal(on.lang, 'en');
  assert.deepEqual(on.metrics.map((m) => m.key), ['steamLevel', 'ownedGames', 'playtimeTotal', 'playtime2w']);
  assert.equal(on.items.length, 3);
  assert.equal('image' in on, false, 'no image name given → no avatar');
});

test('Steam: only the allow-listed fields are kept (no realname, country, dates, state, current game)', async () => {
  const { fetchImpl } = steamFake();
  const res = await fetchSteam(STEAM_ENV, deps(fetchImpl, { config: GAMES_ON }));
  const text = JSON.stringify(res.feed);
  for (const word of ['realname', 'loccountrycode', 'timecreated', 'lastlogoff', 'personastate', 'gameextrainfo', 'gameid', 'Synthetic Realname', 'ZZ', '1000000000', '1700000000', 'Synthetic Game In Progress', 'profilestate', 'communityvisibilitystate', 'avatarfull', 'steamid', 'img_icon_url', 'playtime_forever', 'appid']) {
    assert.equal(text.includes(word), false, word);
  }
  for (const card of res.feed.cards) {
    assert.deepEqual(keys(card), ['image', 'items', 'lang', 'link', 'metrics', 'stats', 'title']);
    for (const m of card.metrics) for (const k of Object.keys(m)) assert.ok(['key', 'value', 'unit'].includes(k), `metric key ${k}`);
  }
});

test('Steam: communityvisibilitystate 1 → not-public; XML privacyState private → not-public; nothing stored', async () => {
  const summaries = steamFixture('steam-summaries.json');
  summaries.response.players[0].communityvisibilitystate = 1;
  let fake = steamFake({ summaries });
  let res = await fetchSteam(STEAM_ENV, deps(fake.fetchImpl));
  assert.deepEqual(res.feed, { schemaVersion: 1, platform: 'steam', status: 'error', fetchedAt: NOW.toISOString(), maxAgeDays: 7, attribution: 'Steam Web API', reason: 'not-public', cards: [] });
  assert.deepEqual(res.images, []);
  assert.deepEqual(fake.calls.map((c) => c.url), [SUMMARIES_URL]);

  fake = steamFake({ xml: steamFixture('steam-profile-private.xml') });
  res = await fetchSteam(STEAM_ENV, deps(fake.fetchImpl));
  assert.equal(res.feed.status, 'error');
  assert.equal(res.feed.reason, 'not-public');
  assert.deepEqual(res.feed.cards, []);
  assert.deepEqual(res.images, []);
  assert.deepEqual(fake.calls.map((c) => c.url), [SUMMARIES_URL, XML_URL], 'no level, games or image request after a private XML');

  // An XML without a privacyState element (or another profile's XML) never passes as public.
  for (const xml of ['<profile><steamID64>76561197960435530</steamID64></profile>', '<profile><steamID64>76561197960435531</steamID64><privacyState>public</privacyState></profile>', 'not xml at all']) {
    const f = steamFake({ xml });
    const r = await fetchSteam(STEAM_ENV, deps(f.fetchImpl));
    assert.equal(r.feed.status, 'error', xml);
    assert.ok(['not-public', 'bad-response'].includes(r.feed.reason), xml);
  }
});

test('Steam: name mismatch → name-mismatch, no cards, zero images, nothing after the summaries request', async () => {
  const fake = steamFake();
  const res = await fetchSteam({ ...STEAM_ENV, ACCOUNT_STEAM_NAME: 'SomeoneElse' }, deps(fake.fetchImpl, { config: GAMES_ON }));
  assert.deepEqual(res.feed, { schemaVersion: 1, platform: 'steam', status: 'error', fetchedAt: NOW.toISOString(), maxAgeDays: 7, attribution: 'Steam Web API', reason: 'name-mismatch', cards: [] });
  assert.deepEqual(res.images, []);
  assert.equal(fake.calls.length, 1);
});

test('Steam: key missing → no-key without authFailed; no ID → skipped; bad ID → invalid-id; no name → no-name; zero requests', async () => {
  const fake = steamFake();
  for (const key of [undefined, '', '   ']) {
    const res = await fetchSteam({ ...STEAM_ENV, STEAM_API_KEY: key }, deps(fake.fetchImpl));
    assert.equal(res.feed.status, 'error');
    assert.equal(res.feed.reason, 'no-key');
    assert.equal('authFailed' in res.feed, false);
    assert.deepEqual(res.feed.cards, []);
  }
  for (const env of [{}, { ACCOUNT_STEAM_ID64: '' }, { ACCOUNT_STEAM_ID64: '  ', ACCOUNT_STEAM_NAME: 'x', STEAM_API_KEY: FAKE_KEY }]) {
    assert.deepEqual(await fetchSteam(env, deps(fake.fetchImpl)), { platform: 'steam', state: 'skipped' });
  }
  for (const bad of ['76561197960265728', 'https://steamcommunity.com/id/robinwalker', '7656119796043553', 'abc']) {
    const res = await fetchSteam({ ...STEAM_ENV, ACCOUNT_STEAM_ID64: bad }, deps(fake.fetchImpl));
    assert.equal(res.feed.reason, 'invalid-id', bad);
  }
  for (const name of [undefined, '', '  ']) {
    const res = await fetchSteam({ ...STEAM_ENV, ACCOUNT_STEAM_NAME: name }, deps(fake.fetchImpl));
    assert.equal(res.feed.reason, 'no-name');
  }
  assert.equal(fake.calls.length, 0);
  // A profile URL is accepted as the canonical ID (parseSteamId64).
  const url = steamFake();
  const ok = await fetchSteam({ ...STEAM_ENV, ACCOUNT_STEAM_ID64: `https://steamcommunity.com/profiles/${STEAM_ID}/` }, deps(url.fetchImpl));
  assert.equal(ok.feed.status, 'ok');
  assert.equal(url.calls[0].url, SUMMARIES_URL);
});

test('Steam: 401/403 → auth + authFailed; other statuses map like Enka; authFailed only for auth', async () => {
  for (const [status, reason] of [[401, 'auth'], [403, 'auth'], [400, 'http-400'], [404, 'http-404'], [429, 'http-429'], [500, 'http-5xx'], [503, 'http-5xx']]) {
    const fake = steamFake({ override: (u) => (u === SUMMARIES_URL ? jsonRes({}, status) : null) });
    const res = await fetchSteam(STEAM_ENV, deps(fake.fetchImpl));
    assert.equal(res.feed.status, 'error', String(status));
    assert.equal(res.feed.reason, reason, String(status));
    assert.equal(res.feed.authFailed === true, reason === 'auth', String(status));
    if (reason === 'auth') assert.deepEqual(keys(res.feed), ['attribution', 'authFailed', 'cards', 'fetchedAt', 'maxAgeDays', 'platform', 'reason', 'schemaVersion', 'status']);
    assert.equal(fake.calls.length, 1);
  }
  // A key rejected on a later keyed call is still an auth failure.
  const late = steamFake({ override: (u) => (u === LEVEL_URL ? jsonRes({}, 403) : null) });
  const res = await fetchSteam(STEAM_ENV, deps(late.fetchImpl));
  assert.equal(res.feed.reason, 'auth');
  assert.equal(res.feed.authFailed, true);
  const timeout = steamFake({ override: () => { throw new DOMException('timeout', 'TimeoutError'); } });
  const t = await fetchSteam(STEAM_ENV, deps(timeout.fetchImpl));
  assert.equal(t.feed.reason, 'timeout');
  assert.equal('authFailed' in t.feed, false);
  for (const body of ['nope', '{}', '{"response":{"players":[{"steamid":"76561197960435531","communityvisibilitystate":3,"personaname":"SynthSteamer"}]}}', '{"response":{"players":[{"steamid":"76561197960435530","communityvisibilitystate":3}]}}']) {
    const f = steamFake({ override: (u) => (u === SUMMARIES_URL ? jsonRes(body) : null) });
    const r = await fetchSteam(STEAM_ENV, deps(f.fetchImpl));
    assert.equal(r.feed.reason, 'bad-response', body);
  }
  // Steam answers an unknown account with an empty list: reported like a missing account.
  const empty = steamFake({ summaries: { response: { players: [] } } });
  assert.equal((await fetchSteam(STEAM_ENV, deps(empty.fetchImpl))).feed.reason, 'http-404');
});

test('Steam: a 30x from api.steampowered.com is an error after exactly one keyed request (never followed)', async () => {
  for (const redirect of [
    () => new Response(null, { status: 302, headers: { location: 'https://evil.example/collect' } }),
    () => new Response(null, { status: 301, headers: { location: 'https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/' } }),
    () => { throw new TypeError('fetch failed', { cause: new Error('unexpected redirect') }); },
  ]) {
    const fake = steamFake({ override: (u) => (u === SUMMARIES_URL ? redirect() : null) });
    const res = await fetchSteam(STEAM_ENV, deps(fake.fetchImpl));
    assert.equal(res.feed.status, 'error');
    assert.equal(res.feed.reason, 'bad-response');
    assert.equal('authFailed' in res.feed, false);
    assert.equal(keyedCalls(fake.calls).length, 1);
    assert.equal(fake.calls.length, 1);
    assert.equal(fake.calls[0].init.redirect, 'error');
  }
});

test('Steam: player_level absent (field name unconfirmed) → no steamLevel metric, status still ok; a failed level call is left out too', async () => {
  for (const override of [(u) => (u === LEVEL_URL ? jsonRes({ response: {} }) : null), (u) => (u === LEVEL_URL ? jsonRes({}, 500) : null)]) {
    const fake = steamFake({ override });
    const res = await fetchSteam(STEAM_ENV, deps(fake.fetchImpl));
    assert.equal(res.feed.status, 'ok');
    assert.deepEqual(res.feed.cards[0].metrics, []);
    assert.equal(res.feed.cards[0].title, 'SynthSteamer');
  }
});

test('Steam: a failed avatar or icon drops only that picture; a non-Steam avatar host is never requested', async () => {
  const fake = steamFake({ override: (u) => (u === AVATAR_URL ? new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } }) : null) });
  const res = await fetchSteam(STEAM_ENV, deps(fake.fetchImpl, { config: GAMES_ON }));
  assert.equal(res.feed.status, 'ok');
  assert.equal('image' in res.feed.cards[0], false);
  assert.equal(res.feed.cards[0].items.length, 3);
  const summaries = steamFixture('steam-summaries.json');
  summaries.response.players[0].avatarfull = 'https://evil.example/a.jpg';
  const other = steamFake({ summaries });
  const r2 = await fetchSteam(STEAM_ENV, deps(other.fetchImpl));
  assert.equal(r2.feed.status, 'ok');
  assert.equal(other.calls.some((c) => c.url.includes('evil.example')), false);
  assert.equal('image' in r2.feed.cards[0], false);
});

// ——— Riot links (spec §6.6; OWNER 2026-10-01 OQ-2: LoL and TFT are separate tiles, each link checked on its own) ———

const RIOT_ID = 'Hide on bush#KR1';
const LOL_URL = 'https://op.gg/lol/summoners/kr/Hide%20on%20bush-KR1';
const TFT_URL = 'https://lolchess.gg/profile/kr/Hide%20on%20bush-KR1';
const html = (status = 200, headers = {}) => new Response(status >= 300 && status < 400 ? null : '<html></html>', { status, headers: { 'content-type': 'text/html', ...headers } });
function riotFake({ lol = () => html(), tft = () => html() } = {}) {
  const calls = [];
  /** @type {typeof fetch} */
  const fetchImpl = async (input, init = {}) => {
    const url = String(input);
    calls.push({ url, headers: new Headers(init.headers), init });
    if (url === LOL_URL) return lol();
    if (url === TFT_URL) return tft();
    return new Response('unexpected', { status: 599 });
  };
  return { calls, fetchImpl };
}

test('Riot: a valid ID → both links (exact RiotLinks shape); one GET to each site, no credentials', async () => {
  const fake = riotFake();
  const res = await fetchRiotLinks({ ACCOUNT_RIOT_ID: RIOT_ID }, deps(fake.fetchImpl));
  assert.deepEqual(res, { platform: 'riot', state: 'written', links: { schemaVersion: 1, platform: 'riot', status: 'ok', fetchedAt: NOW.toISOString(), riotId: RIOT_ID, links: { lol: LOL_URL, tft: TFT_URL } } });
  assert.deepEqual(fake.calls.map((c) => c.url), [LOL_URL, TFT_URL]);
  for (const c of fake.calls) {
    assert.equal(c.headers.get('user-agent'), USER_AGENT);
    assert.equal(c.headers.has('x-webapi-key'), false);
    assert.equal(c.headers.has('authorization'), false);
  }
  assert.equal(fake.calls[1].init.redirect, 'manual', 'lolchess is not followed');
  // NFD input is stored NFC, like the links.
  const nfd = await fetchRiotLinks({ ACCOUNT_RIOT_ID: '프로게이머에요#KR1'.normalize('NFD') }, deps(riotFake({ lol: () => html(), tft: () => html() }).fetchImpl));
  assert.equal(nfd.state, 'written');
  assert.equal(nfd.links.riotId, '프로게이머에요#KR1');
});

test('Riot: op.gg 404 → no lol, tft kept; lolchess Location /search? → no tft, lol kept (each link on its own)', async () => {
  let res = await fetchRiotLinks({ ACCOUNT_RIOT_ID: RIOT_ID }, deps(riotFake({ lol: () => html(404) }).fetchImpl));
  assert.deepEqual(res.links.links, { tft: TFT_URL });
  assert.deepEqual(keys(res.links.links), ['tft']);
  res = await fetchRiotLinks({ ACCOUNT_RIOT_ID: RIOT_ID }, deps(riotFake({ tft: () => html(302, { location: '/search?region=kr&name=x' }) }).fetchImpl));
  assert.deepEqual(res.links.links, { lol: LOL_URL });
  res = await fetchRiotLinks({ ACCOUNT_RIOT_ID: RIOT_ID }, deps(riotFake({ tft: () => html(302, { location: 'https://lolchess.gg/search?name=x' }) }).fetchImpl));
  assert.deepEqual(res.links.links, { lol: LOL_URL });
  // A lolchess redirect elsewhere (not a search) keeps the link; it is not followed.
  const other = riotFake({ tft: () => html(301, { location: 'https://lolchess.gg/profile/kr/Hide%20on%20bush-KR1/set' }) });
  res = await fetchRiotLinks({ ACCOUNT_RIOT_ID: RIOT_ID }, deps(other.fetchImpl));
  assert.deepEqual(res.links.links, { lol: LOL_URL, tft: TFT_URL });
  assert.equal(other.calls.length, 2);
});

test('Riot: 403, 5xx, network error, timeout and odd content keep the links (CI IPs may be blocked)', async () => {
  const throwTimeout = () => { throw new DOMException('timeout', 'TimeoutError'); };
  const throwNet = () => { throw new TypeError('fetch failed'); };
  for (const answer of [() => html(403), () => html(500), () => html(503), throwNet, throwTimeout, () => new Response('x', { status: 200, headers: { 'content-type': 'image/gif' } }), () => html(400)]) {
    const res = await fetchRiotLinks({ ACCOUNT_RIOT_ID: RIOT_ID }, deps(riotFake({ lol: answer, tft: answer }).fetchImpl));
    assert.equal(res.state, 'written');
    assert.deepEqual(res.links.links, { lol: LOL_URL, tft: TFT_URL });
  }
});

test('Riot: both links dropped → no file; no ID → skipped; invalid ID → no file and zero requests', async () => {
  const both = await fetchRiotLinks({ ACCOUNT_RIOT_ID: RIOT_ID }, deps(riotFake({ lol: () => html(404), tft: () => html(302, { location: '/search?q=1' }) }).fetchImpl));
  assert.equal(both.state, 'skipped');
  assert.equal('links' in both, false);
  const fake = riotFake();
  for (const env of [{}, { ACCOUNT_RIOT_ID: '' }, { ACCOUNT_RIOT_ID: '   ' }]) assert.deepEqual(await fetchRiotLinks(env, deps(fake.fetchImpl)), { platform: 'riot', state: 'skipped' });
  for (const bad of ['Hide on bush', 'Hide on bush#', '#KR1', 'ab#KR1', 'Hide/on#KR1', 'Hide%on#KR1', 'Hide‮on#KR1', 'Hide on bush#K', 'a'.repeat(70)]) {
    const res = await fetchRiotLinks({ ACCOUNT_RIOT_ID: bad }, deps(fake.fetchImpl));
    assert.equal(res.state, 'skipped', bad);
    assert.equal(res.reason, 'invalid-id', bad);
    assert.equal('links' in res, false);
  }
  assert.equal(fake.calls.length, 0);
});

// ——— the entry script (spec §5.1, §5.3, §5.4, R-10) ———

const ENTRY = fileURLToPath(new URL('../../scripts/fetch-accounts.mjs', import.meta.url));
const ALL_ENV = { ...GI_ENV, ...ZZZ_ENV, ...STEAM_ENV, ACCOUNT_RIOT_ID: RIOT_ID };
/** Every value the env holds, as the owner typed it and trimmed: none may reach the console or the summary. */
const ENV_VALUES = [...new Set(Object.values(ALL_ENV).flatMap((v) => [v, v.trim()]))];

/** One fetch for all four platforms, routed by URL to the per-platform fakes above. */
function allFake(overrides = {}) {
  const gi = giFake(overrides.gi);
  const zzz = zzzFake(overrides.zzz);
  const steam = steamFake(overrides.steam);
  const riot = riotFake(overrides.riot);
  const calls = [];
  /** @type {typeof fetch} */
  const fetchImpl = (input, init) => {
    const url = String(input);
    calls.push(url);
    const host = new URL(url).hostname;
    if (host === 'op.gg' || host === 'lolchess.gg') return riot.fetchImpl(input, init);
    if (/steam/.test(host)) return steam.fetchImpl(input, init);
    if (/\/(api\/zzz|store\/zzz|ui\/zzz)\//.test(url)) return zzz.fetchImpl(input, init);
    return gi.fetchImpl(input, init);
  };
  return { calls, fetchImpl, steam };
}

async function captureConsole(fn) {
  const lines = [];
  const saved = { log: console.log, error: console.error, warn: console.warn, info: console.info };
  for (const k of Object.keys(saved)) console[k] = (...args) => lines.push(args.map(String).join(' '));
  try {
    return { value: await fn(), lines };
  } finally {
    Object.assign(console, saved);
  }
}

async function listFiles(dir) {
  try {
    return (await readdir(dir, { recursive: true, withFileTypes: true })).filter((e) => e.isFile()).map((e) => join(e.parentPath ?? e.path, e.name));
  } catch {
    return [];
  }
}

test('entry: all variables empty → zero requests, no files, four skipped log lines', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'af-empty-'));
  try {
    const { calls, fetchImpl } = allFake();
    const summaryFile = join(dir, 'summary.md');
    const { lines } = await captureConsole(() => runFetchAccounts({ env: {}, fetchImpl, now: () => NOW, outDir: join(dir, 'out'), summaryFile }));
    assert.equal(calls.length, 0);
    assert.deepEqual(lines, ['accounts: enka-genshin skipped', 'accounts: enka-zzz skipped', 'accounts: steam skipped', 'accounts: riot skipped']);
    assert.deepEqual(await listFiles(join(dir, 'out')), []);
    const summary = await readFile(summaryFile, 'utf8');
    assert.match(summary, /^### Account fetch$/m);
    assert.equal((summary.match(/\| skipped \|/g) ?? []).length, 4);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('entry as a process: no variables → exit code 0, only the four log lines, nothing written; the summary is appended', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'af-proc-'));
  try {
    const summaryFile = join(dir, 'summary.md');
    await writeFile(summaryFile, 'earlier step\n');
    const out = join(dir, 'af');
    const run = spawnSync(process.execPath, [ENTRY, '--out', out], { env: { PATH: process.env.PATH ?? '', GITHUB_STEP_SUMMARY: summaryFile }, encoding: 'utf8', timeout: 30_000 });
    assert.equal(run.status, 0, run.stderr);
    assert.deepEqual(run.stdout.trim().split('\n'), ['accounts: enka-genshin skipped', 'accounts: enka-zzz skipped', 'accounts: steam skipped', 'accounts: riot skipped']);
    assert.deepEqual(await listFiles(out), []);
    const summary = await readFile(summaryFile, 'utf8');
    assert.ok(summary.startsWith('earlier step\n'), 'appended, not replaced');
    assert.match(summary, /### Account fetch/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('entry with fixtures: files at the fixed paths; images before feeds; no env value or key in the console or summary', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'af-full-'));
  try {
    const { calls, fetchImpl } = allFake();
    const out = join(dir, 'out');
    const summaryFile = join(dir, 'summary.md');
    const { value: results, lines } = await captureConsole(() => runFetchAccounts({ env: ALL_ENV, fetchImpl, now: () => NOW, outDir: out, summaryFile }));
    assert.deepEqual(results.map((r) => r.platform), ['enka-genshin', 'enka-zzz', 'steam', 'riot']);
    assert.deepEqual(lines, ['accounts: enka-genshin ok', 'accounts: enka-zzz ok', 'accounts: steam ok', 'accounts: riot ok']);

    const files = (await listFiles(out)).map((f) => f.slice(out.length + 1).split('\\').join('/')).sort();
    const feeds = ['accounts/enka-genshin.json', 'accounts/enka-zzz.json', 'accounts/steam.json', 'links/riot.json'];
    const images = files.filter((f) => f.startsWith('accounts/img/'));
    assert.deepEqual(files.filter((f) => !f.startsWith('accounts/img/')), feeds.sort());
    assert.ok(images.length >= 8);
    for (const f of images) assert.match(f, /^accounts\/img\/[0-9a-f]{12}\.(png|jpg|webp)$/);
    const imgTimes = await Promise.all(images.map(async (f) => (await stat(join(out, f))).mtimeMs));
    const feedTimes = await Promise.all(feeds.map(async (f) => (await stat(join(out, f))).mtimeMs));
    assert.ok(Math.max(...imgTimes) <= Math.min(...feedTimes), 'every image is written before any feed JSON');
    assert.equal(files.some((f) => /\.tmp$/.test(f) || f.split('/').pop().startsWith('.')), false, 'no temp file left');

    const steam = JSON.parse(await readFile(join(out, 'accounts/steam.json'), 'utf8'));
    assert.equal(steam.status, 'ok');
    const riot = JSON.parse(await readFile(join(out, 'links/riot.json'), 'utf8'));
    assert.deepEqual(riot.links, { lol: LOL_URL, tft: TFT_URL });
    // Every card image named in a feed was written.
    for (const f of feeds.slice(0, 3)) {
      const feed = JSON.parse(await readFile(join(out, f), 'utf8'));
      for (const card of feed.cards) for (const n of [card.image, card.banner, ...card.items.map((i) => i.image)].filter(Boolean)) assert.ok(images.includes(`accounts/img/${n}`), `${f}: ${n}`);
    }

    // The key: in no request URL, no written file, no log line, not in the summary.
    for (const url of calls) assert.equal(url.includes(FAKE_KEY), false);
    for (const f of files) assert.equal((await readFile(join(out, f))).includes(Buffer.from(FAKE_KEY)), false, f);
    const summary = await readFile(summaryFile, 'utf8');
    const printed = [...lines, summary].join('\n');
    for (const v of [...ENV_VALUES, FAKE_KEY, FAKE_KEY.toLowerCase(), 'Hide%20on%20bush', 'SynthWanderer', 'SynthSteamer', 'SynthProxy']) {
      assert.equal(printed.toLowerCase().includes(v.toLowerCase()), false, `printed: ${v}`);
    }
    assert.equal(summaryMarkdown(results), summary.trimEnd() + '\n');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('entry: error feeds are still written (authFailed reaches check-fetch-status); log lines name only the reason', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'af-err-'));
  try {
    const { fetchImpl } = allFake({ steam: { override: (u) => (u === SUMMARIES_URL ? jsonRes({}, 403) : null) }, gi: { profile: { playerInfo: { nickname: 'SomeoneElse' } } } });
    const env = { ...ALL_ENV, ACCOUNT_ZZZ_UID: 'bad', ACCOUNT_RIOT_ID: 'bad' };
    const { lines } = await captureConsole(() => runFetchAccounts({ env, fetchImpl, now: () => NOW, outDir: dir, summaryFile: undefined }));
    assert.deepEqual(lines, ['accounts: enka-genshin error:name-mismatch', 'accounts: enka-zzz error:invalid-id', 'accounts: steam error:auth', 'accounts: riot error:invalid-id']);
    const steam = JSON.parse(await readFile(join(dir, 'accounts/steam.json'), 'utf8'));
    assert.equal(steam.authFailed, true);
    assert.deepEqual(steam.cards, []);
    assert.equal((await listFiles(join(dir, 'links'))).length, 0, 'no riot file for an invalid ID');
    assert.equal((await listFiles(join(dir, 'accounts/img'))).length, 0, 'no image from any failed platform');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('fetchAccounts: the four platforms in a fixed order; a thrown fetch never escapes', async () => {
  const boom = async () => {
    throw new Error('boom');
  };
  const results = await fetchAccounts(ALL_ENV, boom, () => NOW);
  assert.deepEqual(results.map((r) => r.platform), ['enka-genshin', 'enka-zzz', 'steam', 'riot']);
  for (const r of results.slice(0, 3)) assert.equal(r.feed.status, 'error', r.platform);
  assert.equal(results[3].state, 'written', 'network errors keep the Riot links');
  const empty = await fetchAccounts({}, boom);
  assert.deepEqual(empty.map((r) => r.state), ['skipped', 'skipped', 'skipped', 'skipped']);
});

test('writeAccounts: fixed file names only; an image name that is not <12 hex>.<png|jpg|webp> is never written', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'af-write-'));
  try {
    const feed = { schemaVersion: 1, platform: 'steam', status: 'ok', fetchedAt: NOW.toISOString(), maxAgeDays: 7, attribution: 'Steam Web API', cards: [] };
    await writeAccounts(dir, [
      { platform: 'steam', state: 'written', feed, images: [{ name: '../escape.png', bytes: PNG }, { name: 'abcdefabcdef.gif', bytes: PNG }, { name: 'abcdefabcdef.png', bytes: PNG }] },
      { platform: 'evil/../../x', state: 'written', feed: { ...feed, platform: 'evil' }, images: [] },
      { platform: 'riot', state: 'skipped' },
    ]);
    const files = (await listFiles(dir)).map((f) => f.slice(dir.length + 1).split('\\').join('/')).sort();
    assert.deepEqual(files, ['accounts/img/abcdefabcdef.png', 'accounts/steam.json']);
    assert.equal(await readFile(join(dir, 'accounts/steam.json'), 'utf8'), `${JSON.stringify(feed, null, 2)}\n`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('summaryMarkdown: one row per platform; every reason with its ko and en sentence; no URL, value or body', () => {
  const reasons = Object.keys(REASON_TEXT);
  assert.equal(reasons.length, 13);
  const results = reasons.map((reason) => ({ platform: 'steam', state: 'written', feed: { schemaVersion: 1, platform: 'steam', status: 'error', fetchedAt: NOW.toISOString(), maxAgeDays: 7, attribution: 'Steam Web API', reason, cards: [] }, images: [] }));
  results.push({ platform: 'riot', state: 'skipped', reason: 'invalid-id' }, { platform: 'enka-zzz', state: 'skipped' });
  const md = summaryMarkdown(results);
  const lines = md.trimEnd().split('\n');
  assert.equal(lines[0], '### Account fetch');
  assert.equal(lines[1], '');
  assert.equal(lines[2], '| platform | status | reason | 조치 | Action |');
  assert.equal(lines[3], '|---|---|---|---|---|');
  assert.equal(lines.length, 4 + results.length);
  reasons.forEach((reason, i) => assert.equal(lines[4 + i], `| steam | error | ${reason} | ${REASON_TEXT[reason].ko} | ${REASON_TEXT[reason].en} |`));
  assert.equal(lines.at(-2), `| riot | error | invalid-id | ${REASON_TEXT['invalid-id'].ko} | ${REASON_TEXT['invalid-id'].en} |`);
  assert.equal(lines.at(-1), '| enka-zzz | skipped | - | - | - |');
  assert.equal(/https?:\/\/|www\.|op\.gg|lolchess|steamcommunity|steampowered|x-webapi-key/i.test(md), false);
  const ok = summaryMarkdown([{ platform: 'riot', state: 'written', links: { schemaVersion: 1, platform: 'riot', status: 'ok', fetchedAt: NOW.toISOString(), riotId: RIOT_ID, links: { lol: LOL_URL } } }]);
  assert.equal(ok.trimEnd().split('\n').at(-1), '| riot | ok | - | - | - |');
  assert.equal(ok.includes('Hide'), false);
});

// ——— helpers ———

/**
 * TRADEMARK_TERMS read from src/lib/seo.ts. seo.ts imports the site config (extensionless, not loadable by plain
 * Node), so the list is read as text; containsTrademark below repeats seo.ts's rule (URL separators as spaces, Latin
 * terms whole-word).
 */
function trademarkTerms() {
  const src = readFileSync(new URL('../../src/lib/seo.ts', import.meta.url), 'utf8');
  const block = /export const TRADEMARK_TERMS[^=]*=\s*\[([\s\S]*?)\];/.exec(src);
  assert.ok(block, 'TRADEMARK_TERMS found in seo.ts');
  return [...block[1].matchAll(/'([^']*)'/g)].map((m) => m[1]);
}
function containsTrademark(text, terms) {
  const haystack = text.toLowerCase().replace(/[-_./#]+/g, ' ');
  return terms.some((term) => {
    const needle = term.toLowerCase().replace(/[-_./#]+/g, ' ');
    if (!/^[\x20-\x7e]+$/.test(term)) return haystack.includes(needle);
    return new RegExp(`(^|[^a-z0-9])${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`).test(haystack);
  });
}
