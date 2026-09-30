// AL-4 (account-link spec §6.1, §5.3): the allow-listed fetch of the fetch-accounts job and the reason texts of its
// step summary. Every fetch is injected (fetchImpl returning Response objects); no test reaches the network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ALLOW, LIMITS, USER_AGENT, imageKind, safeFetch, writeAtomic } from '../../scripts/accounts/safe-fetch.mjs';
import { REASON_TEXT } from '../../scripts/accounts/reasons.mjs';

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const JPG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46]);
const WEBP = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 4, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50]);
const GIF = new TextEncoder().encode('GIF89a\u0001\u0000');
const HTML = new TextEncoder().encode('<!doctype html><title>x</title>');
const JSON_TYPE = { 'content-type': 'application/json; charset=utf-8' };
const ENKA = 'https://enka.network/api/uid/618285856?info';
const STORE = 'https://raw.githubusercontent.com/EnkaNetwork/API-docs/master/store/gi/avatars.json';
const STEAM_API = 'https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?steamids=76561197960435530';
// Built at run time (never a literal that looks like a key; spec §5.7.8).
const FAKE_KEY = 'k'.repeat(32);

/**
 * A recording fetch. `plan` is called with (url, init, index) and returns a Response (or throws).
 * @param {(url: string, init: RequestInit, i: number) => Response | Promise<Response>} plan
 */
function recorder(plan) {
  /** @type {{ url: string; init: RequestInit; headers: Headers }[]} */
  const calls = [];
  /** @type {typeof fetch} */
  const fetchImpl = async (input, init = {}) => {
    const url = String(input);
    calls.push({ url, init, headers: new Headers(init.headers) });
    return plan(url, init, calls.length - 1);
  };
  return { calls, fetchImpl };
}
const json = (body = '{"ok":1}', status = 200, headers = JSON_TYPE) => new Response(body, { status, headers });
const redirect = (location, status = 302) => new Response(null, { status, headers: { location } });
const budget = () => ({ used: 0 });

test('the allow list and limits are the spec §6.1 values (op.gg and lolchess.gg for the Q7 existence check)', () => {
  assert.equal(USER_AGENT, 'lunecid-portfolio/1.0 (+https://lunecid.github.io)');
  assert.deepEqual(ALLOW, {
    json: [
      { host: 'enka.network' },
      { host: 'raw.githubusercontent.com', path: '/EnkaNetwork/API-docs/master/store/' },
      { host: 'api.steampowered.com' },
      { host: 'steamcommunity.com' },
      { host: 'op.gg' },
      { host: 'lolchess.gg' },
    ],
    image: [
      { host: 'enka.network' },
      { host: 'avatars.fastly.steamstatic.com' },
      { host: 'avatars.steamstatic.com' },
      { host: 'media.steampowered.com' },
      { host: 'shared.akamai.steamstatic.com' },
    ],
  });
  assert.deepEqual(LIMITS, { json: 1_048_576, store: 41_943_040, image: 3_145_728, platform: 26_214_400 });
  assert.ok(Object.isFrozen(ALLOW) && Object.isFrozen(ALLOW.json) && Object.isFrozen(ALLOW.json[1]) && Object.isFrozen(LIMITS));
});

test('hosts, schemes, ports, credentials and paths outside the list → host, with zero requests', async () => {
  const { calls, fetchImpl } = recorder(() => json());
  const bad = [
    ['https://evil.example/api', 'json'],
    ['http://enka.network/api/uid/618285856?info', 'json'],
    ['https://enka.network.evil.example/api', 'json'],
    ['https://sub.enka.network/api', 'json'],
    ['https://enka.network:8443/api', 'json'],
    ['https://user:pw@enka.network/api', 'json'],
    ['https://raw.githubusercontent.com/EnkaNetwork/API-docs/other/store/gi/avatars.json', 'store'],
    ['https://raw.githubusercontent.com/EnkaNetwork/API-docs/master/store/../../other/x.json', 'store'],
    ['https://raw.githubusercontent.com/EnkaNetwork/API-docs/master/store/..%2F..%2Fother/x.json', 'store'],
    ['https://raw.githubusercontent.com/EnkaNetwork/API-docs/master/storex/a.json', 'store'],
    ['https://raw.githubusercontent.com/EnkaNetwork/API-docs/master/store/gi/avatars.json', 'image'],
    ['https://enka.network/api/uid/618285856?info', 'store'],
    ['https://enka.network/api/uid/618285856?info', 'other'],
    ['https://api.steampowered.com/x', 'image'],
    ['https://avatars.fastly.steamstatic.com/a.jpg', 'json'],
    ['not a url', 'json'],
    ['file:///etc/passwd', 'json'],
  ];
  for (const [url, kind] of bad) {
    const r = await safeFetch(url, { kind, budget: budget(), fetchImpl });
    assert.deepEqual(r, { ok: false, status: null, error: 'host' }, `${kind} ${url}`);
  }
  assert.equal(calls.length, 0);
});

