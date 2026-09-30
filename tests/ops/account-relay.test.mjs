// AL-14 (account-link spec §5.7.1–5.7.5, §8.1, §8.4, §11.1): the relay Worker core. The Worker's default export is
// called directly with web-standard Request objects; every outgoing call goes to a fake globalThis.fetch that records
// { url, method, headers, body, redirect, signal } and answers with scripted Responses, so no test reaches GitHub or a
// workers.dev host. GitHub answers here are synthetic (only the fields spec §5.7.3 names), never recorded responses.
// Every secret-shaped value is a fake built at run time (Global Constraints, spec §5.7.8); SEAL_KEY is random per run.
import { afterEach, beforeEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

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
/** Every console line of the whole file (the log guard at the end reads them all). */
const allLogs = [];
/** Values that must never reach a log line: tickets, handles, openid values, variable values (added by the cases). */
const SENSITIVE = new Set();
const sensitive = (v) => (SENSITIVE.add(String(v)), v);
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
      allLogs.push(line);
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

test('routes: unknown paths and wrong methods answer 404', async () => {
  const cases = [
    ['/', 'GET'], ['/nope', 'GET'], ['/__proto__', 'GET'], ['/constructor', 'GET'], ['/health/', 'GET'], ['/HEALTH', 'GET'],
    ['/health', 'POST'], ['/gh/login', 'POST'], ['/gh/callback', 'POST'], ['/gh/session', 'GET'], ['/gh/logout', 'GET'],
    ['/gh/api', 'GET'], ['/openid/verify', 'GET'], ['/gh/api/', 'POST'], ['/openid/verify/', 'POST'], ['/gh/api/x', 'POST'],
    ['/health', 'OPTIONS'], ['/gh/login', 'OPTIONS'], ['/gh/callback', 'OPTIONS'],
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
  for (const path of ['/gh/session', '/gh/logout', '/gh/api', '/openid/verify']) {
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
    for (const path of ['/gh/session', '/gh/logout', '/gh/api', '/openid/verify']) {
      const res = await post(path, { origin, headers: { authorization: `Bearer ${handle}`, 'content-type': 'application/json' }, body: '{"op":"dispatch"}' });
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

// =====================================================================================================================
// AL-15: /gh/api (spec §5.7.3 op table), /openid/verify (spec §5.7.3 "Steam 검증"), the log guard, setup-secrets.mjs.
// GitHub and Steam answers below are synthetic (only the fields the spec names), never recorded responses.
// =====================================================================================================================

const API = 'https://api.github.com/repos/Lunecid/Lunecid.github.io';
const VARS = `${API}/actions/variables`;
const WF = `${API}/actions/workflows/deploy.yml`;
const RUNS = (s) => `${WF}/runs?status=${s}&per_page=1`;
const DISPATCH = `${WF}/dispatches`;
const RUN_URL = (id) => `https://github.com/Lunecid/Lunecid.github.io/actions/runs/${id}`;
const GH_MARK = 'GH-BODY-MARKER-9c1';

const handleFor = async (o = {}, key = KEYS.handle) => sensitive(await seal(key, { typ: 'handle', tok: TOKEN, uid: OWNER_ID, exp: now() + 600, ...o }));
const HANDLE = await handleFor();

function api(body, { handle = HANDLE, headers = {}, env, contentType = 'application/json' } = {}) {
  return post('/gh/api', {
    headers: { ...(handle === null ? {} : { authorization: `Bearer ${handle}` }), ...(contentType === null ? {} : { 'content-type': contentType }), ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
    ...(env ? { env } : {}),
  });
}

/** A synthetic GitHub answer that also carries a body marker and a GitHub header the relay must never pass on. */
const gh = (body, status = 200, headers = {}) =>
  new Response(body === null ? null : JSON.stringify(typeof body === 'object' && !Array.isArray(body) ? { ...body, note: GH_MARK } : body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'x-github-request-id': 'ABCD:1234', 'x-ratelimit-remaining': '4999', ...headers },
  });

function assertGhCall(c) {
  assert.equal(c.headers.get('authorization'), `Bearer ${TOKEN}`, c.url);
  assert.equal(c.headers.get('accept'), 'application/vnd.github+json', c.url);
  assert.equal(c.headers.get('x-github-api-version'), '2026-03-10', c.url);
  assert.equal(c.headers.get('user-agent'), USER_AGENT, c.url);
  assert.equal(c.redirect, 'manual', c.url);
  assert.ok(c.signal instanceof AbortSignal, c.url);
}

async function relayBody(res) {
  const text = await res.text();
  assert.ok(!text.includes(GH_MARK), 'no GitHub body in a relay response');
  assert.ok(!text.includes(TOKEN), 'no token in a relay response');
  assert.equal(res.headers.get('x-github-request-id'), null, 'no GitHub header in a relay response');
  assert.equal(res.headers.get('x-ratelimit-remaining'), null);
  return JSON.parse(text);
}

// ---- /gh/api: the handle and the request shape ----------------------------------------------------------------------

test('api: tampered, other-key, expired, other-uid, ticket-typed or missing handles → 401 handle, nothing fetched', async () => {
  const otherKeys = await deriveKeys(randomBytes(32).toString('base64'));
  const flip = (t, i) => t.slice(0, i) + (t[i] === 'A' ? 'B' : 'A') + t.slice(i + 1);
  const cases = [
    ['tampered', flip(HANDLE, 30)],
    ['other key', await handleFor({}, otherKeys.handle)],
    ['cookie key', await handleFor({}, KEYS.cookie)],
    ['expired', await handleFor({ exp: now() - 1 })],
    ['exp now', await handleFor({ exp: now() })],
    ['over 60 min', await handleFor({ exp: now() + 3601 })],
    ['other uid', await handleFor({ uid: 1 })],
    ['string uid', await handleFor({ uid: String(OWNER_ID) })],
    ['no token', await handleFor({ tok: '' })],
    ['ticket as handle', sensitive(await ticketFor())],
    ['garbage', 'garbage'],
    ['missing', null],
  ];
  for (const [label, handle] of cases) {
    const res = await api({ op: 'vars.list' }, { handle });
    assert.equal(res.status, 401, label);
    assert.deepEqual(await res.json(), { error: 'handle' }, label);
    assertCors(res);
  }
  for (const auth of ['Basic x', `bearer ${HANDLE}`, `Bearer ${HANDLE} x`, `Bearer  ${HANDLE}`]) {
    const res = await post('/gh/api', { headers: { authorization: auth, 'content-type': 'application/json' }, body: '{"op":"vars.list"}' });
    assert.equal(res.status, 401, auth);
  }
  assert.equal(calls.length, 0);
});

test('api: a body over 2 KB, a non-JSON content type, a malformed body → 400 invalid; unknown ops → 403 forbidden; config → 503', async () => {
  const cases = [
    [{ op: 'vars.list', pad: 'p'.repeat(2048) }, 'application/json', 400, 'invalid'],
    [{ op: 'vars.list' }, 'text/plain', 400, 'invalid'],
    [{ op: 'vars.list' }, null, 400, 'invalid'],
    ['{op:', 'application/json', 400, 'invalid'],
    ['["vars.list"]', 'application/json', 400, 'invalid'],
    ['null', 'application/json', 400, 'invalid'],
    [{}, 'application/json', 403, 'forbidden'],
    [{ op: 5 }, 'application/json', 403, 'forbidden'],
    [{ op: 'vars.drop' }, 'application/json', 403, 'forbidden'],
    [{ op: 'VARS.LIST' }, 'application/json', 403, 'forbidden'],
    [{ op: '__proto__' }, 'application/json', 403, 'forbidden'],
    [{ op: 'constructor' }, 'application/json', 403, 'forbidden'],
    [{ op: 'toString' }, 'application/json', 403, 'forbidden'],
    [{ op: 'repos.delete' }, 'application/json', 403, 'forbidden'],
  ];
  for (const [body, type, status, code] of cases) {
    const res = await api(body, { contentType: type });
    assert.equal(res.status, status, JSON.stringify(body));
    assert.deepEqual(await res.json(), { error: code });
    assertCors(res);
  }
  const config = await api({ op: 'vars.list' }, { env: { SEAL_KEY } });
  assert.equal(config.status, 503);
  assert.deepEqual(await config.json(), { error: 'config' });
  assertCors(config);
  assert.equal(calls.length, 0);
});

// ---- /gh/api: variables ---------------------------------------------------------------------------------------------

test('api vars.set: only ACCOUNT_VARS names (403), values through validateVar and looksLikeSecret (400), nothing fetched on refusal', async () => {
  const refused = [
    [{ op: 'vars.set', name: 'ACCOUNT_OTHER', value: 'x' }, 403, 'forbidden'],
    [{ op: 'vars.set', name: 'GH_PROFILE_TOKEN', value: 'x' }, 403, 'forbidden'],
    [{ op: 'vars.set', name: 'account_riot_id', value: 'Hide on bush#KR1' }, 403, 'forbidden'],
    [{ op: 'vars.set', value: 'x' }, 403, 'forbidden'],
    [{ op: 'vars.set', name: 'ACCOUNT_RIOT_ID', value: 'Hide on bush' }, 400, 'invalid'],
    [{ op: 'vars.set', name: 'ACCOUNT_RIOT_ID', value: 'Hide/on#KR1' }, 400, 'invalid'],
    [{ op: 'vars.set', name: 'ACCOUNT_GENSHIN_NAME', value: '0123456789abcdef0123456789ABCDEF' }, 400, 'invalid'],
    [{ op: 'vars.set', name: 'ACCOUNT_STEAM_NAME', value: 'ghp' + '_' + 'Z'.repeat(36) }, 400, 'invalid'],
    [{ op: 'vars.set', name: 'ACCOUNT_GENSHIN_UID', value: '012345678' }, 400, 'invalid'],
    [{ op: 'vars.set', name: 'ACCOUNT_STEAM_ID64', value: '76561197960265728' }, 400, 'invalid'],
    [{ op: 'vars.set', name: 'ACCOUNT_GENSHIN_NAME', value: 'a‮b' }, 400, 'invalid'],
    [{ op: 'vars.set', name: 'ACCOUNT_GENSHIN_NAME', value: '' }, 400, 'invalid'],
    [{ op: 'vars.set', name: 'ACCOUNT_GENSHIN_NAME', value: 5 }, 400, 'invalid'],
    [{ op: 'vars.set', name: 'ACCOUNT_GENSHIN_NAME' }, 400, 'invalid'],
    [{ op: 'vars.delete', name: 'GH_PROFILE_TOKEN' }, 403, 'forbidden'],
    [{ op: 'vars.delete' }, 403, 'forbidden'],
  ];
  for (const [body, status, code] of refused) {
    const res = await api(body);
    assert.equal(res.status, status, JSON.stringify(body));
    assert.deepEqual(await res.json(), { error: code }, JSON.stringify(body));
    assertCors(res);
  }
  assert.equal(calls.length, 0);
});

test('api vars.set: PATCH with the canonical value (204) → { ok: true }; a PATCH 404 falls back to POST (201)', async () => {
  route((r) => r.url === `${VARS}/ACCOUNT_RIOT_ID` && r.method === 'PATCH', () => new Response(null, { status: 204 }));
  const res = await api({ op: 'vars.set', name: 'ACCOUNT_RIOT_ID', value: sensitive(' Hide on bush#KR1 ') });
  assert.equal(res.status, 200);
  assertCors(res);
  assert.deepEqual(await relayBody(res), { ok: true });
  assert.equal(calls.length, 1);
  assertGhCall(calls[0]);
  assert.equal(calls[0].headers.get('content-type'), 'application/json');
  assert.deepEqual(JSON.parse(calls[0].body), { name: 'ACCOUNT_RIOT_ID', value: 'Hide on bush#KR1' });

  calls = [];
  routes = [];
  route((r) => r.url === `${VARS}/ACCOUNT_GENSHIN_UID` && r.method === 'PATCH', () => gh({ message: 'Not Found' }, 404));
  route((r) => r.url === VARS && r.method === 'POST', () => new Response(null, { status: 201 }));
  const created = await api({ op: 'vars.set', name: 'ACCOUNT_GENSHIN_UID', value: sensitive('618285856') });
  assert.equal(created.status, 200);
  assert.deepEqual(await relayBody(created), { ok: true });
  assert.deepEqual(calls.map((c) => `${c.method} ${c.url}`), [`PATCH ${VARS}/ACCOUNT_GENSHIN_UID`, `POST ${VARS}`]);
  for (const c of calls) assertGhCall(c);
  assert.deepEqual(JSON.parse(calls[1].body), { name: 'ACCOUNT_GENSHIN_UID', value: '618285856' });

  calls = [];
  routes = [];
  route((r) => r.url === `${VARS}/ACCOUNT_ZZZ_UID` && r.method === 'PATCH', () => gh({ message: 'Not Found' }, 404));
  route((r) => r.url === VARS && r.method === 'POST', () => gh({ message: 'Invalid' }, 422));
  const rejected = await api({ op: 'vars.set', name: 'ACCOUNT_ZZZ_UID', value: '1300025292' });
  assert.equal(rejected.status, 422);
  assert.deepEqual(await relayBody(rejected), { error: 'gh-rejected' });
});

test('api vars.list returns only ACCOUNT_VARS names with their values; vars.delete treats 404 as done', async () => {
  route((r) => r.url === `${VARS}?per_page=30` && r.method === 'GET', () =>
    gh({
      total_count: 5,
      variables: [
        { name: 'ACCOUNT_GENSHIN_UID', value: '618285856', created_at: '2026-09-30T00:00:00Z', updated_at: '2026-09-30T00:00:00Z' },
        { name: 'GH_PROFILE_TOKEN', value: 'looks-like-a-token-name' },
        { name: 'ACCOUNT_OTHER', value: 'x' },
        { name: 'ACCOUNT_RIOT_ID', value: 'Hide on bush#KR1' },
        { name: 'ACCOUNT_ZZZ_UID', value: 1300025292 },
        'not an object',
      ],
    }),
  );
  const res = await api({ op: 'vars.list' });
  assert.equal(res.status, 200);
  assertCors(res);
  assert.deepEqual(await relayBody(res), [{ name: 'ACCOUNT_GENSHIN_UID', value: '618285856' }, { name: 'ACCOUNT_RIOT_ID', value: 'Hide on bush#KR1' }]);
  assertGhCall(calls[0]);

  for (const status of [204, 404]) {
    calls = [];
    routes = [];
    route((r) => r.url === `${VARS}/ACCOUNT_ZZZ_NAME` && r.method === 'DELETE', () => (status === 204 ? new Response(null, { status }) : gh({ message: 'Not Found' }, status)));
    const del = await api({ op: 'vars.delete', name: 'ACCOUNT_ZZZ_NAME' });
    assert.equal(del.status, 200, String(status));
    assert.deepEqual(await relayBody(del), { ok: true });
    assert.equal(calls.length, 1);
    assertGhCall(calls[0]);
  }
  calls = [];
  routes = [];
  route((r) => r.url === `${VARS}?per_page=30`, () => new Response('not json', { status: 200 }));
  const bad = await api({ op: 'vars.list' });
  assert.equal(bad.status, 502);
  assert.deepEqual(await bad.json(), { error: 'upstream' });
});

// ---- /gh/api: workflow, dispatch, runs ------------------------------------------------------------------------------

test('api workflow.get returns { state } only', async () => {
  route((r) => r.url === WF && r.method === 'GET', () => gh({ id: 1, name: 'Deploy', path: '.github/workflows/deploy.yml', state: 'active' }));
  const res = await api({ op: 'workflow.get' });
  assert.equal(res.status, 200);
  assert.deepEqual(await relayBody(res), { state: 'active' });
  assertGhCall(calls[0]);
});

test('api dispatch: a run in progress/queued/pending → 409 busy + runId and zero dispatch requests', async () => {
  for (const [busyAt, expectedGets] of [['in_progress', 1], ['queued', 2], ['pending', 3]]) {
    calls = [];
    routes = [];
    for (const s of ['in_progress', 'queued', 'pending']) {
      route((r) => r.url === RUNS(s) && r.method === 'GET', () => gh({ total_count: s === busyAt ? 1 : 0, workflow_runs: s === busyAt ? [{ id: 4242, status: s }] : [] }));
    }
    route((r) => r.url === DISPATCH, () => new Response(null, { status: 204 }));
    const res = await api({ op: 'dispatch' });
    assert.equal(res.status, 409, busyAt);
    assertCors(res);
    assert.deepEqual(await relayBody(res), { error: 'busy', runId: 4242 });
    assert.equal(calls.filter((c) => c.url === DISPATCH).length, 0, 'no dispatch while busy');
    assert.deepEqual(calls.map((c) => c.url), ['in_progress', 'queued', 'pending'].slice(0, expectedGets).map(RUNS));
  }
});

test('api dispatch: three status queries in order, then exactly {"ref":"main"} whatever the request said; the answer is { runId, htmlUrl } or nulls', async () => {
  const answers = [
    [() => gh({ workflow_run_id: 987, run_url: `${API}/actions/runs/987`, html_url: RUN_URL(987) }), { runId: 987, htmlUrl: RUN_URL(987) }],
    [() => gh({ workflow_run_id: 988, html_url: 'https://evil.example/Lunecid/Lunecid.github.io/actions/runs/988' }), { runId: 988, htmlUrl: null }],
    [() => gh({ workflow_run_id: 989, html_url: `${RUN_URL(989)}/attempts/1` }), { runId: 989, htmlUrl: null }],
    [() => gh({ workflow_run_id: '990', html_url: RUN_URL(990) }), { runId: null, htmlUrl: RUN_URL(990) }],
    [() => new Response(null, { status: 204 }), { runId: null, htmlUrl: null }],
    [() => new Response('ok', { status: 200, headers: { 'content-type': 'text/plain' } }), { runId: null, htmlUrl: null }],
  ];
  for (const [answer, expected] of answers) {
    calls = [];
    routes = [];
    for (const s of ['in_progress', 'queued', 'pending']) route((r) => r.url === RUNS(s), () => gh({ total_count: 0, workflow_runs: [] }));
    route((r) => r.url === DISPATCH && r.method === 'POST', answer);
    const res = await api({ op: 'dispatch', ref: 'evil', inputs: { a: 1 }, return_run_details: true });
    assert.equal(res.status, 200);
    assertCors(res);
    assert.deepEqual(await relayBody(res), expected);
    assert.deepEqual(calls.map((c) => `${c.method} ${c.url}`), [`GET ${RUNS('in_progress')}`, `GET ${RUNS('queued')}`, `GET ${RUNS('pending')}`, `POST ${DISPATCH}`]);
    for (const c of calls) assertGhCall(c);
    const dispatch = calls[3];
    assert.equal(dispatch.body, '{"ref":"main"}');
    assert.deepEqual(JSON.parse(dispatch.body), { ref: 'main' });
    assert.equal(dispatch.headers.get('content-type'), 'application/json');
  }
});

test('api run.get and run.jobs: runId ^\\d{1,20}$ only; only the named fields come back', async () => {
  for (const runId of ['12a', '', '1'.repeat(21), -1, 1.5, null, '1e3', ' 12', '12/../1', true, [12]]) {
    for (const op of ['run.get', 'run.jobs']) {
      const res = await api({ op, runId });
      assert.equal(res.status, 400, `${op} ${JSON.stringify(runId)}`);
      assert.deepEqual(await res.json(), { error: 'invalid' });
    }
  }
  assert.equal(calls.length, 0);

  route((r) => r.url === `${API}/actions/runs/123` && r.method === 'GET', () => gh({ id: 123, status: 'completed', conclusion: 'success', html_url: RUN_URL(123), head_sha: 'abc', actor: { login: 'x' } }));
  route((r) => r.url === `${API}/actions/runs/123/jobs?per_page=30` && r.method === 'GET', () =>
    gh({
      total_count: 2,
      jobs: [
        { name: 'build', status: 'in_progress', conclusion: null, steps: [{ status: 'completed' }, { status: 'completed' }, { status: 'in_progress' }, { status: 'queued' }], runner_name: 'x' },
        { name: 'deploy', status: 'queued', conclusion: null },
      ],
    }),
  );
  const run = await api({ op: 'run.get', runId: '123' });
  assert.deepEqual(await relayBody(run), { status: 'completed', conclusion: 'success', htmlUrl: RUN_URL(123) });
  const jobs = await api({ op: 'run.jobs', runId: 123 });
  assert.deepEqual(await relayBody(jobs), [
    { name: 'build', status: 'in_progress', conclusion: null, stepsDone: 2, stepsTotal: 4 },
    { name: 'deploy', status: 'queued', conclusion: null, stepsDone: 0, stepsTotal: 0 },
  ]);
  for (const c of calls) assertGhCall(c);

  calls = [];
  routes = [];
  route((r) => r.url === `${API}/actions/runs/124`, () => gh({ status: 'completed', conclusion: 'failure', html_url: 'https://evil.example/' }));
  assert.deepEqual(await relayBody(await api({ op: 'run.get', runId: '124' })), { status: 'completed', conclusion: 'failure', htmlUrl: null });
});

test('api status mapping: 401 handle, 403/429 rate + retryAfter, 403 gh-perm, 422, 5xx/3xx/timeout/stalled body upstream — always with CORS', async () => {
  const listUrl = `${VARS}?per_page=30`;
  const reset = now() + 90;
  const cases = [
    [() => gh({ message: 'Bad credentials' }, 401), 401, { error: 'handle' }],
    [() => gh({ message: 'rate limit' }, 403, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(reset) }), 429, 'rate-reset'],
    [() => gh({ message: 'slow down' }, 429, { 'retry-after': '120' }), 429, { error: 'rate', retryAfter: 120 }],
    [() => gh({ message: 'secondary' }, 403, { 'retry-after': '30' }), 429, { error: 'rate', retryAfter: 30 }],
    [() => gh({ message: 'Resource not accessible by integration' }, 403), 403, { error: 'gh-perm' }],
    [() => gh({ message: 'Server Error' }, 500), 502, { error: 'upstream' }],
    [() => gh({ message: 'Bad Gateway' }, 502), 502, { error: 'upstream' }],
    [() => new Response(null, { status: 301, headers: { location: 'https://evil.example/' } }), 502, { error: 'upstream' }],
    [() => { throw new TypeError('network'); }, 502, { error: 'upstream' }],
  ];
  for (const [answer, status, expected] of cases) {
    calls = [];
    routes = [];
    route((r) => r.url === listUrl, answer);
    const res = await api({ op: 'vars.list' });
    assert.equal(res.status, status, JSON.stringify(expected));
    assertCors(res);
    const body = await relayBody(res);
    if (expected === 'rate-reset') {
      assert.deepEqual(Object.keys(body).sort(), ['error', 'retryAfter']);
      assert.equal(body.error, 'rate');
      assert.ok(body.retryAfter >= 88 && body.retryAfter <= 90, String(body.retryAfter));
    } else {
      assert.deepEqual(body, expected);
    }
    assert.equal(calls.length, 1, 'a 3xx is never followed');
  }
  // 422 is gh-rejected for variables and dispatch for the dispatch.
  calls = [];
  routes = [];
  route((r) => r.method === 'PATCH', () => gh({ message: 'Validation Failed' }, 422));
  assert.deepEqual(await relayBody(await api({ op: 'vars.set', name: 'ACCOUNT_ZZZ_NAME', value: 'SynthProxy' })), { error: 'gh-rejected' });
  calls = [];
  routes = [];
  for (const s of ['in_progress', 'queued', 'pending']) route((r) => r.url === RUNS(s), () => gh({ total_count: 0, workflow_runs: [] }));
  route((r) => r.url === DISPATCH, () => gh({ message: 'Workflow does not have workflow_dispatch trigger' }, 422));
  const d = await api({ op: 'dispatch' });
  assert.equal(d.status, 422);
  assertCors(d);
  assert.deepEqual(await relayBody(d), { error: 'dispatch' });

  // A call that never answers, and one whose body stalls, are both cut at 10 s.
  for (const answer of [(rec) => new Promise((_, reject) => rec.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))), stalled]) {
    calls = [];
    routes = [];
    route((r) => r.url === listUrl, answer);
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
      const { res } = await runWithClock(api({ op: 'vars.list' }), listUrl);
      assert.equal(res.status, 502);
      assertCors(res);
      assert.deepEqual(await res.json(), { error: 'upstream' });
    } finally {
      mock.timers.reset();
    }
  }
});

// ---- /openid/verify -------------------------------------------------------------------------------------------------

const STEAM_ID = '76561197960435530';
const STEAM_STATE = 'st' + 'A1b2C3d4E5f6G7h8I9j0kK';
const STEAM_XML = `https://steamcommunity.com/profiles/${STEAM_ID}/?xml=1`;
const OPENID_NS = 'http://specs.openid.net/auth/2.0';
/** An OpenID nonce time (whole seconds). `away` rounds away from now, so "301 s" stays at least 301 s off. */
const isoNoMs = (ms, away = 0) => new Date(away > 0 ? Math.ceil(ms / 1000) * 1000 : Math.floor(ms / 1000) * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');

/** A synthetic positive assertion (spec §5.7.3 field list; OpenID 2.0 names, fake signature). */
function steamFields(o = {}) {
  const id = `https://steamcommunity.com/openid/id/${STEAM_ID}`;
  const fields = {
    'openid.ns': OPENID_NS,
    'openid.mode': 'id_res',
    'openid.op_endpoint': 'https://steamcommunity.com/openid/login',
    'openid.claimed_id': id,
    'openid.identity': id,
    'openid.return_to': `${LINK_RETURN}?s=${STEAM_STATE}`,
    'openid.response_nonce': `${isoNoMs(Date.now())}Xy9Zsynthetic`,
    'openid.assoc_handle': '1234567890',
    'openid.signed': 'signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle',
    'openid.sig': 'c3ludGhldGlj' + 'Q'.repeat(16) + '=',
    ...o,
  };
  for (const [k, v] of Object.entries(fields)) if (v === undefined) delete fields[k];
  for (const [k, v] of Object.entries(fields)) if (k !== 'openid.mode') sensitive(v);
  return fields;
}

const steamXml = ({ id = STEAM_ID, name = '<![CDATA[Robin]]>', privacy = 'public' } = {}) =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<profile>\n\t<steamID64>${id}</steamID64>\n\t<steamID>${name}</steamID>\n\t<onlineState>offline</onlineState>\n\t<privacyState>${privacy}</privacyState>\n\t<location><![CDATA[Somewhere]]></location>\n</profile>`;

function steam({ check, xml } = {}) {
  route((r) => r.url === 'https://steamcommunity.com/openid/login' && r.method === 'POST', check ?? (() => new Response(`ns:${OPENID_NS}\nis_valid:true\n`, { status: 200, headers: { 'content-type': 'text/plain' } })));
  route((r) => r.url === STEAM_XML && r.method === 'GET', xml ?? (() => new Response(steamXml(), { status: 200, headers: { 'content-type': 'text/xml; charset=utf-8' } })));
}

function verify(fields, { handle = HANDLE, s = STEAM_STATE, env, contentType = 'application/json', raw } = {}) {
  return post('/openid/verify', {
    headers: { ...(handle === null ? {} : { authorization: `Bearer ${handle}` }), ...(contentType === null ? {} : { 'content-type': contentType }) },
    body: raw ?? JSON.stringify({ ...fields, ...(s === null ? {} : { s }) }),
    ...(env ? { env } : {}),
  });
}

test('verify: a valid assertion passes check_authentication and the profile XML → exactly { steamid, state, personaname, profilePublic }', async () => {
  steam();
  const fields = steamFields();
  const res = await verify(fields);
  assert.equal(res.status, 200);
  assertCors(res);
  const body = await res.json();
  assert.deepEqual(body, { steamid: STEAM_ID, state: STEAM_STATE, personaname: 'Robin', profilePublic: true });
  assert.deepEqual(Object.keys(body).sort(), ['personaname', 'profilePublic', 'state', 'steamid']);

  assert.deepEqual(calls.map((c) => `${c.method} ${c.url}`), ['POST https://steamcommunity.com/openid/login', `GET ${STEAM_XML}`]);
  const [check, xml] = calls;
  assert.equal(check.headers.get('content-type'), 'application/x-www-form-urlencoded');
  assert.deepEqual(Object.fromEntries(new URLSearchParams(check.body)), { ...fields, 'openid.mode': 'check_authentication' });
  assert.ok(!new URLSearchParams(check.body).has('s'));
  for (const c of [check, xml]) {
    assert.equal(c.redirect, 'manual');
    assert.ok(c.signal instanceof AbortSignal);
    assert.equal(c.headers.get('authorization'), null, 'no token goes to Steam');
    assert.equal(c.headers.get('user-agent'), USER_AGENT);
  }
});

test('verify: every single rejection (spec order) → cancel or invalid, and nothing is fetched before check_authentication', async () => {
  const id = (x) => `https://steamcommunity.com/openid/id/${x}`;
  const cases = [
    ['mode cancel', { 'openid.mode': 'cancel' }, 'cancel'],
    ['mode setup_needed', { 'openid.mode': 'setup_needed' }, 'cancel'],
    ['mode missing', { 'openid.mode': undefined }, 'cancel'],
    ['ns other', { 'openid.ns': 'http://specs.openid.net/auth/1.1' }, 'invalid'],
    ['op_endpoint other', { 'openid.op_endpoint': 'https://evil.example/openid/login' }, 'invalid'],
    ['op_endpoint http', { 'openid.op_endpoint': 'http://steamcommunity.com/openid/login' }, 'invalid'],
    ['http claimed_id', { 'openid.claimed_id': `http://steamcommunity.com/openid/id/${STEAM_ID}`, 'openid.identity': `http://steamcommunity.com/openid/id/${STEAM_ID}` }, 'invalid'],
    ['claimed_id ≠ identity', { 'openid.identity': id('76561197960435531') }, 'invalid'],
    ['claimed_id other host', { 'openid.claimed_id': `https://evil.example/openid/id/${STEAM_ID}`, 'openid.identity': `https://evil.example/openid/id/${STEAM_ID}` }, 'invalid'],
    ['SteamID offset 0', { 'openid.claimed_id': id('76561197960265728'), 'openid.identity': id('76561197960265728') }, 'invalid'],
    ['SteamID offset 2^32', { 'openid.claimed_id': id('76561202255233024'), 'openid.identity': id('76561202255233024') }, 'invalid'],
    ['SteamID trailing slash', { 'openid.claimed_id': `${id(STEAM_ID)}/`, 'openid.identity': `${id(STEAM_ID)}/` }, 'invalid'],
    ['return_to ../', { 'openid.return_to': `${LINK_RETURN}../?s=${STEAM_STATE}` }, 'invalid'],
    ['return_to %2e%2e', { 'openid.return_to': `${LINK_RETURN}%2e%2e/?s=${STEAM_STATE}` }, 'invalid'],
    ['return_to -x', { 'openid.return_to': `https://lunecid.github.io/link-return-x/?s=${STEAM_STATE}` }, 'invalid'],
    ['return_to deeper', { 'openid.return_to': `${LINK_RETURN}x/?s=${STEAM_STATE}` }, 'invalid'],
    ['return_to other origin', { 'openid.return_to': `https://evil.example/link-return/?s=${STEAM_STATE}` }, 'invalid'],
    ['return_to http', { 'openid.return_to': `http://lunecid.github.io/link-return/?s=${STEAM_STATE}` }, 'invalid'],
    ['return_to port', { 'openid.return_to': `https://lunecid.github.io:443/link-return/?s=${STEAM_STATE}` }, 'invalid'],
    ['return_to userinfo', { 'openid.return_to': `https://x@lunecid.github.io/link-return/?s=${STEAM_STATE}` }, 'invalid'],
    ['return_to hash', { 'openid.return_to': `${LINK_RETURN}?s=${STEAM_STATE}#x` }, 'invalid'],
    ['return_to no s', { 'openid.return_to': LINK_RETURN }, 'invalid'],
    ['return_to two s', { 'openid.return_to': `${LINK_RETURN}?s=${STEAM_STATE}&s=${STEAM_STATE}` }, 'invalid'],
    ['return_to not a URL', { 'openid.return_to': 'link-return' }, 'invalid'],
    ...['op_endpoint', 'claimed_id', 'identity', 'return_to', 'response_nonce', 'assoc_handle'].map((f) => [
      `signed without ${f}`,
      { 'openid.signed': 'signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle'.split(',').filter((x) => x !== f).join(',') },
      'invalid',
    ]),
    ['nonce 301 s old', { 'openid.response_nonce': `${isoNoMs(Date.now() - 301_000)}abc` }, 'invalid'],
    ['nonce 301 s ahead', { 'openid.response_nonce': `${isoNoMs(Date.now() + 301_000, 1)}abc` }, 'invalid'],
    ['nonce malformed', { 'openid.response_nonce': 'yesterday' }, 'invalid'],
    ['nonce missing', { 'openid.response_nonce': undefined }, 'invalid'],
    ['sig missing', { 'openid.sig': undefined }, 'invalid'],
  ];
  for (const [label, o, code] of cases) {
    const res = await verify(steamFields(o));
    assert.equal(res.status, 400, label);
    assert.deepEqual(await res.json(), { error: code }, label);
    assertCors(res);
  }
  assert.equal(calls.length, 0);

  // Request shape: handle, size, content type, field types.
  const shape = [
    [{ handle: null }, 401, 'handle'],
    [{ handle: sensitive(await ticketFor()) }, 401, 'handle'],
    [{ raw: JSON.stringify({ ...steamFields(), s: STEAM_STATE, pad: 'p'.repeat(4096) }) }, 400, 'invalid'],
    [{ contentType: 'text/plain' }, 400, 'invalid'],
    [{ raw: JSON.stringify({ ...steamFields(), 'openid.mode': 5 }) }, 400, 'invalid'],
    [{ raw: JSON.stringify({ ...steamFields(), extra: 'x' }) }, 400, 'invalid'],
    [{ raw: '[]' }, 400, 'invalid'],
    [{ env: { SEAL_KEY } }, 503, 'config'],
  ];
  for (const [opts, status, code] of shape) {
    const res = await verify(steamFields(), opts);
    assert.equal(res.status, status, JSON.stringify(opts).slice(0, 80));
    assert.deepEqual(await res.json(), { error: code });
    assertCors(res);
  }
  assert.equal(calls.length, 0);
});

test('verify: the popup\'s s must equal the s of the signed return_to (constant-time); a mismatch or a missing s → 400 invalid', async () => {
  for (const s of [null, '', STEAM_STATE.slice(0, -1), `${STEAM_STATE}x`, STEAM_STATE.toLowerCase(), 'Z'.repeat(STEAM_STATE.length)]) {
    const res = await verify(steamFields(), { s });
    assert.equal(res.status, 400, String(s));
    assert.deepEqual(await res.json(), { error: 'invalid' });
    assertCors(res);
  }
  assert.equal(calls.length, 0, 'nothing reaches Steam');
  steam();
  assert.equal((await verify(steamFields(), { s: STEAM_STATE })).status, 200);
});

test('verify: check_authentication must say exactly ns 2.0 and is_valid:true; Steam 403/429/5xx/timeout → steam-busy; a 3xx → invalid', async () => {
  const cases = [
    [() => new Response(`ns:${OPENID_NS}\nis_valid:false\n`), 400, 'invalid'],
    [() => new Response(`is_valid:true\n`), 400, 'invalid'],
    [() => new Response(`ns:http://specs.openid.net/auth/1.1\nis_valid:true\n`), 400, 'invalid'],
    [() => new Response(`ns:${OPENID_NS}\nis_valid:TRUE\n`), 400, 'invalid'],
    [() => new Response(`ns:${OPENID_NS}\nis_valid: true\n`), 400, 'invalid'],
    [() => new Response(`<html>is_valid:true ns:${OPENID_NS}</html>`), 400, 'invalid'],
    [() => new Response(null, { status: 302, headers: { location: 'https://evil.example/' } }), 400, 'invalid'],
    [() => new Response('', { status: 404 }), 400, 'invalid'],
    [() => new Response('', { status: 403 }), 502, 'steam-busy'],
    [() => new Response('', { status: 429 }), 502, 'steam-busy'],
    [() => new Response('', { status: 503 }), 502, 'steam-busy'],
    [() => { throw new TypeError('network'); }, 502, 'steam-busy'],
  ];
  for (const [check, status, code] of cases) {
    calls = [];
    routes = [];
    steam({ check });
    const res = await verify(steamFields());
    assert.equal(res.status, status, code);
    assert.deepEqual(await res.json(), { error: code });
    assertCors(res);
    assert.equal(calls.length, 1, 'no profile read after a failed check; a 3xx is not followed');
  }
  // CRLF line ends are fine.
  calls = [];
  routes = [];
  steam({ check: () => new Response(`ns:${OPENID_NS}\r\nis_valid:true\r\n`) });
  assert.equal((await verify(steamFields())).status, 200);

  // check_authentication is cut at 6 s.
  calls = [];
  routes = [];
  steam({ check: (rec) => new Promise((_, reject) => rec.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))) });
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const pending = verify(steamFields());
    for (let i = 0; i < 1000 && calls.length === 0; i++) await new Promise((r) => setImmediate(r));
    mock.timers.tick(5_999);
    await new Promise((r) => setImmediate(r));
    assert.equal(calls[0].signal.aborted, false);
    mock.timers.tick(1);
    const res = await pending;
    assert.equal(res.status, 502);
    assert.deepEqual(await res.json(), { error: 'steam-busy' });
  } finally {
    mock.timers.reset();
  }
});

