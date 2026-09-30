// AL-14 (account-link spec §5.7.1–5.7.5, §8.1, §8.4, §11.1): the relay Worker core. The Worker's default export is
// called directly with web-standard Request objects; every outgoing call goes to a fake globalThis.fetch that records
// { url, method, headers, body, redirect, signal } and answers with scripted Responses, so no test reaches GitHub or a
// workers.dev host. GitHub answers here are synthetic (only the fields spec §5.7.3 names), never recorded responses.
// Every secret-shaped value is a fake built at run time (Global Constraints, spec §5.7.8); SEAL_KEY is random per run.
import { afterEach, beforeEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';

const relay = await import('../../workers/account-relay/src/index.mjs');
const worker = relay.default;
const { deriveKeys, seal, unseal } = relay;

const read = (rel) => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');
const HOST = 'account-relay.test-sub.workers.dev';
const ORIGIN = 'https://lunecid.github.io';
const LINK_RETURN = 'https://lunecid.github.io/link-return/';
const RETURN_KO = 'https://lunecid.github.io/game/player-log/?manage';
const RETURN_EN = 'https://lunecid.github.io/en/game/player-log/?manage';
const OWNER_ID = 145949817;
const SEAL_KEY = randomBytes(32).toString('base64');
const ENV = Object.freeze({ GH_CLIENT_ID: 'Iv1.test', GH_CLIENT_SECRET: 'cs' + '_' + 'x'.repeat(20), SEAL_KEY });
const TOKEN = 'ghu' + '_' + 'A'.repeat(36);
const REFRESH = 'ghr' + '_' + 'B'.repeat(36);
const CODE = 'code' + 'C'.repeat(16);
const N = 'nonce' + '_-' + 'Q'.repeat(17); // 24 characters of [A-Za-z0-9_-]
const KEYS = await deriveKeys(SEAL_KEY);
const CLEAR = '__Host-gh_oauth=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Lax';
const USER_AGENT = 'lunecid-account-relay/1.0 (+https://lunecid.github.io)';

const GH_AUTHORIZE = 'https://github.com/login/oauth/authorize';
const GH_TOKEN = 'https://github.com/login/oauth/access_token';
const GH_USER = 'https://api.github.com/user';
const GH_REPO_CHECK = 'https://api.github.com/repos/Lunecid/Lunecid.github.io/actions/variables?per_page=1';
const GH_GRANT = 'https://api.github.com/applications/Iv1.test/grant';
const LOG_LINE = /^relay: \/[a-z/.-]+ (ok|error:[a-z-]+)$/;

const now = () => Math.floor(Date.now() / 1000);
const b64url = (buf) => Buffer.from(buf).toString('base64url');
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

// ---- fake fetch, console capture ------------------------------------------------------------------------------------

let calls = [];
let routes = [];
let unexpected = [];
let logs = [];
const realFetch = globalThis.fetch;
const realConsole = { log: console.log, info: console.info, warn: console.warn, error: console.error, debug: console.debug };

function route(match, respond) {
  routes.push({ match, respond });
}

async function fakeFetch(input, init = {}) {
  const url = String(input instanceof Request ? input.url : input);
  const method = String(init.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
  const rec = { url, method, headers: new Headers(init.headers), body: init.body == null ? null : String(init.body), redirect: init.redirect, signal: init.signal };
  calls.push(rec);
  const hit = routes.find((r) => r.match(rec));
  if (!hit) {
    unexpected.push(`${method} ${url}`);
    throw new TypeError('fetch failed');
  }
  return hit.respond(rec);
}

beforeEach(() => {
  calls = [];
  routes = [];
  unexpected = [];
  logs = [];
  globalThis.fetch = fakeFetch;
  for (const name of Object.keys(realConsole)) {
    console[name] = (...args) => {
      const line = args.map(String).join(' ');
      // Node's own "MockTimers API is experimental" warning (Node 22) is printed through console.error; not ours.
      if (/^\(node:\d+\) ExperimentalWarning: The MockTimers API/.test(line)) return;
      logs.push(line);
    };
  }
});

afterEach(() => {
  globalThis.fetch = realFetch;
  Object.assign(console, realConsole);
  assert.deepEqual(unexpected, [], 'the Worker only calls the scripted destinations');
  for (const line of logs) {
    assert.match(line, LOG_LINE);
    for (const secret of [TOKEN, REFRESH, CODE, ENV.GH_CLIENT_SECRET, SEAL_KEY, N]) assert.ok(!line.includes(secret), line);
  }
});

/** Calls the Worker; every response must carry the three security headers and never a wildcard or credentials CORS. */
async function call(path, init = {}, { host = HOST, env = ENV, scheme = 'https' } = {}) {
  const res = await worker.fetch(new Request(`${scheme}://${host}${path}`, init), env, { waitUntil() {}, passThroughOnException() {} });
  assert.equal(res.headers.get('cache-control'), 'no-store', `${path} cache-control`);
  assert.equal(res.headers.get('referrer-policy'), 'no-referrer', `${path} referrer-policy`);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff', `${path} nosniff`);
  assert.notEqual(res.headers.get('access-control-allow-origin'), '*');
  assert.equal(res.headers.get('access-control-allow-credentials'), null);
  return res;
}

const post = (path, { origin = ORIGIN, headers = {}, body, env = ENV } = {}) =>
  call(path, { method: 'POST', headers: { ...(origin === null ? {} : { origin }), ...headers }, body }, { env });

function assertCors(res) {
  assert.equal(res.headers.get('access-control-allow-origin'), ORIGIN);
  assert.equal(res.headers.get('vary'), 'Origin');
}

function assertNoCors(res) {
  assert.equal(res.headers.get('access-control-allow-origin'), null);
  assert.equal(res.headers.get('access-control-allow-methods'), null);
}

/** Synthetic GitHub answers (spec §5.7.3 fields only). */
function github({ exchange, user, repo, grant } = {}) {
  route((r) => r.url === GH_TOKEN && r.method === 'POST', exchange ?? (() => json({ access_token: TOKEN, expires_in: 28800, refresh_token: REFRESH, refresh_token_expires_in: 15897600, token_type: 'bearer', scope: '' })));
  route((r) => r.url === GH_USER && r.method === 'GET', user ?? (() => json({ id: OWNER_ID, login: 'Lunecid' })));
  route((r) => r.url === GH_REPO_CHECK && r.method === 'GET', repo ?? (() => json({ total_count: 0, variables: [] })));
  route((r) => r.url === GH_GRANT && r.method === 'DELETE', grant ?? (() => new Response(null, { status: 204 })));
}

async function login(query = `?lang=ko&n=${N}`, opts) {
  const res = await call(`/gh/login${query}`, {}, opts);
  const location = res.headers.get('location');
  const setCookie = res.headers.get('set-cookie');
  const cookie = setCookie === null ? null : (/^__Host-gh_oauth=([^;]+);/.exec(setCookie)?.[1] ?? null);
  return { res, location, setCookie, cookie, url: location?.startsWith(GH_AUTHORIZE) ? new URL(location) : null };
}

/** The callback; every callback response clears the login cookie before anything else. */
async function callback(cookie, query, opts) {
  const res = await call(`/gh/callback${query}`, { headers: cookie ? { cookie: `other=1; __Host-gh_oauth=${cookie}` } : {} }, opts);
  assert.equal(res.status, 302);
  assert.deepEqual(res.headers.getSetCookie(), [CLEAR]);
  const text = await res.text();
  const location = res.headers.get('location');
  // Neither the refresh token nor the raw access token ever leaves the Worker (the ticket seals the access token).
  for (const secret of [REFRESH, TOKEN]) assert.ok(!text.includes(secret) && !location.includes(secret) && !decodeURIComponent(location).includes(secret));
  return res;
}

async function loggedIn(query) {
  const l = await login(query);
  return { ...l, state: l.url.searchParams.get('state') };
}

const grantCalls = () => calls.filter((c) => c.url === GH_GRANT);

// ---- config ---------------------------------------------------------------------------------------------------------

test('config: wrangler.jsonc, the exact wrangler pin, the separate lockfile, and the spec constants', () => {
  const text = read('workers/account-relay/wrangler.jsonc');
  const parsed = JSON.parse(text.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n'));
  assert.equal(parsed.name, 'account-relay');
  assert.equal(parsed.main, 'src/index.mjs');
  assert.equal(parsed.compatibility_date, '2026-09-29');
  assert.equal(parsed.workers_dev, true);
  assert.equal(parsed.preview_urls, false);
  assert.deepEqual(parsed.observability, { enabled: true, logs: { invocation_logs: false } });
  assert.equal(Object.hasOwn(parsed, 'vars'), false);
  assert.equal(Object.hasOwn(parsed, 'ratelimits'), false);

  const pkg = JSON.parse(read('workers/account-relay/package.json'));
  assert.deepEqual(pkg, { name: 'account-relay', private: true, type: 'module', engines: { node: '>=22' }, scripts: { setup: 'node setup-secrets.mjs', deploy: 'wrangler deploy' }, devDependencies: { wrangler: '4.144.0' } });
  assert.match(pkg.devDependencies.wrangler, /^\d+\.\d+\.\d+$/);
  const lock = JSON.parse(read('workers/account-relay/package-lock.json'));
  assert.equal(lock.packages[''].devDependencies.wrangler, '4.144.0');
  assert.equal(lock.packages['node_modules/wrangler'].version, '4.144.0');
  // Not an npm workspace: the site's lockfile and manifest do not know wrangler.
  assert.ok(!read('package-lock.json').includes('wrangler'));
  assert.ok(!read('package.json').includes('wrangler'));
  assert.ok(!read('package.json').includes('workspaces'));

  assert.equal(relay.SITE_ORIGIN, 'https://lunecid.github.io');
  assert.equal(relay.OWNER_ID, 145949817);
  assert.equal(relay.REPO, 'Lunecid/Lunecid.github.io');
  assert.equal(relay.REPO_ID, 1392489248);
  assert.equal(relay.WORKFLOW, 'deploy.yml');
  assert.equal(relay.REF, 'main');
  assert.deepEqual({ ...relay.RETURN_PAGES }, { ko: RETURN_KO, en: RETURN_EN });
  assert.equal(relay.STEAM_OP, 'https://steamcommunity.com/openid/login');
  assert.equal(relay.LINK_RETURN, LINK_RETURN);
  assert.equal(String(relay.HOST_RE), String(/^account-relay\.[a-z0-9-]+\.workers\.dev$/));
  assert.equal(relay.GH_API_VERSION, '2026-03-10');
  assert.equal(relay.USER_AGENT, USER_AGENT);
  assert.equal(relay.TICKET_TTL, 120);
  assert.equal(relay.HANDLE_MAX, 3600);
  assert.equal(relay.COOKIE, '__Host-gh_oauth');
  assert.equal(relay.COOKIE_TTL, 600);
});

test('config: web-standard code only, the shared ID rules imported (not copied), one fixed log format', () => {
  const dir = 'workers/account-relay/src/';
  const files = readdirSync(new URL(`../../${dir}`, import.meta.url)).filter((f) => f.endsWith('.mjs'));
  assert.ok(files.includes('index.mjs'));
  const all = files.map((f) => read(dir + f)).join('\n');
  assert.doesNotMatch(all, /from\s+['"](?:cloudflare:|node:)/);
  assert.doesNotMatch(all, /\brequire\(/);
  const index = read(`${dir}index.mjs`);
  assert.match(index, /from '\.\.\/\.\.\/\.\.\/src\/lib\/account-ids\.ts';/);
  for (const name of ['ACCOUNT_VARS', 'validateVar', 'looksLikeSecret', 'parseSteamId64', 'normalize']) {
    assert.match(index, new RegExp(`import \\{[^}]*\\b${name}\\b[^}]*\\} from '\\.\\./\\.\\./\\.\\./src/lib/account-ids\\.ts'`), name);
    assert.doesNotMatch(all, new RegExp(`(?:function|const|let)\\s+${name}\\b`), `${name} is not redefined`);
  }
  // The only console call is the fixed "relay: <path> ok|error:<code>" line (spec §5.7.5).
  assert.deepEqual(all.match(/console\.[a-z]+\(/g), ['console.log(']);
  assert.match(all, /console\.log\(`relay: \$\{path\} \$\{error === null \? 'ok' : `error:\$\{error\}`\}`\)/);
  assert.doesNotMatch(all, /redirect:\s*'follow'/);
  assert.doesNotMatch(all, /Access-Control-Allow-Credentials/i);
});

test('config missing: /health says only configured:false, login goes to #gh-error=config, the API answers 503 config', async () => {
  const variants = [];
  for (const name of ['GH_CLIENT_ID', 'GH_CLIENT_SECRET', 'SEAL_KEY']) {
    const without = { ...ENV };
    delete without[name];
    variants.push([name, without], [`${name} empty`, { ...ENV, [name]: '' }]);
  }
  variants.push(['short SEAL_KEY', { ...ENV, SEAL_KEY: randomBytes(16).toString('base64') }], ['garbled SEAL_KEY', { ...ENV, SEAL_KEY: '!!not base64!!' }]);
  for (const [label, env] of variants) {
    const health = await call('/health', {}, { env });
    assert.equal(health.status, 200, label);
    const text = await health.text();
    assert.deepEqual(JSON.parse(text), { ok: true, configured: false }, label);
    for (const name of ['GH_CLIENT_ID', 'GH_CLIENT_SECRET', 'SEAL_KEY']) assert.ok(!text.includes(name), label);
    assertNoCors(health);

    const popup = await call(`/gh/login?lang=ko&n=${N}`, {}, { env });
    assert.equal(popup.status, 302, label);
    assert.equal(popup.headers.get('location'), `${LINK_RETURN}#gh-error=config&n=${N}`, label);
    assert.equal(popup.headers.get('set-cookie'), null);
    const tab = await call('/gh/login?lang=en&mode=tab', {}, { env });
    assert.equal(tab.headers.get('location'), `${RETURN_EN}#gh-error=config`, label);

    const session = await post('/gh/session', { headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ticket: 'x', n: N }) , env });
    assert.equal(session.status, 503, label);
    assert.deepEqual(await session.json(), { error: 'config' });
    assertCors(session);
  }
  const full = await call('/health');
  assert.deepEqual(await full.json(), { ok: true, configured: true });
  assert.equal(calls.length, 0);
});

// ---- host -----------------------------------------------------------------------------------------------------------

test('host: only account-relay.<sub>.workers.dev answers; the redirect_uri comes from that host alone', async () => {
  for (const host of ['evil.example', 'account-relay.test-sub.workers.dev.evil.example', 'x.account-relay.test-sub.workers.dev', 'account-relay.workers.dev', 'relay.test-sub.workers.dev', 'account-relay.test_sub.workers.dev']) {
    for (const path of ['/health', `/gh/login?lang=ko&n=${N}`, '/gh/callback?code=x&state=y']) {
      const res = await call(path, {}, { host });
      assert.equal(res.status, 404, `${host}${path}`);
      assert.deepEqual(await res.json(), { error: 'not-found' });
      assert.equal(res.headers.get('location'), null);
    }
    const pre = await call('/gh/session', { method: 'OPTIONS', headers: { origin: ORIGIN, 'access-control-request-method': 'POST' } }, { host });
    assert.equal(pre.status, 404);
    assertNoCors(pre);
  }
  for (const [scheme, host] of [['http', HOST], ['https', `${HOST}:8443`], ['http', `${HOST}:8080`], ['https', `${HOST}:444`]]) {
    for (const path of ['/health', `/gh/login?lang=ko&n=${N}`, '/gh/callback?code=x&state=y']) {
      const res = await call(path, {}, { host, scheme });
      assert.equal(res.status, 404, `${scheme}://${host}${path}`);
      assert.deepEqual(await res.json(), { error: 'not-found' });
    }
    const res = await call('/gh/session', { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json' }, body: '{}' }, { host, scheme });
    assert.equal(res.status, 404);
    assertNoCors(res);
  }
  const ok = await call('/health');
  assert.equal(ok.status, 200);
  const other = await call('/health', {}, { host: 'account-relay.lunecid-relay.workers.dev' });
  assert.equal(other.status, 200);

  const l = await login();
  assert.equal(l.url.searchParams.get('redirect_uri'), 'https://account-relay.test-sub.workers.dev/gh/callback');
  const l2 = await login(`?lang=ko&n=${N}`, { host: 'account-relay.lunecid-relay.workers.dev' });
  assert.equal(l2.url.searchParams.get('redirect_uri'), 'https://account-relay.lunecid-relay.workers.dev/gh/callback');
  assert.equal(calls.length, 0);
});

test('routes: unknown paths, wrong methods and the AL-15 paths answer 404', async () => {
  const cases = [
    ['/', 'GET'], ['/nope', 'GET'], ['/__proto__', 'GET'], ['/constructor', 'GET'], ['/health/', 'GET'], ['/HEALTH', 'GET'],
    ['/health', 'POST'], ['/gh/login', 'POST'], ['/gh/callback', 'POST'], ['/gh/session', 'GET'], ['/gh/logout', 'GET'],
    ['/gh/api', 'POST'], ['/openid/verify', 'POST'], ['/gh/api', 'OPTIONS'], ['/openid/verify', 'OPTIONS'], ['/health', 'OPTIONS'],
  ];
  for (const [path, method] of cases) {
    const res = await call(path, { method, headers: { origin: ORIGIN, 'access-control-request-method': 'POST' } });
    assert.equal(res.status, 404, `${method} ${path}`);
    assert.deepEqual(await res.json(), { error: 'not-found' });
  }
  assert.equal(calls.length, 0);
});

// ---- CORS -----------------------------------------------------------------------------------------------------------

test('CORS: the preflight allows the site origin, POST and authorization/content-type only', async () => {
  const preflight = (path, headers) => call(path, { method: 'OPTIONS', headers });
  for (const path of ['/gh/session', '/gh/logout']) {
    for (const reqHeaders of ['authorization, content-type', 'Content-Type', 'authorization', null]) {
      const res = await preflight(path, { origin: ORIGIN, 'access-control-request-method': 'POST', ...(reqHeaders === null ? {} : { 'access-control-request-headers': reqHeaders }) });
      assert.equal(res.status, 204, `${path} ${reqHeaders}`);
      assert.equal(res.headers.get('access-control-allow-origin'), ORIGIN);
      assert.equal(res.headers.get('access-control-allow-methods'), 'POST');
      assert.equal(res.headers.get('access-control-allow-headers'), 'Authorization, Content-Type');
      assert.equal(res.headers.get('access-control-max-age'), '600');
      assert.equal(res.headers.get('vary'), 'Origin');
      assert.equal(await res.text(), '');
    }
    const refused = [
      { origin: 'https://evil.example', 'access-control-request-method': 'POST' },
      { origin: 'https://lunecid.github.io.evil.example', 'access-control-request-method': 'POST' },
      { origin: 'http://lunecid.github.io', 'access-control-request-method': 'POST' },
      { origin: 'https://lunecid.github.io/', 'access-control-request-method': 'POST' },
      { origin: 'null', 'access-control-request-method': 'POST' },
      { 'access-control-request-method': 'POST' },
      { origin: ORIGIN, 'access-control-request-method': 'PUT' },
      { origin: ORIGIN, 'access-control-request-method': 'post' },
      { origin: ORIGIN },
      { origin: ORIGIN, 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization, content-type, x-extra' },
      { origin: ORIGIN, 'access-control-request-method': 'POST', 'access-control-request-headers': 'cookie' },
    ];
    for (const headers of refused) {
      const res = await preflight(path, headers);
      assert.equal(res.status, 403, JSON.stringify(headers));
      assert.deepEqual(await res.json(), { error: 'forbidden' });
      assertNoCors(res);
      assert.equal(res.headers.get('access-control-allow-headers'), null);
    }
  }
  assert.equal(calls.length, 0);
  assert.ok(logs.includes('relay: /gh/session error:forbidden') && logs.includes('relay: /gh/logout error:forbidden'));
});

test('CORS: a real request from another origin is refused without CORS headers; allowed-origin errors carry them', async () => {
  const handle = await seal(KEYS.handle, { typ: 'handle', tok: TOKEN, uid: OWNER_ID, exp: now() + 600 });
  for (const origin of ['https://evil.example', 'http://lunecid.github.io', 'null', null]) {
    for (const path of ['/gh/session', '/gh/logout']) {
      const res = await post(path, { origin, headers: { authorization: `Bearer ${handle}`, 'content-type': 'application/json' }, body: '{}' });
      assert.equal(res.status, 403, `${origin} ${path}`);
      assert.deepEqual(await res.json(), { error: 'forbidden' });
      assertNoCors(res);
      assert.equal(res.headers.get('vary'), null);
    }
  }
  assert.equal(calls.length, 0, 'no grant delete for a foreign origin');
  assert.ok(logs.includes('relay: /gh/session error:forbidden') && logs.includes('relay: /gh/logout error:forbidden'));

  const ticket401 = await post('/gh/session', { headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ticket: 'garbage', n: N }) });
  assert.equal(ticket401.status, 401);
  assert.deepEqual(await ticket401.json(), { error: 'ticket' });
  assertCors(ticket401);
  const invalid400 = await post('/gh/session', { headers: { 'content-type': 'text/plain' }, body: '{}' });
  assert.equal(invalid400.status, 400);
  assertCors(invalid400);
  const config503 = await post('/gh/session', { headers: { 'content-type': 'application/json' }, body: '{}', env: { SEAL_KEY } });
  assert.equal(config503.status, 503);
  assertCors(config503);
  // Direct-navigation paths never carry CORS headers.
  assertNoCors(await call('/health', { headers: { origin: ORIGIN } }));
  assertNoCors((await login()).res);
});

// ---- login ----------------------------------------------------------------------------------------------------------

test('login: 302 to GitHub with state, PKCE S256, login=Lunecid, allow_signup=false and a sealed first-party cookie', async () => {
  const before = now();
  const l = await login();
  assert.equal(l.res.status, 302);
  assert.equal(`${l.url.origin}${l.url.pathname}`, GH_AUTHORIZE);
  const p = l.url.searchParams;
  assert.deepEqual([...p.keys()].sort(), ['allow_signup', 'client_id', 'code_challenge', 'code_challenge_method', 'login', 'redirect_uri', 'state']);
  assert.equal(p.get('client_id'), 'Iv1.test');
  assert.equal(p.get('redirect_uri'), `https://${HOST}/gh/callback`);
  assert.match(p.get('state'), /^[A-Za-z0-9_-]{43,}$/);
  assert.equal(p.get('code_challenge_method'), 'S256');
  assert.equal(p.get('login'), 'Lunecid');
  assert.equal(p.get('allow_signup'), 'false');

  const parts = l.setCookie.split(';').map((s) => s.trim());
  assert.equal(parts[0].split('=')[0], '__Host-gh_oauth');
  for (const attr of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/', 'Max-Age=600']) assert.ok(parts.includes(attr), attr);
  assert.ok(!parts.some((x) => /^domain=/i.test(x)), 'a __Host- cookie has no Domain');
  assert.equal(parts.length, 6);

  const payload = await unseal(KEYS.cookie, l.cookie);
  assert.deepEqual(Object.keys(payload).sort(), ['exp', 'lang', 'mode', 'n', 'state', 'verifier']);
  assert.equal(payload.state, p.get('state'));
  assert.match(payload.verifier, /^[A-Za-z0-9._~-]{43,128}$/);
  assert.equal(p.get('code_challenge'), b64url(createHash('sha256').update(payload.verifier).digest()));
  assert.equal(payload.lang, 'ko');
  assert.equal(payload.n, N);
  assert.equal(payload.mode, 'popup');
  assert.ok(payload.exp >= before + 600 && payload.exp <= now() + 600);
  assert.ok(!l.cookie.includes(payload.state) && !l.cookie.includes(payload.verifier), 'the cookie hides state and verifier');
  assert.equal(await unseal(KEYS.handle, l.cookie), null, 'the cookie key is not the handle key');

  const again = await login();
  assert.notEqual(again.url.searchParams.get('state'), p.get('state'));
  assert.equal(calls.length, 0);
});

test('login: a wrong lang, n or mode goes to #gh-error=state (never JSON); mode=tab needs no n', async () => {
  const bad = ['?lang=fr&n=' + N, '?n=' + N, `?lang=KO&n=${N}`, `?lang=ko&n=${'a'.repeat(21)}`, `?lang=ko&n=${'a'.repeat(65)}`, `?lang=ko&n=${'a'.repeat(30)}.x`, `?lang=ko&n=${'a'.repeat(30)}%20`, '?lang=ko', '?lang=ko&n=', `?lang=ko&n=${N}&mode=popup`, `?lang=ko&n=${N}&mode=TAB`, ''];
  for (const q of bad) {
    const res = await call(`/gh/login${q}`);
    assert.equal(res.status, 302, q);
    assert.equal(res.headers.get('location'), `${LINK_RETURN}#gh-error=state`, q);
    assert.equal(res.headers.get('set-cookie'), null, q);
    assert.equal(res.headers.get('content-type'), null, q);
    assert.equal(await res.text(), '');
  }
  const tab = await login('?lang=en&mode=tab');
  assert.equal(tab.res.status, 302);
  assert.ok(tab.url, 'mode=tab without n reaches GitHub');
  assert.deepEqual((({ lang, n, mode }) => ({ lang, n, mode }))(await unseal(KEYS.cookie, tab.cookie)), { lang: 'en', n: null, mode: 'tab' });
  // mode=tab ignores any n (valid or not): the cookie holds n: null, so the ticket is redeemed without one.
  for (const q of [`?lang=ko&mode=tab&n=${N}`, '?lang=en&mode=tab&n=short', '?lang=en&mode=tab&n=a.b']) {
    const tabN = await login(q);
    assert.ok(tabN.url, q);
    assert.equal((await unseal(KEYS.cookie, tabN.cookie)).n, null, q);
  }
  assert.equal(calls.length, 0);
});

test('login: a rate-limit binding that refuses sends #gh-error=rate by 302; an absent or allowing binding is fine', async () => {
  const keys = [];
  const env = { ...ENV, LOGIN_RATE_LIMITER: { limit: async ({ key }) => (keys.push(key), { success: false }) } };
  const popup = await call(`/gh/login?lang=ko&n=${N}`, {}, { env });
  assert.equal(popup.status, 302);
  assert.equal(popup.headers.get('location'), `${LINK_RETURN}#gh-error=rate&n=${N}`);
  assert.equal(popup.headers.get('content-type'), null);
  assert.equal(popup.headers.get('set-cookie'), null);
  const tab = await call('/gh/login?lang=ko&mode=tab', {}, { env });
  assert.equal(tab.headers.get('location'), `${RETURN_KO}#gh-error=rate`);
  assert.deepEqual(keys, ['login', 'login']);
  const allowing = await login(`?lang=ko&n=${N}`, { env: { ...ENV, LOGIN_RATE_LIMITER: { limit: async () => ({ success: true }) } } });
  assert.ok(allowing.url);
});

// ---- callback -------------------------------------------------------------------------------------------------------

test('callback: success (popup) exchanges the code with PKCE and repository_id, checks the owner and the repository, then returns a 120 s ticket', async () => {
  github();
  const l = await loggedIn();
  const before = now();
  const res = await callback(l.cookie, `?code=${CODE}&state=${l.state}`);
  const m = /^https:\/\/lunecid\.github\.io\/link-return\/#gh=([A-Za-z0-9_-]+)&n=([A-Za-z0-9_-]+)$/.exec(res.headers.get('location'));
  assert.ok(m, res.headers.get('location'));
  assert.equal(res.headers.get('location'), `${LINK_RETURN}#gh=${m[1]}&n=${N}`);

  assert.deepEqual(calls.map((c) => `${c.method} ${c.url}`), [`POST ${GH_TOKEN}`, `GET ${GH_USER}`, `GET ${GH_REPO_CHECK}`]);
  const [exchange, user, repo] = calls;
  assert.equal(exchange.headers.get('accept'), 'application/json');
  assert.equal(exchange.headers.get('content-type'), 'application/x-www-form-urlencoded');
  assert.equal(exchange.headers.get('user-agent'), USER_AGENT);
  const form = new URLSearchParams(exchange.body);
  const cookie = await unseal(KEYS.cookie, l.cookie);
  assert.deepEqual(Object.fromEntries(form), { client_id: 'Iv1.test', client_secret: ENV.GH_CLIENT_SECRET, code: CODE, redirect_uri: `https://${HOST}/gh/callback`, code_verifier: cookie.verifier, repository_id: '1392489248' });
  for (const c of [user, repo]) {
    assert.equal(c.headers.get('authorization'), `Bearer ${TOKEN}`);
    assert.equal(c.headers.get('accept'), 'application/vnd.github+json');
    assert.equal(c.headers.get('x-github-api-version'), '2026-03-10');
    assert.equal(c.headers.get('user-agent'), USER_AGENT);
  }
  for (const c of calls) {
    assert.equal(c.redirect, 'manual', c.url);
    assert.ok(c.signal instanceof AbortSignal, c.url);
  }

  const ticket = await unseal(KEYS.handle, m[1]);
  assert.deepEqual(Object.keys(ticket).sort(), ['exp', 'iat', 'n', 'tok', 'ttl', 'typ', 'uid']);
  assert.equal(ticket.typ, 'ticket');
  assert.equal(ticket.tok, TOKEN);
  assert.equal(ticket.uid, OWNER_ID);
  assert.equal(ticket.n, N);
  assert.equal(ticket.ttl, 3600, 'min(expires_in, 3600)');
  assert.ok(ticket.iat >= before && ticket.iat <= now());
  assert.equal(ticket.exp - ticket.iat, 120);
  assert.ok(ticket.exp - now() <= 120);
  assert.ok(!JSON.stringify(ticket).includes('refresh') && !JSON.stringify(ticket).includes(REFRESH));
  assert.equal(grantCalls().length, 0);
});

test('callback: success (same tab) returns to the page of the cookie language; query values never pick the destination', async () => {
  github({ exchange: () => json({ access_token: TOKEN, expires_in: 1800, refresh_token: REFRESH }) });
  const l = await loggedIn('?lang=en&mode=tab');
  const res = await callback(l.cookie, `?code=${CODE}&state=${l.state}&lang=ko&mode=popup&n=${N}&return_to=https%3A%2F%2Fevil.example%2F&redirect_uri=https%3A%2F%2Fevil.example%2F`);
  const m = /^https:\/\/lunecid\.github\.io\/en\/game\/player-log\/\?manage#gh=([A-Za-z0-9_-]+)$/.exec(res.headers.get('location'));
  assert.ok(m, res.headers.get('location'));
  const ticket = await unseal(KEYS.handle, m[1]);
  assert.equal(ticket.n, null);
  assert.equal(ticket.ttl, 1800);
  assert.equal(new URLSearchParams(calls[0].body).get('redirect_uri'), `https://${HOST}/gh/callback`);

  calls = [];
  const p = await loggedIn();
  const res2 = await callback(p.cookie, `?code=${CODE}&state=${p.state}&lang=en&mode=tab&n=${'Z'.repeat(30)}`);
  assert.match(res2.headers.get('location'), new RegExp(`^${LINK_RETURN.replace(/[./?]/g, '\\$&')}#gh=[A-Za-z0-9_-]+&n=${N}$`));

  calls = [];
  routes = [];
  github({ exchange: () => json({ access_token: TOKEN }) });
  const q = await loggedIn();
  const res3 = await callback(q.cookie, `?code=${CODE}&state=${q.state}`);
  const t3 = await unseal(KEYS.handle, /#gh=([A-Za-z0-9_-]+)/.exec(res3.headers.get('location'))[1]);
  assert.equal(t3.ttl, 3600, 'expires_in missing → 3600');
});

test('callback: denied, missing/garbled/expired/foreign cookie and state mismatch; nothing is fetched', async () => {
  const popup = await loggedIn();
  assert.equal((await callback(popup.cookie, `?error=access_denied&state=${popup.state}`)).headers.get('location'), `${LINK_RETURN}#gh-error=denied&n=${N}`);
  const tab = await loggedIn('?lang=en&mode=tab');
  assert.equal((await callback(tab.cookie, '?error=access_denied')).headers.get('location'), `${RETURN_EN}#gh-error=denied`);
  assert.equal((await callback(null, '?error=access_denied')).headers.get('location'), `${LINK_RETURN}#gh-error=denied`);

  const otherKeys = await deriveKeys(randomBytes(32).toString('base64'));
  const cookie = await unseal(KEYS.cookie, popup.cookie);
  const expired = await seal(KEYS.cookie, { ...cookie, exp: now() - 1 });
  const foreign = await seal(otherKeys.cookie, cookie);
  const handleKeyed = await seal(KEYS.handle, cookie);
  const tampered = popup.cookie.slice(0, 20) + (popup.cookie[20] === 'A' ? 'B' : 'A') + popup.cookie.slice(21);
  for (const [label, c] of [['none', null], ['garbled', 'x'.repeat(60)], ['expired', expired], ['other key', foreign], ['handle key', handleKeyed], ['tampered', tampered], ['short', 'abc']]) {
    const res = await callback(c, `?code=${CODE}&state=${popup.state}`);
    assert.equal(res.headers.get('location'), `${LINK_RETURN}#gh-error=state`, label);
  }
  const mismatch = await callback(popup.cookie, `?code=${CODE}&state=${popup.state.slice(0, -1)}${popup.state.endsWith('A') ? 'B' : 'A'}`);
  assert.equal(mismatch.headers.get('location'), `${LINK_RETURN}#gh-error=state&n=${N}`);
  assert.equal((await callback(popup.cookie, `?code=${CODE}`)).headers.get('location'), `${LINK_RETURN}#gh-error=state&n=${N}`);
  assert.equal((await callback(popup.cookie, `?state=${popup.state}`)).headers.get('location'), `${LINK_RETURN}#gh-error=state&n=${N}`);
  assert.equal((await callback(tab.cookie, `?code=${CODE}&state=wrong`)).headers.get('location'), `${RETURN_EN}#gh-error=state`);
  assert.equal(calls.length, 0);
});

test('callback: exchange errors (200 + error, 4xx) → exchange; 5xx, a 3xx or a network failure → upstream; no grant to delete', async () => {
  const cases = [
    [() => json({ error: 'bad_verification_code', error_description: 'x' }), 'exchange'],
    [() => json({ error: 'incorrect_client_credentials' }, 401), 'exchange'],
    [() => json({ error: 'x' }, 400), 'exchange'],
    [() => json({ token_type: 'bearer' }), 'exchange'],
    [() => new Response('not json', { status: 200 }), 'exchange'],
    [() => new Response('', { status: 500 }), 'upstream'],
    [() => new Response('', { status: 502 }), 'upstream'],
    [() => new Response(null, { status: 302, headers: { location: 'https://evil.example/' } }), 'upstream'],
    [() => { throw new TypeError('network'); }, 'upstream'],
  ];
  for (const [exchange, code] of cases) {
    calls = [];
    routes = [];
    github({ exchange });
    const l = await loggedIn();
    const res = await callback(l.cookie, `?code=${CODE}&state=${l.state}`);
    assert.equal(res.headers.get('location'), `${LINK_RETURN}#gh-error=${code}&n=${N}`, String(exchange));
    assert.deepEqual(calls.map((c) => c.url), [GH_TOKEN], 'a 3xx is never followed and nothing else is called');
  }
});

test('callback: /user or repository failures delete the grant first; a stranger gets exactly one grant DELETE and not-owner', async () => {
  const run = async (opts, code, expected) => {
    calls = [];
    routes = [];
    github(opts);
    const l = await loggedIn();
    const res = await callback(l.cookie, `?code=${CODE}&state=${l.state}`);
    assert.equal(res.headers.get('location'), `${LINK_RETURN}#gh-error=${code}&n=${N}`, code);
    assert.deepEqual(calls.map((c) => `${c.method} ${c.url}`), expected, code);
  };
  const del = `DELETE ${GH_GRANT}`;
  await run({ user: () => new Response('', { status: 503 }) }, 'upstream', [`POST ${GH_TOKEN}`, `GET ${GH_USER}`, del]);
  await run({ user: () => new Response(null, { status: 301, headers: { location: 'https://evil.example/' } }) }, 'upstream', [`POST ${GH_TOKEN}`, `GET ${GH_USER}`, del]);
  await run({ user: () => { throw new TypeError('network'); } }, 'upstream', [`POST ${GH_TOKEN}`, `GET ${GH_USER}`, del]);
  await run({ user: () => json({ id: 1, login: 'someone' }) }, 'not-owner', [`POST ${GH_TOKEN}`, `GET ${GH_USER}`, del]);
  await run({ user: () => json({ id: String(OWNER_ID), login: 'Lunecid' }) }, 'not-owner', [`POST ${GH_TOKEN}`, `GET ${GH_USER}`, del]);
  await run({ user: () => json({ login: 'Lunecid' }) }, 'not-owner', [`POST ${GH_TOKEN}`, `GET ${GH_USER}`, del]);
  // not-owner: the grant DELETE is Basic client_id:client_secret with the body { access_token }.
  const [grant] = grantCalls();
  assert.equal(grant.headers.get('authorization'), `Basic ${Buffer.from(`Iv1.test:${ENV.GH_CLIENT_SECRET}`).toString('base64')}`);
  assert.deepEqual(JSON.parse(grant.body), { access_token: TOKEN });
  assert.equal(grant.headers.get('content-type'), 'application/json');
  assert.equal(grant.headers.get('accept'), 'application/vnd.github+json');
  assert.equal(grant.headers.get('x-github-api-version'), '2026-03-10');
  assert.equal(grant.headers.get('user-agent'), USER_AGENT);
  assert.equal(grant.redirect, 'manual');

  const repoSeq = [`POST ${GH_TOKEN}`, `GET ${GH_USER}`, `GET ${GH_REPO_CHECK}`, del];
  await run({ repo: () => json({ message: 'Resource not accessible by integration' }, 403) }, 'no-access', repoSeq);
  await run({ repo: () => json({ message: 'Not Found' }, 404) }, 'no-access', repoSeq);
  await run({ repo: () => new Response('', { status: 500 }) }, 'upstream', repoSeq);
  await run({ repo: () => new Response(null, { status: 302, headers: { location: 'https://evil.example/' } }) }, 'upstream', repoSeq);
  // A failing grant delete does not change the outcome.
  await run({ user: () => json({ id: 1 }), grant: () => new Response('', { status: 500 }) }, 'not-owner', [`POST ${GH_TOKEN}`, `GET ${GH_USER}`, del]);
});

test('callback: a repository check that never answers is aborted after 10 s, the grant is deleted, then upstream', async () => {
  github({
    repo: (rec) => new Promise((_, reject) => rec.signal.addEventListener('abort', () => reject(rec.signal.reason ?? new DOMException('aborted', 'AbortError')))),
  });
  const l = await loggedIn();
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const pending = callback(l.cookie, `?code=${CODE}&state=${l.state}`);
    for (let i = 0; i < 1000 && !calls.some((c) => c.url === GH_REPO_CHECK); i++) await new Promise((r) => setImmediate(r));
    const repo = calls.find((c) => c.url === GH_REPO_CHECK);
    assert.ok(repo, 'the repository check started');
    mock.timers.tick(9_999);
    assert.equal(repo.signal.aborted, false);
    mock.timers.tick(1);
    const res = await pending;
    assert.equal(repo.signal.aborted, true);
    assert.equal(res.headers.get('location'), `${LINK_RETURN}#gh-error=upstream&n=${N}`);
    assert.equal(grantCalls().length, 1);
  } finally {
    mock.timers.reset();
  }
});

test('callback: the rate-limit binding and a missing config also clear the cookie and redirect', async () => {
  github();
  const l = await loggedIn();
  const env = { ...ENV, LOGIN_RATE_LIMITER: { limit: async () => ({ success: false }) } };
  const rate = await callback(l.cookie, `?code=${CODE}&state=${l.state}`, { env });
  assert.equal(rate.headers.get('location'), `${LINK_RETURN}#gh-error=rate&n=${N}`);
  const tab = await loggedIn('?lang=en&mode=tab');
  assert.equal((await callback(tab.cookie, `?code=${CODE}&state=${tab.state}`, { env })).headers.get('location'), `${RETURN_EN}#gh-error=rate`);
  const config = await callback(l.cookie, `?code=${CODE}&state=${l.state}`, { env: { GH_CLIENT_ID: 'Iv1.test' } });
  assert.equal(config.headers.get('location'), `${LINK_RETURN}#gh-error=config`);
  assert.equal(calls.length, 0);
});

/** A 200 whose headers arrive but whose body never does. */
const stalled = () => new Response(new ReadableStream({ start() {} }), { status: 200, headers: { 'content-type': 'application/json' } });

async function runWithClock(pending, startedUrl) {
  for (let i = 0; i < 1000 && !calls.some((c) => c.url === startedUrl); i++) await new Promise((r) => setImmediate(r));
  const started = calls.find((c) => c.url === startedUrl);
  assert.ok(started, `${startedUrl} started`);
  mock.timers.tick(9_999);
  await new Promise((r) => setImmediate(r));
  assert.equal(started.signal.aborted, false);
  mock.timers.tick(1);
  return { res: await pending, started };
}

test('callback: the 10 s limit covers the response body — a stalled /user or repository body → grant DELETE, then upstream', async () => {
  const del = `DELETE ${GH_GRANT}`;
  for (const [opts, url, expected] of [
    [{ user: stalled }, GH_USER, [`POST ${GH_TOKEN}`, `GET ${GH_USER}`, del]],
    [{ repo: stalled }, GH_REPO_CHECK, [`POST ${GH_TOKEN}`, `GET ${GH_USER}`, `GET ${GH_REPO_CHECK}`, del]],
  ]) {
    calls = [];
    routes = [];
    github(opts);
    const l = await loggedIn();
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
      const { res, started } = await runWithClock(callback(l.cookie, `?code=${CODE}&state=${l.state}`), url);
      assert.equal(started.signal.aborted, true);
      assert.equal(res.headers.get('location'), `${LINK_RETURN}#gh-error=upstream&n=${N}`, url);
      assert.deepEqual(calls.map((c) => `${c.method} ${c.url}`), expected, url);
    } finally {
      mock.timers.reset();
    }
  }
  // A stalled exchange body is upstream too (no token yet, so nothing to delete).
  calls = [];
  routes = [];
  github({ exchange: stalled });
  const l = await loggedIn();
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { res } = await runWithClock(callback(l.cookie, `?code=${CODE}&state=${l.state}`), GH_TOKEN);
    assert.equal(res.headers.get('location'), `${LINK_RETURN}#gh-error=upstream&n=${N}`);
    assert.deepEqual(calls.map((c) => c.url), [GH_TOKEN]);
  } finally {
    mock.timers.reset();
  }
});

test('callback: a response body over 64 KB is upstream (the grant is deleted once a token exists)', async () => {
  const huge = () => json({ id: OWNER_ID, pad: 'p'.repeat(65_536) });
  github({ user: huge });
  const l = await loggedIn();
  const res = await callback(l.cookie, `?code=${CODE}&state=${l.state}`);
  assert.equal(res.headers.get('location'), `${LINK_RETURN}#gh-error=upstream&n=${N}`);
  assert.deepEqual(calls.map((c) => `${c.method} ${c.url}`), [`POST ${GH_TOKEN}`, `GET ${GH_USER}`, `DELETE ${GH_GRANT}`]);
  calls = [];
  routes = [];
  github({ exchange: () => json({ access_token: TOKEN, pad: 'p'.repeat(70_000) }) });
  const l2 = await loggedIn();
  const res2 = await callback(l2.cookie, `?code=${CODE}&state=${l2.state}`);
  assert.equal(res2.headers.get('location'), `${LINK_RETURN}#gh-error=upstream&n=${N}`);
  assert.deepEqual(calls.map((c) => c.url), [GH_TOKEN]);
});

test('callback: an unexpected exception after the exchange still deletes the grant, then upstream', async () => {
  github();
  const l = await loggedIn();
  // The ticket seal is the only encryption in the callback; make it throw.
  const encrypt = mock.method(crypto.subtle, 'encrypt', async () => { throw new Error('boom'); });
  try {
    const res = await callback(l.cookie, `?code=${CODE}&state=${l.state}`);
    assert.equal(res.headers.get('location'), `${LINK_RETURN}#gh-error=upstream&n=${N}`);
  } finally {
    encrypt.mock.restore();
  }
  assert.deepEqual(calls.map((c) => `${c.method} ${c.url}`), [`POST ${GH_TOKEN}`, `GET ${GH_USER}`, `GET ${GH_REPO_CHECK}`, `DELETE ${GH_GRANT}`]);
  assert.deepEqual(JSON.parse(grantCalls()[0].body), { access_token: TOKEN });
});

test('mode=tab: any n in the login query is ignored, and the ticket is redeemed without n', async () => {
  github();
  const l = await loggedIn(`?lang=ko&mode=tab&n=${N}`);
  const res = await callback(l.cookie, `?code=${CODE}&state=${l.state}`);
  const m = /^https:\/\/lunecid\.github\.io\/game\/player-log\/\?manage#gh=([A-Za-z0-9_-]+)$/.exec(res.headers.get('location'));
  assert.ok(m, res.headers.get('location'));
  assert.equal((await unseal(KEYS.handle, m[1])).n, null);
  const withN = await session({ ticket: m[1], n: N });
  assert.equal(withN.status, 401);
  const ok = await session({ ticket: m[1] });
  assert.equal(ok.status, 200);
  const raw = await ok.text();
  assert.ok(!raw.includes(TOKEN));
  assert.deepEqual(Object.keys(JSON.parse(raw)).sort(), ['expiresIn', 'handle']);
});

// ---- ticket → handle ------------------------------------------------------------------------------------------------

const ticketFor = (o = {}, key = KEYS.handle) => {
  const iat = o.iat ?? now();
  return seal(key, { typ: 'ticket', tok: TOKEN, uid: OWNER_ID, iat, ttl: 3600, n: N, exp: iat + 120, ...o });
};
const session = (body, contentType = 'application/json') =>
  post('/gh/session', { headers: contentType === null ? {} : { 'content-type': contentType }, body: typeof body === 'string' ? body : JSON.stringify(body) });

test('session: a valid ticket becomes a handle that expires at iat + ttl (≤ 60 min); the body has exactly expiresIn and handle', async () => {
  const res = await session({ ticket: await ticketFor(), n: N });
  assert.equal(res.status, 200);
  assertCors(res);
  assert.match(res.headers.get('content-type'), /^application\/json/);
  const raw = await res.text();
  assert.ok(!raw.includes(TOKEN), 'the raw access token is not in the session body');
  const body = JSON.parse(raw);
  assert.deepEqual(Object.keys(body).sort(), ['expiresIn', 'handle']);
  assert.ok(body.expiresIn <= 3600 && body.expiresIn >= 3595, String(body.expiresIn));
  const handle = await unseal(KEYS.handle, body.handle);
  assert.deepEqual(Object.keys(handle).sort(), ['exp', 'tok', 'typ', 'uid']);
  assert.equal(handle.typ, 'handle');
  assert.equal(handle.tok, TOKEN);
  assert.equal(handle.uid, OWNER_ID);

  const iat = now() - 60;
  const res2 = await session({ ticket: await ticketFor({ iat, ttl: 1800 }), n: N });
  const raw2 = await res2.text();
  assert.ok(!raw2.includes(TOKEN));
  const body2 = JSON.parse(raw2);
  const h2 = await unseal(KEYS.handle, body2.handle);
  assert.equal(h2.exp, iat + 1800);
  assert.ok(Math.abs(body2.expiresIn - (iat + 1800 - now())) <= 1);

  // The same-tab fallback has no n on either side.
  const tab = await session({ ticket: await ticketFor({ n: null }) });
  assert.equal(tab.status, 200);
  const tab2 = await session({ ticket: await ticketFor({ n: null }), n: null });
  assert.equal(tab2.status, 200);
  assert.equal(calls.length, 0);
});

test('session: expired, tampered, other-key, wrong-n, handle-typed, other-uid or over-long tickets → 401 ticket', async () => {
  const otherKeys = await deriveKeys(randomBytes(32).toString('base64'));
  const good = await ticketFor();
  const flip = (t, i) => t.slice(0, i) + (t[i] === 'A' ? 'B' : 'A') + t.slice(i + 1);
  const handle = await seal(KEYS.handle, { typ: 'handle', tok: TOKEN, uid: OWNER_ID, exp: now() + 600 });
  const cases = [
    ['expired', { ticket: await ticketFor({ iat: now() - 121 }), n: N }],
    ['exp now', { ticket: await ticketFor({ exp: now() }), n: N }],
    ['tampered iv', { ticket: flip(good, 3), n: N }],
    ['tampered body', { ticket: flip(good, 40), n: N }],
    ['tampered tag', { ticket: flip(good, good.length - 2), n: N }],
    ['truncated', { ticket: good.slice(0, 30), n: N }],
    ['other key', { ticket: await ticketFor({}, otherKeys.handle), n: N }],
    ['cookie key', { ticket: await ticketFor({}, KEYS.cookie), n: N }],
    ['wrong n', { ticket: good, n: N.slice(0, -1) + 'R' }],
    ['missing n', { ticket: good }],
    ['n on a tab ticket', { ticket: await ticketFor({ n: null }), n: N }],
    ['handle as ticket', { ticket: handle, n: N }],
    ['other uid', { ticket: await ticketFor({ uid: 1 }), n: N }],
    ['string uid', { ticket: await ticketFor({ uid: String(OWNER_ID) }), n: N }],
    ['ttl over 60 min', { ticket: await ticketFor({ ttl: 3601 }), n: N }],
    ['lifetime over 120 s', { ticket: await ticketFor({ exp: now() + 600 }), n: N }],
    ['no token', { ticket: await ticketFor({ tok: undefined }), n: N }],
    ['garbage', { ticket: 'not a ticket at all', n: N }],
    ['empty', { ticket: '', n: N }],
  ];
  for (const [label, body] of cases) {
    const res = await session(body);
    assert.equal(res.status, 401, label);
    assert.deepEqual(await res.json(), { error: 'ticket' }, label);
    assertCors(res);
  }
  assert.equal(calls.length, 0);
});

test('session: a body over 4 KB, a non-JSON content type or a malformed body → 400 invalid', async () => {
  const ticket = await ticketFor();
  const cases = [
    ['over 4 KB', { ticket, n: N, pad: 'p'.repeat(4096) }, 'application/json'],
    ['text/plain', { ticket, n: N }, 'text/plain;charset=UTF-8'],
    ['form', { ticket, n: N }, 'application/x-www-form-urlencoded'],
    ['no content type', { ticket, n: N }, null],
    ['not JSON', '{ticket:', 'application/json'],
    ['array', [ticket, N], 'application/json'],
    ['string', JSON.stringify(ticket), 'application/json'],
    ['null', 'null', 'application/json'],
    ['number ticket', { ticket: 5, n: N }, 'application/json'],
    ['number n', { ticket, n: 5 }, 'application/json'],
  ];
  for (const [label, body, type] of cases) {
    const res = await session(body, type);
    assert.equal(res.status, 400, label);
    assert.deepEqual(await res.json(), { error: 'invalid' }, label);
    assertCors(res);
  }
  const ok = await session({ ticket, n: N }, 'application/json; charset=utf-8');
  assert.equal(ok.status, 200);
});

// ---- logout ---------------------------------------------------------------------------------------------------------

test('logout: a Bearer handle or a beacon body deletes the grant once; an expired handle still does; garbage never does', async () => {
  const grant = () => route((r) => r.url === GH_GRANT && r.method === 'DELETE', () => new Response(null, { status: 204 }));
  const handle = await seal(KEYS.handle, { typ: 'handle', tok: TOKEN, uid: OWNER_ID, exp: now() + 600 });
  const expired = await seal(KEYS.handle, { typ: 'handle', tok: TOKEN, uid: OWNER_ID, exp: now() - 600 });
  const expectOne = async (res, label) => {
    assert.equal(res.status, 204, label);
    assertCors(res);
    assert.equal(await res.text(), '', label);
    const grants = grantCalls();
    assert.equal(grants.length, 1, label);
    assert.equal(grants[0].headers.get('authorization'), `Basic ${Buffer.from(`Iv1.test:${ENV.GH_CLIENT_SECRET}`).toString('base64')}`);
    assert.deepEqual(JSON.parse(grants[0].body), { access_token: TOKEN });
    assert.equal(grants[0].redirect, 'manual');
    calls = [];
  };
  grant();
  await expectOne(await post('/gh/logout', { headers: { authorization: `Bearer ${handle}` } }), 'bearer');
  await expectOne(await post('/gh/logout', { headers: { 'content-type': 'text/plain;charset=UTF-8' }, body: handle }), 'beacon');
  await expectOne(await post('/gh/logout', { headers: { authorization: `Bearer ${expired}` } }), 'expired bearer');
  await expectOne(await post('/gh/logout', { headers: { 'content-type': 'text/plain;charset=UTF-8' }, body: expired }), 'expired beacon');
  routes = [];
  route((r) => r.url === GH_GRANT, () => new Response('', { status: 500 }));
  await expectOne(await post('/gh/logout', { headers: { authorization: `Bearer ${handle}` } }), 'grant delete fails');

  const otherKeys = await deriveKeys(randomBytes(32).toString('base64'));
  const none = [
    ['garbage bearer', { headers: { authorization: 'Bearer garbage' } }],
    ['garbage beacon', { headers: { 'content-type': 'text/plain;charset=UTF-8' }, body: 'garbage' }],
    ['empty beacon', { headers: { 'content-type': 'text/plain;charset=UTF-8' }, body: '' }],
    ['basic auth', { headers: { authorization: `Basic ${handle}` } }],
    ['ticket as handle', { headers: { authorization: `Bearer ${await ticketFor()}` } }],
    ['other uid', { headers: { authorization: `Bearer ${await seal(KEYS.handle, { typ: 'handle', tok: TOKEN, uid: 1, exp: now() + 600 })}` } }],
    ['other key', { headers: { authorization: `Bearer ${await seal(otherKeys.handle, { typ: 'handle', tok: TOKEN, uid: OWNER_ID, exp: now() + 600 })}` } }],
  ];
  for (const [label, init] of none) {
    const res = await post('/gh/logout', init);
    assert.equal(res.status, 204, label);
    assertCors(res);
  }
  assert.equal(calls.length, 0, 'garbage never deletes a grant');

  const big = await post('/gh/logout', { headers: { 'content-type': 'text/plain;charset=UTF-8' }, body: handle + ' '.repeat(2048) });
  assert.equal(big.status, 400);
  assertCors(big);
  const json400 = await post('/gh/logout', { headers: { 'content-type': 'application/json' }, body: JSON.stringify({ handle }) });
  assert.equal(json400.status, 400);
  assert.equal(calls.length, 0);
});

// ---- headers --------------------------------------------------------------------------------------------------------

test('headers: every kind of response carries no-store, no-referrer and nosniff', async () => {
  github();
  const handle = await seal(KEYS.handle, { typ: 'handle', tok: TOKEN, uid: OWNER_ID, exp: now() + 600 });
  const l = await loggedIn();
  const responses = [
    await call('/health'),
    await call('/health', {}, { host: 'evil.example' }),
    await call('/nope'),
    l.res,
    await call('/gh/login?lang=fr'),
    await call(`/gh/callback?code=${CODE}&state=${l.state}`, { headers: { cookie: `__Host-gh_oauth=${l.cookie}` } }),
    await call('/gh/callback?error=access_denied'),
    await call('/gh/session', { method: 'OPTIONS', headers: { origin: ORIGIN, 'access-control-request-method': 'POST' } }),
    await call('/gh/session', { method: 'OPTIONS', headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' } }),
    await session({ ticket: await ticketFor(), n: N }),
    await session({ ticket: 'x', n: N }),
    await session('x', 'text/plain'),
    await post('/gh/logout', { headers: { authorization: `Bearer ${handle}` } }),
    await post('/gh/logout', { origin: 'https://evil.example' }),
  ];
  assert.equal(responses.length, 14);
  for (const res of responses) {
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  }
  assert.ok(logs.length > 0);
  assert.ok(logs.includes('relay: /gh/callback ok'));
  assert.ok(logs.includes('relay: /gh/session error:ticket'));
});