test('an allowed JSON request: one call, GET, redirect manual, a timeout signal, the fixed User-Agent', async () => {
  const { calls, fetchImpl } = recorder(() => json('{"playerInfo":{}}'));
  const b = budget();
  const r = await safeFetch(ENKA, { kind: 'json', budget: b, fetchImpl, headers: { 'User-Agent': 'curl/8', Accept: 'application/json' } });
  assert.equal(r.ok, true);
  assert.equal(r.status, 200);
  assert.equal(new TextDecoder().decode(r.bytes), '{"playerInfo":{}}');
  assert.equal(r.contentType, 'application/json; charset=utf-8');
  assert.equal(b.used, 17);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, ENKA);
  assert.equal(calls[0].init.method ?? 'GET', 'GET');
  assert.equal(calls[0].init.redirect, 'manual');
  assert.ok(calls[0].init.signal instanceof AbortSignal);
  assert.equal(calls[0].headers.get('user-agent'), USER_AGENT, 'the caller cannot replace the User-Agent');
  assert.equal(calls[0].headers.get('accept'), 'application/json');
});

test('a 302 to an allowed host is followed (re-checked); the chain keeps the User-Agent', async () => {
  const target = 'https://enka.network/api/uid/618285856?info';
  const { calls, fetchImpl } = recorder((url) => (url === 'https://enka.network/api/uid/618285856/?info' ? redirect(target, 308) : json()));
  const r = await safeFetch('https://enka.network/api/uid/618285856/?info', { kind: 'json', budget: budget(), fetchImpl });
  assert.equal(r.ok, true);
  assert.deepEqual(calls.map((c) => c.url), ['https://enka.network/api/uid/618285856/?info', target]);
  for (const c of calls) assert.equal(c.headers.get('user-agent'), USER_AGENT);
  // A relative Location resolves against the current URL.
  const rel = recorder((_, __, i) => (i === 0 ? redirect('/api/uid/618285856?info') : json()));
  assert.equal((await safeFetch('https://enka.network/api/x', { kind: 'json', budget: budget(), fetchImpl: rel.fetchImpl })).ok, true);
  assert.equal(rel.calls[1].url, target);
});

test('a redirect to a host not listed, a third redirect, or one without Location → redirect', async () => {
  const off = recorder(() => redirect('https://evil.example/steal'));
  assert.deepEqual(await safeFetch(ENKA, { kind: 'json', budget: budget(), fetchImpl: off.fetchImpl }), { ok: false, status: 302, error: 'redirect' });
  assert.equal(off.calls.length, 1, 'the non-listed target is never requested');

  // A JSON host is not an image host: the list of the request's kind applies to every hop.
  const kindHop = recorder(() => redirect('https://api.steampowered.com/x.png'));
  assert.equal((await safeFetch('https://enka.network/ui/a.png', { kind: 'image', budget: budget(), fetchImpl: kindHop.fetchImpl })).error, 'redirect');
  assert.equal(kindHop.calls.length, 1);

  // The chain would end in a 200 after five hops, so a missing cap fails the assertion instead of looping.
  const loop = recorder((_, __, i) => (i < 5 ? redirect(`https://enka.network/hop${i + 1}`) : json()));
  assert.deepEqual(await safeFetch(ENKA, { kind: 'json', budget: budget(), fetchImpl: loop.fetchImpl }), { ok: false, status: 302, error: 'redirect' });
  assert.equal(loop.calls.length, 3, 'two redirects followed, the third refused');

  const two = recorder((_, __, i) => (i < 2 ? redirect(`https://enka.network/hop${i + 1}`, 301) : json()));
  assert.equal((await safeFetch(ENKA, { kind: 'json', budget: budget(), fetchImpl: two.fetchImpl })).ok, true);
  assert.equal(two.calls.length, 3);

  const bare = recorder(() => new Response(null, { status: 302 }));
  assert.equal((await safeFetch(ENKA, { kind: 'json', budget: budget(), fetchImpl: bare.fetchImpl })).error, 'redirect');

  const httpHop = recorder(() => redirect('http://enka.network/api'));
  assert.equal((await safeFetch(ENKA, { kind: 'json', budget: budget(), fetchImpl: httpHop.fetchImpl })).error, 'redirect');
  assert.equal(httpHop.calls.length, 1);
});