test('verify: profile names — one CDATA layer, else the five XML entities and numeric entities; XML failure → personaname null', async () => {
  const names = [
    ['<![CDATA[Robin]]>', 'Robin'],
    ['<![CDATA[A & B]]>', 'A & B'],
    ['<![CDATA[A &amp; B]]>', 'A &amp; B'],
    ['A &amp; B', 'A & B'],
    ['&quot;q&quot; &apos;a&apos; &gt;', '"q" \'a\' >'],
    ['&#82;obin &#x52;obin', 'Robin Robin'],
    ['&amp;lt;', '&lt;'],
    ['<![CDATA[a]]b]]>', 'a]]b'],
    ['<![CDATA[  padded  ]]>', 'padded'],
    ['<![CDATA[한글 이름]]>', '한글 이름'],
  ];
  for (const [xmlName, expected] of names) {
    calls = [];
    routes = [];
    steam({ xml: () => new Response(steamXml({ name: xmlName })) });
    const res = await verify(steamFields());
    assert.equal(res.status, 200, xmlName);
    assert.equal((await res.json()).personaname, sensitive(expected), xmlName);
  }
  const failures = [
    () => new Response('', { status: 500 }),
    () => new Response(null, { status: 302, headers: { location: 'https://evil.example/' } }),
    () => { throw new TypeError('network'); },
    () => new Response(steamXml({ id: '76561197960435531' })),
    () => new Response('<response><error><![CDATA[The specified profile could not be found.]]></error></response>'),
    () => new Response(steamXml({ name: '<![CDATA[' + 'x'.repeat(65) + ']]>' })),
    () => new Response(steamXml({ name: '<![CDATA[a‮b]]>' })),
    () => new Response(steamXml({ name: '&#0;x' })),
    () => new Response(steamXml({ name: '&#x110000;' })),
    () => new Response(steamXml({ name: '' })),
    // A name that contains "</steamID>": the match stops inside the CDATA, which then has no end.
    () => new Response(steamXml({ name: '<![CDATA[a</steamID>b]]>' })),
    () => new Response(steamXml({ name: '<![CDATA[Robin' })),
    () => new Response(steamXml({ name: '<![CDATA[<b>Robin</b>]]>' })),
    () => new Response(steamXml({ name: '&lt;tag&gt;' })),
    () => new Response(steamXml({ name: '&#60;x' })),
  ];
  for (const xml of failures) {
    calls = [];
    routes = [];
    steam({ xml });
    const res = await verify(steamFields());
    assert.equal(res.status, 200, String(xml));
    const body = await res.json();
    assert.equal(body.steamid, STEAM_ID);
    assert.equal(body.state, STEAM_STATE);
    assert.equal(body.personaname, null, String(xml));
    assert.deepEqual(Object.keys(body).sort(), ['personaname', 'profilePublic', 'state', 'steamid']);
  }
  calls = [];
  routes = [];
  steam({ xml: () => new Response(steamXml({ privacy: 'private' })) });
  const priv = await (await verify(steamFields())).json();
  assert.equal(priv.profilePublic, false);
  assert.equal(priv.personaname, 'Robin');
  calls = [];
  routes = [];
  steam({ xml: () => new Response('', { status: 500 }) });
  assert.equal((await (await verify(steamFields())).json()).profilePublic, null, 'unknown when the XML fails');
});

