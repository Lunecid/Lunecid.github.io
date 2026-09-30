// AL-5 (account-link spec §5.5, §6.1–6.4, R-7, R-13): the Enka.Network fetchers for the two HoYoverse showcases.
// Every fetch is injected (a recording fetchImpl returning Response objects); no test reaches the network. The
// fixtures under tests/ops/fixtures/accounts/ are synthetic (built from the spec's field lists, OQ-9); their `_note` key
// is stripped before use. The UIDs are the spec's public examples, never the owner's.
// AL-6 adds the Steam, Riot and entry parts to this file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fetchGenshin, shapeGenshin } from '../../scripts/accounts/enka-genshin.mjs';
import { fetchZzz, shapeZzz } from '../../scripts/accounts/enka-zzz.mjs';
import { cleanText, imagePathOk } from '../../scripts/accounts/enka-common.mjs';
import { USER_AGENT } from '../../scripts/accounts/safe-fetch.mjs';
import { REASON_TEXT } from '../../scripts/accounts/reasons.mjs';

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
    const needle = term.toLowerCase();
    if (!/^[\x20-\x7e]+$/.test(term)) return haystack.includes(needle);
    return new RegExp(`(^|[^a-z0-9])${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`).test(haystack);
  });
}