test('a keyed request (x-webapi-key) is sent once with redirect: error and never follows', async () => {
  const { calls, fetchImpl } = recorder(() => redirect('https://api.steampowered.com/other/'));
  const r = await safeFetch(STEAM_API, { kind: 'json', budget: budget(), fetchImpl, headers: { 'X-WebAPI-Key': FAKE_KEY } });
  assert.deepEqual(r, { ok: false, status: 302, error: 'redirect' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.redirect, 'error');
  assert.equal(calls[0].headers.get('x-webapi-key'), FAKE_KEY);
  assert.ok(!calls[0].url.includes('key='));

  // What a real fetch does with redirect: 'error' (undici: TypeError "fetch failed", cause "unexpected redirect").
  const real = recorder(() => {
    throw new TypeError('fetch failed', { cause: new Error('unexpected redirect') });
  });
  const r2 = await safeFetch(STEAM_API, { kind: 'json', budget: budget(), fetchImpl: real.fetchImpl, headers: { 'x-webapi-key': FAKE_KEY } });
  assert.deepEqual(r2, { ok: false, status: null, error: 'redirect' });
  assert.equal(real.calls.length, 1);

  // followRedirects: false does not loosen a keyed request.
  const nf = recorder(() => redirect('https://api.steampowered.com/other/'));
  const r3 = await safeFetch(STEAM_API, { kind: 'json', budget: budget(), fetchImpl: nf.fetchImpl, followRedirects: false, headers: { 'x-webapi-key': FAKE_KEY } });
  assert.equal(r3.error, 'redirect');
  assert.equal(nf.calls[0].init.redirect, 'error');
});

test('a cross-origin redirect drops every credential header; a same-origin one keeps them', async () => {
  const creds = { Authorization: 'Bearer ' + 'x'.repeat(8), Cookie: 'a=b', 'Proxy-Authorization': 'Basic eA==', Accept: 'application/json' };
  const cross = recorder((_, __, i) => (i === 0 ? redirect('https://steamcommunity.com/profiles/76561197960435530/?xml=1') : json()));
  assert.equal((await safeFetch(ENKA, { kind: 'json', budget: budget(), fetchImpl: cross.fetchImpl, headers: creds })).ok, true);
  assert.equal(cross.calls.length, 2);
  assert.equal(cross.calls[0].headers.get('authorization'), creds.Authorization);
  for (const name of ['authorization', 'cookie', 'proxy-authorization', 'x-webapi-key']) assert.equal(cross.calls[1].headers.get(name), null, name);
  assert.equal(cross.calls[1].headers.get('user-agent'), USER_AGENT);
  assert.equal(cross.calls[1].headers.get('accept'), 'application/json');

  const same = recorder((_, __, i) => (i === 0 ? redirect('https://enka.network/api/other') : json()));
  await safeFetch(ENKA, { kind: 'json', budget: budget(), fetchImpl: same.fetchImpl, headers: creds });
  assert.equal(same.calls[1].headers.get('authorization'), creds.Authorization);

  // Once dropped, the credentials stay dropped even when a later hop returns to the first origin.
  const back = recorder((_, __, i) => (i === 0 ? redirect('https://steamcommunity.com/a') : i === 1 ? redirect(ENKA) : json()));
  await safeFetch(ENKA, { kind: 'json', budget: budget(), fetchImpl: back.fetchImpl, headers: creds });
  assert.equal(back.calls.length, 3);
  assert.equal(back.calls[2].headers.get('authorization'), null);
});

test('followRedirects: false returns the 3xx itself with its resolved Location (lolchess existence check)', async () => {
  const { calls, fetchImpl } = recorder(() => redirect('/search?region=KR&query=x'));
  const r = await safeFetch('https://lolchess.gg/profile/kr/Hide%20on%20bush-KR1', { kind: 'json', budget: budget(), fetchImpl, followRedirects: false });
  assert.equal(r.ok, true);
  assert.equal(r.status, 302);
  assert.equal(r.location, 'https://lolchess.gg/search?region=KR&query=x');
  assert.equal(r.bytes.length, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.redirect, 'manual');
});

test('non-2xx answers → http with the status; the body is not kept', async () => {
  for (const status of [400, 403, 404, 424, 429, 500, 503, 504]) {
    const { fetchImpl } = recorder(() => json('{"error":1}', status));
    assert.deepEqual(await safeFetch(ENKA, { kind: 'json', budget: budget(), fetchImpl }), { ok: false, status, error: 'http' }, String(status));
  }
});

test('body caps: 1 MB + 1 byte JSON → too-large (streamed and by Content-Length); the platform budget sums across calls', async () => {
  const big = new Uint8Array(LIMITS.json + 1).fill(0x20);
  const streamed = recorder(() => new Response(big, { headers: JSON_TYPE }));
  const b = budget();
  assert.deepEqual(await safeFetch(ENKA, { kind: 'json', budget: b, fetchImpl: streamed.fetchImpl }), { ok: false, status: 200, error: 'too-large' });
  assert.ok(b.used <= LIMITS.json + 65_536, 'reading stops near the cap');

  const exact = recorder(() => new Response(new Uint8Array(LIMITS.json).fill(0x20), { headers: JSON_TYPE }));
  assert.equal((await safeFetch(ENKA, { kind: 'json', budget: budget(), fetchImpl: exact.fetchImpl })).ok, true, 'exactly 1 MB passes');

  // A declared length over the cap is refused before any byte is read.
  let pulled = false;
  const body = new ReadableStream({ pull(c) { pulled = true; c.enqueue(new Uint8Array(10)); c.close(); } }, { highWaterMark: 0 });
  const declared = recorder(() => new Response(body, { headers: { ...JSON_TYPE, 'content-length': String(LIMITS.json + 1) } }));
  const bd = budget();
  assert.equal((await safeFetch(ENKA, { kind: 'json', budget: bd, fetchImpl: declared.fetchImpl })).error, 'too-large');
  assert.equal(pulled, false);
  assert.equal(bd.used, 0);

  // Store files may be larger than API JSON (locs.json, 40 MB cap), images 3 MB.
  const storeBody = recorder(() => new Response(new Uint8Array(LIMITS.json + 10).fill(0x20), { headers: { 'content-type': 'text/plain; charset=utf-8' } }));
  assert.equal((await safeFetch(STORE, { kind: 'store', budget: budget(), fetchImpl: storeBody.fetchImpl })).ok, true);
  const bigImg = new Uint8Array(LIMITS.image + 1);
  bigImg.set(PNG);
  const img = recorder(() => new Response(bigImg, { headers: { 'content-type': 'image/png' } }));
  assert.equal((await safeFetch('https://enka.network/ui/UI_AvatarIcon_Side_Ambor.png', { kind: 'image', budget: budget(), fetchImpl: img.fetchImpl })).error, 'too-large');

  // The per-platform budget: 1,000-byte bodies against 1,500 bytes of room → the first fits, the second does not.
  const shared = { used: LIMITS.platform - 1_500 };
  const k = recorder(() => new Response(new Uint8Array(1_000).fill(0x20), { headers: JSON_TYPE }));
  assert.equal((await safeFetch(ENKA, { kind: 'json', budget: shared, fetchImpl: k.fetchImpl })).ok, true);
  assert.equal(shared.used, LIMITS.platform - 500);
  assert.deepEqual(await safeFetch(ENKA, { kind: 'json', budget: shared, fetchImpl: k.fetchImpl }), { ok: false, status: 200, error: 'too-large' });
  assert.ok(shared.used <= LIMITS.platform, 'the budget never records more than the cap');
});

test('content types: JSON needs a JSON type (store files also text/plain, the Steam profile check XML)', async () => {
  const typed = (type) => recorder(() => new Response('{}', { headers: type === null ? {} : { 'content-type': type } }));
  for (const t of ['application/json', 'application/json; charset=utf-8', 'Application/JSON', 'application/problem+json']) {
    assert.equal((await safeFetch(ENKA, { kind: 'json', budget: budget(), fetchImpl: typed(t).fetchImpl })).ok, true, t);
  }
  for (const t of ['text/html; charset=utf-8', 'text/plain', 'application/octet-stream', 'image/png', 'application/jsonx', null]) {
    assert.deepEqual(await safeFetch(ENKA, { kind: 'json', budget: budget(), fetchImpl: typed(t).fetchImpl }), { ok: false, status: 200, error: 'type' }, String(t));
  }
  // raw.githubusercontent.com serves every file as text/plain.
  assert.equal((await safeFetch(STORE, { kind: 'store', budget: budget(), fetchImpl: typed('text/plain; charset=utf-8').fetchImpl })).ok, true);
  assert.equal((await safeFetch(STORE, { kind: 'store', budget: budget(), fetchImpl: typed('text/html').fetchImpl })).error, 'type');
  // steamcommunity.com ?xml=1 (read by regex only, spec §6.5) is XML; XML is accepted from that host only.
  const xml = 'https://steamcommunity.com/profiles/76561197960435530/?xml=1';
  assert.equal((await safeFetch(xml, { kind: 'json', budget: budget(), fetchImpl: typed('text/xml; charset=utf-8').fetchImpl })).ok, true);
  assert.equal((await safeFetch(ENKA, { kind: 'json', budget: budget(), fetchImpl: typed('text/xml').fetchImpl })).error, 'type');
});

test('images: PNG, JPEG and WebP magic accepted; GIF, HTML and empty bodies rejected (type)', async () => {
  const url = 'https://enka.network/ui/UI_NameCardPic_0_P.jpg';
  for (const [bytes, kind] of [[PNG, 'png'], [JPG, 'jpg'], [WEBP, 'webp']]) {
    const { fetchImpl } = recorder(() => new Response(bytes, { headers: { 'content-type': 'application/octet-stream' } }));
    const r = await safeFetch(url, { kind: 'image', budget: budget(), fetchImpl });
    assert.equal(r.ok, true, kind);
    assert.deepEqual([...r.bytes], [...bytes]);
    assert.equal(imageKind(r.bytes), kind);
  }
  for (const bytes of [GIF, HTML, new Uint8Array(0)]) {
    const { fetchImpl } = recorder(() => new Response(bytes, { headers: { 'content-type': 'image/png' } }));
    assert.deepEqual(await safeFetch(url, { kind: 'image', budget: budget(), fetchImpl }), { ok: false, status: 200, error: 'type' });
  }
  assert.equal(imageKind(GIF), null);
  assert.equal(imageKind(Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x41, 0x56, 0x49, 0x20])), null, 'RIFF but not WEBP');
  assert.equal(imageKind(PNG.slice(0, 4)), null);
});