test('verify: the optional VERIFY_RATE_LIMITER (key "verify") answers 429 rate', async () => {
  const keys = [];
  const env = { ...ENV, VERIFY_RATE_LIMITER: { limit: async ({ key }) => (keys.push(key), { success: false }) } };
  const res = await verify(steamFields(), { env });
  assert.equal(res.status, 429);
  assertCors(res);
  const body = await res.json();
  assert.equal(body.error, 'rate');
  assert.ok(Number.isInteger(body.retryAfter) && body.retryAfter > 0);
  assert.deepEqual(keys, ['verify']);
  assert.equal(calls.length, 0);
});

// ---- setup-secrets.mjs ----------------------------------------------------------------------------------------------

const setup = await import('../../workers/account-relay/setup-secrets.mjs');
const PROMPT_ID = 'GitHub App의 Client ID를 붙여 넣고 Enter를 눌러 주세요:';
const PROMPT_SECRET = 'GitHub App의 client secret을 붙여 넣고 Enter를 눌러 주세요(입력한 글자는 보이지 않습니다):';
const SETUP_DONE = '비밀 세 개를 넣었습니다. 이제 브라우저로 /health 주소를 열어 확인해 주세요.';

function setupHarness({ ids = ['Iv1.test'], secrets = [ENV.GH_CLIENT_SECRET], failAt = null, throwAt = null } = {}) {
  const h = { asked: [], hidden: [], puts: [], printed: [], randomSizes: [] };
  h.deps = {
    ask: async (prompt) => (h.asked.push(prompt), ids.shift()),
    askHidden: async (prompt) => (h.hidden.push(prompt), secrets.shift()),
    spawnPut: async (name, value) => {
      h.puts.push([name, value]);
      if (name === throwAt) throw new Error(`spawn ${name}`);
      return name === failAt ? 1 : 0;
    },
    randomBytes: (n) => (h.randomSizes.push(n), randomBytes(n)),
    print: (line) => h.printed.push(String(line)),
  };
  return h;
}

test('setup-secrets: two prompts (the secret hidden), three secret puts in order, SEAL_KEY = 32 random bytes, no value printed', async () => {
  const h = setupHarness();
  const code = await setup.runSetup(h.deps);
  assert.equal(code, 0);
  assert.deepEqual(h.asked, [PROMPT_ID]);
  assert.deepEqual(h.hidden, [PROMPT_SECRET]);
  assert.deepEqual(h.puts.map(([n]) => n), ['GH_CLIENT_ID', 'GH_CLIENT_SECRET', 'SEAL_KEY']);
  assert.equal(h.puts[0][1], 'Iv1.test');
  assert.equal(h.puts[1][1], ENV.GH_CLIENT_SECRET);
  assert.deepEqual(h.randomSizes, [32]);
  const sealKey = h.puts[2][1];
  assert.match(sealKey, /^[A-Za-z0-9+/]{43}=$/);
  assert.equal(Buffer.from(sealKey, 'base64').length, 32);
  assert.ok(h.printed.includes(SETUP_DONE));
  const out = h.printed.join('\n');
  for (const [, value] of h.puts) assert.ok(!out.includes(value), 'no value is printed');
});

test('setup-secrets: empty, spaced or multi-line answers are asked again; a failing put prints only its name and returns non-zero', async () => {
  const h = setupHarness({ ids: ['', ' ', 'Iv1 test', 'Iv1.x\nIv1.y', 'Iv1.test'], secrets: ['', `${ENV.GH_CLIENT_SECRET}\n`, ENV.GH_CLIENT_SECRET] });
  assert.equal(await setup.runSetup(h.deps), 0);
  assert.deepEqual(h.asked, Array(5).fill(PROMPT_ID));
  assert.deepEqual(h.hidden, Array(3).fill(PROMPT_SECRET));
  assert.deepEqual(h.puts.map(([, v]) => v).slice(0, 2), ['Iv1.test', ENV.GH_CLIENT_SECRET]);

  for (const failing of ['GH_CLIENT_ID', 'GH_CLIENT_SECRET', 'SEAL_KEY']) {
    for (const mode of ['code', 'throw']) {
      const f = setupHarness(mode === 'code' ? { failAt: failing } : { throwAt: failing });
      const code = await setup.runSetup(f.deps);
      assert.notEqual(code, 0, `${failing} ${mode}`);
      assert.deepEqual(f.printed, [failing], `${failing} ${mode}`);
      const order = ['GH_CLIENT_ID', 'GH_CLIENT_SECRET', 'SEAL_KEY'];
      assert.deepEqual(f.puts.map(([n]) => n), order.slice(0, order.indexOf(failing) + 1), 'stops at the first failure');
    }
  }
  // Answers that never become valid stop after a few tries without putting anything.
  const g = setupHarness({ ids: Array(20).fill('') });
  assert.notEqual(await setup.runSetup(g.deps), 0);
  assert.equal(g.puts.length, 0);
  assert.ok(g.asked.length <= 10);
  assert.deepEqual(g.printed, ['GH_CLIENT_ID']);
});