test('timeouts → timeout (request and body); other failures → network; one attempt, no retry', async () => {
  const t = recorder(() => {
    throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
  });
  assert.deepEqual(await safeFetch(ENKA, { kind: 'json', budget: budget(), fetchImpl: t.fetchImpl }), { ok: false, status: null, error: 'timeout' });
  assert.equal(t.calls.length, 1);

  const slowBody = new ReadableStream({ pull(c) { c.error(new DOMException('timeout', 'TimeoutError')); } });
  const tb = recorder(() => new Response(slowBody, { headers: JSON_TYPE }));
  assert.deepEqual(await safeFetch(ENKA, { kind: 'json', budget: budget(), fetchImpl: tb.fetchImpl }), { ok: false, status: 200, error: 'timeout' });

  const n = recorder(() => {
    throw new TypeError('fetch failed', { cause: new Error('getaddrinfo ENOTFOUND') });
  });
  assert.deepEqual(await safeFetch(ENKA, { kind: 'json', budget: budget(), fetchImpl: n.fetchImpl }), { ok: false, status: null, error: 'network' });
  assert.equal(n.calls.length, 1);

  // The default timeout is 10 s: the signal passed to fetch aborts after timeoutMs.
  const s = recorder((_, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason))));
  const started = Date.now();
  const keepAlive = setTimeout(() => {}, 5_000); // AbortSignal.timeout's timer is unref'd; a real socket keeps the loop alive
  try {
    assert.deepEqual(await safeFetch(ENKA, { kind: 'json', budget: budget(), fetchImpl: s.fetchImpl, timeoutMs: 30 }), { ok: false, status: null, error: 'timeout' });
  } finally {
    clearTimeout(keepAlive);
  }
  assert.ok(Date.now() - started < 5_000);
});