test('setup-secrets: wrangler runs as node + node_modules/wrangler/bin/wrangler.js on every platform, never npx, never a shell', async () => {
  const { join } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const here = fileURLToPath(new URL('../../workers/account-relay/', import.meta.url));
  const script = join(here, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
  for (const platform of ['win32', 'linux', 'darwin']) {
    const cmd = setup.wranglerCommand('SEAL_KEY', platform);
    assert.equal(cmd.file, process.execPath, platform);
    assert.deepEqual(cmd.args, [script, 'secret', 'put', 'SEAL_KEY'], platform);
    assert.ok(![cmd.file, ...cmd.args].some((a) => /(^|[\\/])npx(\.cmd)?$/i.test(a)), platform);
  }
  assert.equal(setup.SPAWN_OPTIONS.shell, false);
  assert.deepEqual(setup.SPAWN_OPTIONS.stdio, ['pipe', 'inherit', 'inherit']);

  // putSecret: the value goes only to the child's stdin (never argv), and the stream is ended so wrangler reads it.
  const { EventEmitter } = await import('node:events');
  const spawned = [];
  const fakeSpawn = (file, args, options) => {
    const child = new EventEmitter();
    child.stdin = new EventEmitter();
    child.stdin.written = [];
    child.stdin.end = (chunk) => {
      child.stdin.written.push(String(chunk));
      setImmediate(() => child.emit('close', 0));
    };
    spawned.push({ file, args, options, child });
    return child;
  };
  const value = 'cs' + '_' + 'y'.repeat(20);
  assert.equal(await setup.putSecret('GH_CLIENT_SECRET', value, { spawnImpl: fakeSpawn }), 0);
  assert.equal(spawned.length, 1);
  assert.equal(spawned[0].file, process.execPath);
  assert.deepEqual(spawned[0].args, [script, 'secret', 'put', 'GH_CLIENT_SECRET']);
  assert.ok(!spawned[0].args.includes(value));
  assert.equal(spawned[0].options.shell, false);
  assert.deepEqual(spawned[0].child.stdin.written, [value]);

  // A real child: stdin is delivered and closed; a non-zero exit and a spawn error are reported as non-zero.
  const echoCheck = { file: process.execPath, args: ['-e', `let d='';process.stdin.on('data',c=>d+=c).on('end',()=>process.exit(d===${JSON.stringify(value)}?0:3))`] };
  assert.equal(await setup.putSecret('GH_CLIENT_SECRET', value, { command: echoCheck }), 0);
  assert.equal(await setup.putSecret('GH_CLIENT_SECRET', 'other', { command: echoCheck }), 3);
  assert.notEqual(await setup.putSecret('X', value, { command: { file: join(here, 'no-such-binary'), args: [] } }), 0);
});

test('setup-secrets: a prompt that fails (stdin ended) stops with exit code 1 and only the name', async () => {
  const h = setupHarness();
  h.deps.ask = async () => { throw new Error('stdin closed'); };
  assert.equal(await setup.runSetup(h.deps), 1);
  assert.deepEqual(h.printed, ['GH_CLIENT_ID']);
  const k = setupHarness();
  k.deps.askHidden = async () => { throw new Error('stdin closed'); };
  assert.equal(await setup.runSetup(k.deps), 1);
  assert.deepEqual(k.printed, ['GH_CLIENT_SECRET']);
  assert.equal(h.puts.length + k.puts.length, 0);

  // The real script with a piped stdin that ends early: it exits 1 before any wrangler call, prints only the prompts
  // and the failing name, and does not echo what was typed.
  const { spawnSync } = await import('node:child_process');
  const script = fileURLToPath(new URL('../../workers/account-relay/setup-secrets.mjs', import.meta.url));
  const empty = spawnSync(process.execPath, [script], { input: '', encoding: 'utf8', timeout: 20_000 });
  assert.equal(empty.status, 1, empty.stderr);
  assert.ok(empty.stdout.includes(PROMPT_ID));
  assert.equal(empty.stdout.trim().split('\n').at(-1), 'GH_CLIENT_ID');
  const idOnly = spawnSync(process.execPath, [script], { input: 'Iv1.pipedvalue\n', encoding: 'utf8', timeout: 20_000 });
  assert.equal(idOnly.status, 1, idOnly.stderr);
  assert.ok(idOnly.stdout.includes(PROMPT_SECRET));
  assert.equal(idOnly.stdout.trim().split('\n').at(-1), 'GH_CLIENT_SECRET');
  assert.ok(!idOnly.stdout.includes('Iv1.pipedvalue'), 'typed input is not echoed');
  assert.equal(idOnly.stderr, '');
});

test('setup-secrets: Node built-ins only, no file writes, no npx, values never on argv or in a console call', () => {
  const src = read('workers/account-relay/setup-secrets.mjs');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''); // comments may explain why npx is not used
  const specifiers = [...src.matchAll(/^\s*import\s[^;]*?from\s+'([^']+)'/gm)].map((m) => m[1]);
  assert.ok(specifiers.length > 0);
  for (const s of specifiers) assert.match(s, /^node:(child_process|crypto|path|readline|stream|url)$/, s);
  assert.doesNotMatch(code, /\bnpx\b/);
  assert.doesNotMatch(code, /shell:\s*true/);
  assert.doesNotMatch(code, /writeFile|appendFile|createWriteStream|node:fs/);
  assert.doesNotMatch(code, /console\.(log|info|warn|error|debug)\(/);
  assert.match(src, /process\.argv\[1\]/, 'main() runs only behind the argv guard');
  // readline's terminal mode follows stdin only, so a redirected stdout never turns the hidden prompt into an echo.
  assert.match(code, /createInterface\(\{ input: process\.stdin, output, terminal: Boolean\(process\.stdin\.isTTY\) \}\)/);
  assert.equal(read('workers/account-relay/package.json').includes('"setup": "node setup-secrets.mjs"'), true);
});

// ---- the log guard (runs last: it reads every line the whole file produced) -----------------------------------------

test('logs: every line of the whole file is "relay: <path> ok|error:<code>" and none carries a secret, ticket, handle, code, openid value, SteamID, name or variable value', () => {
  assert.ok(allLogs.length > 100, String(allLogs.length));
  for (const line of allLogs) assert.match(line, LOG_LINE);
  const joined = allLogs.join('\n');
  const never = [ENV.GH_CLIENT_SECRET, SEAL_KEY, TOKEN, REFRESH, CODE, N, STEAM_ID, STEAM_STATE, 'Robin', 'Hide on bush', '618285856', '1300025292', 'SynthProxy', 'openid.', 'steamcommunity', ...SENSITIVE];
  for (const value of never) if (value.length >= 4) assert.ok(!joined.includes(value), value.slice(0, 12));
  for (const path of ['/gh/api', '/openid/verify']) assert.ok(allLogs.some((l) => l.startsWith(`relay: ${path} `)), path);
  assert.ok(allLogs.includes('relay: /gh/api error:busy'));
  assert.ok(allLogs.includes('relay: /openid/verify error:steam-busy'));
});