test('the default fetch is globalThis.fetch at call time (so the job can be mocked), never at import time', async () => {
  const real = globalThis.fetch;
  let n = 0;
  globalThis.fetch = async () => {
    n += 1;
    return json();
  };
  try {
    assert.equal((await safeFetch(ENKA, { kind: 'json', budget: budget() })).ok, true);
  } finally {
    globalThis.fetch = real;
  }
  assert.equal(n, 1);
});

test('writeAtomic writes through a temp file and a rename, leaving no temp file', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'safe-fetch-'));
  try {
    const file = join(dir, 'accounts', 'img', 'abcdef012345.png');
    await writeAtomic(file, PNG);
    assert.deepEqual([...readFileSync(file)], [...PNG]);
    await writeAtomic(file, 'second');
    assert.equal(readFileSync(file, 'utf8'), 'second');
    assert.deepEqual(readdirSync(join(dir, 'accounts', 'img')), ['abcdef012345.png']);

    // A failed rename (the target is a non-empty directory) removes the temp file; other files stay whole.
    writeFileSync(join(dir, 'keep.json'), '{"old":1}');
    mkdirSync(join(dir, 'taken', 'inner'), { recursive: true });
    await assert.rejects(writeAtomic(join(dir, 'taken'), '{"new":1}'));
    assert.equal(readFileSync(join(dir, 'keep.json'), 'utf8'), '{"old":1}');
    assert.deepEqual(readdirSync(dir).sort(), ['accounts', 'keep.json', 'taken']);
    assert.deepEqual(readdirSync(join(dir, 'taken')), ['inner']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  assert.equal(existsSync(dir), false);
});

const REASONS = ['invalid-id', 'no-name', 'name-mismatch', 'http-400', 'http-404', 'http-424', 'http-429', 'http-5xx', 'timeout', 'not-public', 'bad-response', 'auth', 'no-key'];

test('REASON_TEXT: exactly the 13 AccountFailReason codes, ko 합니다체 sentences, en without Hangul', () => {
  assert.deepEqual(Object.keys(REASON_TEXT).sort(), [...REASONS].sort());
  for (const [code, t] of Object.entries(REASON_TEXT)) {
    assert.deepEqual(Object.keys(t).sort(), ['en', 'ko'], code);
    assert.ok(t.ko.trim().length > 0 && /(니다|세요)\.$/.test(t.ko), `${code} ko: ${t.ko}`);
    assert.ok(t.en.trim().length > 0 && !/[ᄀ-ᇿ㄰-㆏가-힯]/.test(t.en), `${code} en: ${t.en}`);
    assert.ok(!/§/.test(t.ko + t.en), `${code} cites no spec section`);
    assert.ok(!/https?:\/\//.test(t.ko + t.en), `${code} has no URL`);
  }
  assert.ok(Object.isFrozen(REASON_TEXT) && Object.isFrozen(REASON_TEXT['no-key']));
});

test('REASON_TEXT: the four sentences the spec gives, verbatim', () => {
  assert.deepEqual(REASON_TEXT['name-mismatch'], {
    ko: '입력한 닉네임과 게임에 보이는 닉네임이 다릅니다. 연동 관리에서 닉네임을 고쳐 주세요.',
    en: 'The name you entered differs from the in-game name. Fix it in account management.',
  });
  assert.deepEqual(REASON_TEXT['not-public'], { ko: 'Steam 프로필이 비공개입니다. 프로필을 공개로 바꿔 주세요.', en: 'The Steam profile is private. Make it public.' });
  assert.deepEqual(REASON_TEXT['http-424'], {
    ko: 'Enka.Network가 게임 점검 직후라 받지 못했습니다. 다음 예약 빌드에서 다시 시도합니다.',
    en: 'Enka.Network was updating after game maintenance. The next scheduled build retries.',
  });
  assert.deepEqual(REASON_TEXT['no-key'], {
    ko: 'STEAM_API_KEY가 account-fetch 환경에 없습니다. README "연동 켜기"의 Steam 키 단계를 확인해 주세요.',
    en: 'STEAM_API_KEY is missing from the account-fetch environment.',
  });
});
