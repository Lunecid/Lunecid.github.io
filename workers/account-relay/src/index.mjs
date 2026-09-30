// The account relay Worker (account-link spec §5.7): finishes the owner's GitHub login, hands the site a sealed
// short-lived handle, and (AL-15) forwards only allow-listed GitHub calls and verifies Steam logins. Stateless: no KV,
// Durable Object or D1. Web-standard APIs only (Request, Response, fetch, URL, crypto.subtle, AbortController), no
// cloudflare:* import, so tests/ops/account-relay.test.mjs calls this default export directly under Node.
// Every destination and every Location is a code constant or derived from the one allowed host; nothing in a request
// picks where the Worker sends anything. Logs are only "relay: <path> ok|error:<code>" (spec §5.7.5).

// The ID rules are shared with the site and the fetch job (import-free TypeScript; wrangler's esbuild bundles it, Node
// strips the types). /gh/api and /openid/verify re-check every value with them; they are never copied here.
import { ACCOUNT_VARS, looksLikeSecret, normalize, parseSteamId64, validateVar } from '../../../src/lib/account-ids.ts';
import { b64url, ctEqual, deriveKeys, randomToken, seal, unseal } from './seal.mjs';
import { originAllowed, preflight, secure, withCors } from './cors.mjs';

export { deriveKeys, seal, unseal };

// ---- constants (spec §5.7.2; pinned by the tests) -------------------------------------------------------------------

export const SITE_ORIGIN = 'https://lunecid.github.io';
export const OWNER_ID = 145949817;
export const REPO = 'Lunecid/Lunecid.github.io';
export const REPO_ID = 1392489248;
export const WORKFLOW = 'deploy.yml';
export const REF = 'main';
export const RETURN_PAGES = Object.freeze({ ko: 'https://lunecid.github.io/game/player-log/?manage', en: 'https://lunecid.github.io/en/game/player-log/?manage' });
export const STEAM_OP = 'https://steamcommunity.com/openid/login';
export const LINK_RETURN = 'https://lunecid.github.io/link-return/';
export const HOST_RE = /^account-relay\.[a-z0-9-]+\.workers\.dev$/;
export const GH_API_VERSION = '2026-03-10';
export const USER_AGENT = 'lunecid-account-relay/1.0 (+https://lunecid.github.io)';
export const TICKET_TTL = 120;
export const HANDLE_MAX = 3600;
export const COOKIE = '__Host-gh_oauth';
export const COOKIE_TTL = 600;

const OWNER_LOGIN = REPO.split('/')[0];
const GH_AUTHORIZE = 'https://github.com/login/oauth/authorize';
const GH_TOKEN = 'https://github.com/login/oauth/access_token';
const GH_API = 'https://api.github.com';
const FETCH_TIMEOUT_MS = 10_000;
const UPSTREAM_BODY_MAX = 65_536;
const SESSION_BODY_MAX = 4096;
const LOGOUT_BODY_MAX = 2048;
const API_BODY_MAX = 2048;
const VERIFY_BODY_MAX = 4096;
const STEAM_TIMEOUT_MS = 6_000;
const RETRY_DEFAULT = 60;
const RETRY_MAX = 86_400;
const RUN_ID_RE = /^\d{1,20}$/;
const RUN_URL_RE = /^https:\/\/github\.com\/Lunecid\/Lunecid\.github\.io\/actions\/runs\/\d+$/;
const ENUM_RE = /^[a-z_]{1,40}$/;
const JOB_NAME_MAX = 100;
const BUSY_STATUSES = ['in_progress', 'queued', 'pending'];
const OPENID_NS = 'http://specs.openid.net/auth/2.0';
const STEAM_ID_URL_RE = /^https:\/\/steamcommunity\.com\/openid\/id\/(7656119\d{10})$/;
const SIGNED_REQUIRED = ['op_endpoint', 'claimed_id', 'identity', 'return_to', 'response_nonce', 'assoc_handle'];
const NONCE_RE = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ)/;
const NONCE_SKEW_MS = 300_000;
const STEAM_STATE_RE = /^[A-Za-z0-9_-]{16,128}$/;
const N_RE = /^[A-Za-z0-9_-]{22,64}$/;
const TOKEN_RE = /^[\x21-\x7e]{1,1024}$/;
const COOKIE_ATTRS = 'Path=/; Secure; HttpOnly; SameSite=Lax';
const CLEAR_COOKIE = `${COOKIE}=; Max-Age=0; ${COOKIE_ATTRS}`;

// ---- small helpers --------------------------------------------------------------------------------------------------

const te = new TextEncoder();
const nowSec = () => Math.floor(Date.now() / 1000);
const done = (res, error = null) => ({ res, error });

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}

const fail = (status, code) => done(json(status, { error: code }), code);

function redirect(location) {
  return new Response(null, { status: 302, headers: { Location: location } });
}

function log(path, error) {
  console.log(`relay: ${path} ${error === null ? 'ok' : `error:${error}`}`);
}

/** The media type of the request body, lower-cased, without parameters ('' when absent). */
function mediaType(request) {
  return (request.headers.get('Content-Type') ?? '').split(';')[0].trim().toLowerCase();
}

/** Reads at most `max` bytes of UTF-8 text; null when larger or not valid UTF-8. */
async function readBody(request, max) {
  const declared = request.headers.get('Content-Length');
  if (declared !== null && !(Number(declared) <= max)) return null;
  if (request.body === null) return '';
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done: end, value } = await reader.read();
    if (end) break;
    size += value.byteLength;
    if (size > max) {
      reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  try {
    const all = new Uint8Array(size);
    let at = 0;
    for (const c of chunks) {
      all.set(c, at);
      at += c.byteLength;
    }
    return new TextDecoder('utf-8', { fatal: true }).decode(all);
  } catch {
    return null;
  }
}

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

// ---- configuration --------------------------------------------------------------------------------------------------

let keyCache = { source: null, keys: null };

/** The three secrets, or null when any is missing or SEAL_KEY is not base64 of 32 bytes (closed, spec §5.7.2). */
async function loadConfig(env) {
  const clientId = env?.GH_CLIENT_ID;
  const clientSecret = env?.GH_CLIENT_SECRET;
  const sealKey = env?.SEAL_KEY;
  if (![clientId, clientSecret, sealKey].every((v) => typeof v === 'string' && v !== '')) return null;
  if (keyCache.source !== sealKey) {
    try {
      keyCache = { source: sealKey, keys: await deriveKeys(sealKey) };
    } catch {
      return null;
    }
  }
  return { clientId, clientSecret, keys: keyCache.keys };
}

/** The optional rate-limit binding (OQ-12): used only when present; an error in the binding does not lock the owner out. */
async function rateAllowed(limiter, key) {
  if (!limiter || typeof limiter.limit !== 'function') return true;
  try {
    const out = await limiter.limit({ key });
    return out?.success !== false;
  } catch {
    return true;
  }
}

// ---- outgoing calls -------------------------------------------------------------------------------------------------

/**
 * One outgoing call. The 10 s limit covers the whole exchange, response body included: the body is read here under
 * the same timer, capped at 64 KB. Redirects are never followed (`redirect: 'manual'`, DV-12) and their bodies are not
 * read: the caller treats any 3xx as upstream. Returns { status, headers, text } (text null for a 3xx), or null on a
 * network failure, the timeout, or a body over the cap. Callers read only named headers and never pass any on.
 */
async function upstream(url, init, timeoutMs = FETCH_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let reader = null;
  try {
    const res = await fetch(url, { ...init, redirect: 'manual', signal: ctrl.signal });
    if (isRedirect(res) || res.body === null) {
      res.body?.cancel().catch(() => {});
      return { status: res.status, headers: res.headers, text: isRedirect(res) ? null : '' };
    }
    const aborted = new Promise((_, reject) => {
      if (ctrl.signal.aborted) reject(new Error('timeout'));
      ctrl.signal.addEventListener('abort', () => reject(new Error('timeout')), { once: true });
    });
    aborted.catch(() => {});
    reader = res.body.getReader();
    const chunks = [];
    let size = 0;
    for (;;) {
      const { done: end, value } = await Promise.race([reader.read(), aborted]);
      if (end) break;
      size += value.byteLength;
      if (size > UPSTREAM_BODY_MAX) return null;
      chunks.push(value);
    }
    reader = null;
    const all = new Uint8Array(size);
    let at = 0;
    for (const c of chunks) {
      all.set(c, at);
      at += c.byteLength;
    }
    return { status: res.status, headers: res.headers, text: new TextDecoder().decode(all) };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    reader?.cancel().catch(() => {});
  }
}

function isRedirect(res) {
  return res.status >= 300 && res.status < 400;
}

function parseJson(text) {
  try {
    return typeof text === 'string' ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

function ghHeaders(token) {
  return { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': GH_API_VERSION, 'User-Agent': USER_AGENT, Authorization: `Bearer ${token}` };
}

/** DELETE /applications/{client_id}/grant: revokes every token of this app for the user. The outcome is not reported. */
async function deleteGrant(cfg, token) {
  let basic;
  try {
    basic = btoa(`${cfg.clientId}:${cfg.clientSecret}`);
  } catch {
    return;
  }
  await upstream(`${GH_API}/applications/${encodeURIComponent(cfg.clientId)}/grant`, {
    method: 'DELETE',
    headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': GH_API_VERSION, 'User-Agent': USER_AGENT, Authorization: `Basic ${basic}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ access_token: token }),
  });
}

// ---- where a login error goes (spec §5.7.3 "오류 이동 주소") -----------------------------------------------------------

/** `back` is the checked login query or the readable cookie; null when neither is known. */
function errorLocation(back, code) {
  if (back === null) return `${LINK_RETURN}#gh-error=${code}`;
  if (back.mode === 'tab') return `${RETURN_PAGES[back.lang === 'en' ? 'en' : 'ko']}#gh-error=${code}`;
  return `${LINK_RETURN}#gh-error=${code}&n=${back.n}`;
}

/** The login cookie, when it unseals, has the right shape and has not expired; otherwise null. */
async function readCookie(request, key) {
  const header = request.headers.get('Cookie') ?? '';
  let value = null;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === COOKIE) value = part.slice(i + 1).trim();
  }
  if (!value) return null;
  const c = await unseal(key, value);
  if (!isObject(c)) return null;
  if (typeof c.state !== 'string' || typeof c.verifier !== 'string' || !Number.isSafeInteger(c.exp) || c.exp <= nowSec()) return null;
  if (c.lang !== 'ko' && c.lang !== 'en') return null;
  if (c.mode === 'popup' ? !(typeof c.n === 'string' && N_RE.test(c.n)) : c.mode !== 'tab' || c.n !== null) return null;
  return c;
}

// ---- endpoints ------------------------------------------------------------------------------------------------------

async function health(request, env) {
  return done(json(200, { ok: true, configured: (await loadConfig(env)) !== null }));
}

/** GET /gh/login?lang=ko|en&n=<nonce>[&mode=tab] → 302 to GitHub with state and PKCE; the cookie holds both, sealed. */
async function login(request, env, url) {
  const q = url.searchParams;
  const lang = q.get('lang');
  const mode = q.get('mode');
  const tab = mode === 'tab';
  // The same-tab fallback carries no nonce: any n is ignored there, so its ticket is redeemed without one.
  const n = tab ? null : q.get('n');
  if ((lang !== 'ko' && lang !== 'en') || (mode !== null && !tab) || (!tab && (n === null || !N_RE.test(n)))) {
    return done(redirect(errorLocation(null, 'state')), 'state');
  }
  const back = { lang, n, mode: tab ? 'tab' : 'popup' };
  if (!(await rateAllowed(env?.LOGIN_RATE_LIMITER, 'login'))) return done(redirect(errorLocation(back, 'rate')), 'rate');
  const cfg = await loadConfig(env);
  if (cfg === null) return done(redirect(errorLocation(back, 'config')), 'config');

  const state = randomToken(32);
  const verifier = randomToken(32);
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', te.encode(verifier))));
  const cookie = await seal(cfg.keys.cookie, { state, verifier, lang, n, mode: back.mode, exp: nowSec() + COOKIE_TTL });
  const target = new URL(GH_AUTHORIZE);
  target.search = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: new URL('/gh/callback', request.url).href,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    login: OWNER_LOGIN,
    allow_signup: 'false',
  }).toString();
  const res = redirect(target.href);
  res.headers.append('Set-Cookie', `${COOKIE}=${cookie}; Max-Age=${COOKIE_TTL}; ${COOKIE_ATTRS}`);
  return done(res);
}

/** GET /gh/callback?code&state: the spec's "콜백 순서" 0–8. Every response clears the login cookie first. */
async function callback(request, env, url) {
  let back = null;
  let cfg = null;
  let token = null; // outer scope: any failure after a successful exchange deletes the grant, the catch-all included
  const finish = (location, error = null) => {
    const res = redirect(location);
    res.headers.append('Set-Cookie', CLEAR_COOKIE);
    return done(res, error);
  };
  const failTo = (code) => finish(errorLocation(back, code), code);
  const revokeAndFail = async (code) => {
    const t = token;
    token = null;
    if (t !== null) await deleteGrant(cfg, t);
    return failTo(code);
  };
  try {
    cfg = await loadConfig(env);
    if (cfg === null) return failTo('config');
    back = await readCookie(request, cfg.keys.cookie);
    if (!(await rateAllowed(env?.LOGIN_RATE_LIMITER, 'login'))) return failTo('rate');
    const q = url.searchParams;
    // 1. The user cancelled (or GitHub refused) the authorization.
    if (q.has('error')) return failTo('denied');
    // 2. The cookie and its state.
    const state = q.get('state');
    const code = q.get('code');
    if (back === null || state === null || !ctEqual(back.state, state) || !code) return failTo('state');

    // 3. The token exchange (PKCE, the single registered callback, the one repository).
    const exchange = await upstream(GH_TOKEN, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT },
      body: new URLSearchParams({
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        code,
        redirect_uri: new URL('/gh/callback', request.url).href,
        code_verifier: back.verifier,
        repository_id: String(REPO_ID),
      }).toString(),
    });
    if (exchange === null || isRedirect(exchange) || exchange.status >= 500) return failTo('upstream');
    if (exchange.status !== 200) return failTo('exchange');
    const grant = parseJson(exchange.text);
    if (!isObject(grant) || grant.error !== undefined || typeof grant.access_token !== 'string' || !TOKEN_RE.test(grant.access_token)) return failTo('exchange');
    token = grant.access_token; // 6. refresh_token is dropped here: never stored, never passed on.
    const ttl = Number.isFinite(grant.expires_in) && grant.expires_in > 0 ? Math.min(Math.floor(grant.expires_in), HANDLE_MAX) : HANDLE_MAX;

    // 4. The owner, by numeric id.
    const user = await upstream(`${GH_API}/user`, { headers: ghHeaders(token) });
    const who = user !== null && user.status === 200 ? parseJson(user.text) : null;
    if (who === null) return revokeAndFail('upstream');
    if (!isObject(who) || who.id !== OWNER_ID) return revokeAndFail('not-owner');

    // 5. The app is installed on the repository with the variables permission.
    const repo = await upstream(`${GH_API}/repos/${REPO}/actions/variables?per_page=1`, { headers: ghHeaders(token) });
    if (repo === null || isRedirect(repo) || repo.status >= 500) return revokeAndFail('upstream');
    if (repo.status !== 200) return revokeAndFail('no-access');

    // 7. The ticket (120 s); 8. the fixed return address, chosen from the cookie only.
    const iat = nowSec();
    const ticket = await seal(cfg.keys.handle, { typ: 'ticket', tok: token, uid: OWNER_ID, iat, ttl, n: back.n, exp: iat + TICKET_TTL });
    token = null;
    return back.mode === 'tab' ? finish(`${RETURN_PAGES[back.lang]}#gh=${ticket}`) : finish(`${LINK_RETURN}#gh=${ticket}&n=${back.n}`);
  } catch {
    try {
      return await revokeAndFail('upstream');
    } catch {
      return failTo('upstream');
    }
  }
}

function validTicket(t, now) {
  return (
    isObject(t) && t.typ === 'ticket' && t.uid === OWNER_ID && typeof t.tok === 'string' && t.tok !== '' &&
    Number.isSafeInteger(t.iat) && Number.isSafeInteger(t.ttl) && t.ttl > 0 && t.ttl <= HANDLE_MAX &&
    Number.isSafeInteger(t.exp) && t.exp > now && t.exp <= t.iat + TICKET_TTL &&
    (t.n === null || typeof t.n === 'string')
  );
}

/** POST /gh/session { ticket, n } → { handle, expiresIn }: the handle lives until the ticket's iat + ttl (≤ 60 min). */
async function session(request, env) {
  const cfg = await loadConfig(env);
  if (cfg === null) return fail(503, 'config');
  if (mediaType(request) !== 'application/json') return fail(400, 'invalid');
  const text = await readBody(request, SESSION_BODY_MAX);
  if (text === null) return fail(400, 'invalid');
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return fail(400, 'invalid');
  }
  if (!isObject(body) || typeof body.ticket !== 'string') return fail(400, 'invalid');
  const n = body.n ?? null;
  if (n !== null && typeof n !== 'string') return fail(400, 'invalid');

  const now = nowSec();
  const t = await unseal(cfg.keys.handle, body.ticket);
  if (!validTicket(t, now)) return fail(401, 'ticket');
  const nOk = t.n === null ? n === null : n !== null && ctEqual(t.n, n);
  if (!nOk) return fail(401, 'ticket');
  const exp = t.iat + t.ttl;
  if (exp <= now) return fail(401, 'ticket');
  const handle = await seal(cfg.keys.handle, { typ: 'handle', tok: t.tok, uid: t.uid, exp });
  return done(json(200, { handle, expiresIn: exp - now }));
}

/**
 * POST /gh/logout: the handle in `Authorization: Bearer`, or as a text/plain body (navigator.sendBeacon). Deletes the
 * grant whenever the handle unseals, even after it expired (the token inside lives longer). Always 204 for a
 * well-formed request; nothing is deleted for a handle that does not unseal.
 */
async function logout(request, env) {
  const cfg = await loadConfig(env);
  if (cfg === null) return fail(503, 'config');
  let token;
  const auth = request.headers.get('Authorization');
  if (auth !== null) {
    token = /^Bearer ([A-Za-z0-9_-]{1,4096})$/.exec(auth)?.[1] ?? '';
  } else if (mediaType(request) === 'text/plain') {
    const text = await readBody(request, LOGOUT_BODY_MAX);
    if (text === null) return fail(400, 'invalid');
    token = text.trim();
  } else {
    return fail(400, 'invalid');
  }
  const h = token === '' ? null : await unseal(cfg.keys.handle, token);
  const usable = isObject(h) && h.typ === 'handle' && h.uid === OWNER_ID && typeof h.tok === 'string' && h.tok !== '';
  if (usable) await deleteGrant(cfg, h.tok);
  return done(new Response(null, { status: 204 }), usable ? null : 'handle');
}

// ---- /gh/api (spec §5.7.3 op table) ---------------------------------------------------------------------------------

/** The handle from `Authorization: Bearer`, when it unseals as an owner handle that has not expired; otherwise null. */
async function readHandle(request, cfg) {
  const m = /^Bearer ([A-Za-z0-9_-]{1,4096})$/.exec(request.headers.get('Authorization') ?? '');
  if (m === null) return null;
  const h = await unseal(cfg.keys.handle, m[1]);
  const now = nowSec();
  const ok = isObject(h) && h.typ === 'handle' && h.uid === OWNER_ID && typeof h.tok === 'string' && h.tok !== '' &&
    Number.isSafeInteger(h.exp) && h.exp > now && h.exp <= now + HANDLE_MAX;
  return ok ? h : null;
}

/** A JSON object body of at most `max` bytes, or null. */
async function readJsonObject(request, max) {
  if (mediaType(request) !== 'application/json') return null;
  const text = await readBody(request, max);
  if (text === null) return null;
  try {
    const body = JSON.parse(text);
    return isObject(body) ? body : null;
  } catch {
    return null;
  }
}

/** One GitHub REST call on the one repository. `body` is serialised here; the path is built from constants and checked values. */
function ghRepo(token, method, path, body) {
  const headers = ghHeaders(token);
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  return upstream(`${GH_API}/repos/${REPO}${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

const is2xx = (r) => r !== null && r.status >= 200 && r.status < 300;
const enumOrNull = (v) => (typeof v === 'string' && ENUM_RE.test(v) ? v : null);

/** Seconds until GitHub accepts calls again: Retry-After, else x-ratelimit-reset, else a minute. */
function retryAfter(headers) {
  const ra = headers?.get('retry-after') ?? '';
  let s = RETRY_DEFAULT;
  if (/^\d{1,9}$/.test(ra)) s = Number(ra);
  else {
    const reset = headers?.get('x-ratelimit-reset') ?? '';
    if (/^\d{1,12}$/.test(reset)) s = Number(reset) - nowSec();
  }
  return Math.min(Math.max(s, 1), RETRY_MAX);
}

const rateLimited = (seconds) => done(json(429, { error: 'rate', retryAfter: seconds }), 'rate');

/** GitHub status → the fixed codes (spec §5.7.3). Bodies and headers of GitHub never reach the page. */
function ghFailure(r, on422 = 'gh-rejected') {
  if (r === null || isRedirect(r) || r.status >= 500) return fail(502, 'upstream');
  if (r.status === 401) return fail(401, 'handle');
  if (r.status === 429 || (r.status === 403 && (r.headers.get('x-ratelimit-remaining') === '0' || r.headers.has('retry-after')))) return rateLimited(retryAfter(r.headers));
  if (r.status === 403) return fail(403, 'gh-perm');
  if (r.status === 422) return fail(422, on422);
  return fail(502, 'upstream');
}

/** A 200 JSON object from GitHub, or null. */
const ghObject = (r) => {
  if (r === null || r.status !== 200) return null;
  const body = parseJson(r.text);
  return isObject(body) ? body : null;
};

const accountVar = (name) => typeof name === 'string' && ACCOUNT_VARS.includes(name);

function runIdOf(v) {
  if (typeof v === 'number') return Number.isSafeInteger(v) && v >= 0 ? String(v) : null;
  return typeof v === 'string' && RUN_ID_RE.test(v) ? v : null;
}

async function opVarsList(token) {
  const r = await ghRepo(token, 'GET', '/actions/variables?per_page=30');
  if (r === null || r.status !== 200) return ghFailure(r);
  const body = ghObject(r);
  if (body === null || !Array.isArray(body.variables)) return fail(502, 'upstream');
  const list = body.variables
    .filter((v) => isObject(v) && accountVar(v.name) && typeof v.value === 'string')
    .map((v) => ({ name: v.name, value: v.value }));
  return done(json(200, list));
}

async function opVarsSet(token, args) {
  if (!accountVar(args.name)) return fail(403, 'forbidden');
  if (typeof args.value !== 'string' || looksLikeSecret(args.value)) return fail(400, 'invalid');
  const check = validateVar(args.name, args.value);
  if (!check.ok) return fail(400, 'invalid');
  const variable = { name: args.name, value: check.value };
  const patch = await ghRepo(token, 'PATCH', `/actions/variables/${args.name}`, variable);
  if (is2xx(patch)) return done(json(200, { ok: true }));
  if (patch === null || patch.status !== 404) return ghFailure(patch);
  const create = await ghRepo(token, 'POST', '/actions/variables', variable);
  return is2xx(create) ? done(json(200, { ok: true })) : ghFailure(create);
}

async function opVarsDelete(token, args) {
  if (!accountVar(args.name)) return fail(403, 'forbidden');
  const r = await ghRepo(token, 'DELETE', `/actions/variables/${args.name}`);
  return is2xx(r) || r?.status === 404 ? done(json(200, { ok: true })) : ghFailure(r);
}

async function opWorkflowGet(token) {
  const r = await ghRepo(token, 'GET', `/actions/workflows/${WORKFLOW}`);
  if (r === null || r.status !== 200) return ghFailure(r);
  const body = ghObject(r);
  return body === null ? fail(502, 'upstream') : done(json(200, { state: enumOrNull(body.state) }));
}

/** No arguments: the body is exactly {"ref":"main"}, built here (spec §4.5); refused while a run is in progress. */
async function opDispatch(token) {
  for (const status of BUSY_STATUSES) {
    const r = await ghRepo(token, 'GET', `/actions/workflows/${WORKFLOW}/runs?status=${status}&per_page=1`);
    if (r === null || r.status !== 200) return ghFailure(r, 'dispatch');
    const body = ghObject(r);
    if (body === null || !Array.isArray(body.workflow_runs)) return fail(502, 'upstream');
    if (body.workflow_runs.length > 0) {
      const id = body.workflow_runs[0]?.id;
      return done(json(409, { error: 'busy', runId: Number.isSafeInteger(id) && id > 0 ? id : null }), 'busy');
    }
  }
  const r = await ghRepo(token, 'POST', `/actions/workflows/${WORKFLOW}/dispatches`, { ref: REF });
  if (!is2xx(r)) return ghFailure(r, 'dispatch');
  const body = r.status === 200 ? parseJson(r.text) : null;
  const runId = isObject(body) && Number.isSafeInteger(body.workflow_run_id) && body.workflow_run_id > 0 ? body.workflow_run_id : null;
  const htmlUrl = isObject(body) && typeof body.html_url === 'string' && RUN_URL_RE.test(body.html_url) ? body.html_url : null;
  return done(json(200, { runId, htmlUrl }));
}

async function opRunGet(token, args) {
  const id = runIdOf(args.runId);
  if (id === null) return fail(400, 'invalid');
  const r = await ghRepo(token, 'GET', `/actions/runs/${id}`);
  if (r === null || r.status !== 200) return ghFailure(r);
  const body = ghObject(r);
  if (body === null) return fail(502, 'upstream');
  const htmlUrl = typeof body.html_url === 'string' && RUN_URL_RE.test(body.html_url) ? body.html_url : null;
  return done(json(200, { status: enumOrNull(body.status), conclusion: enumOrNull(body.conclusion), htmlUrl }));
}

async function opRunJobs(token, args) {
  const id = runIdOf(args.runId);
  if (id === null) return fail(400, 'invalid');
  const r = await ghRepo(token, 'GET', `/actions/runs/${id}/jobs?per_page=30`);
  if (r === null || r.status !== 200) return ghFailure(r);
  const body = ghObject(r);
  if (body === null || !Array.isArray(body.jobs)) return fail(502, 'upstream');
  const jobs = body.jobs.filter(isObject).map((j) => {
    const steps = Array.isArray(j.steps) ? j.steps.filter(isObject) : [];
    return {
      name: typeof j.name === 'string' ? j.name.slice(0, JOB_NAME_MAX) : '',
      status: enumOrNull(j.status),
      conclusion: enumOrNull(j.conclusion),
      stepsDone: steps.filter((s) => s.status === 'completed').length,
      stepsTotal: steps.length,
    };
  });
  return done(json(200, jobs));
}

/** The only operations the relay performs for the page (spec §5.7.3); anything else is 403 forbidden. */
const OPS = new Map([
  ['vars.list', opVarsList],
  ['vars.set', opVarsSet],
  ['vars.delete', opVarsDelete],
  ['workflow.get', opWorkflowGet],
  ['dispatch', opDispatch],
  ['run.get', opRunGet],
  ['run.jobs', opRunJobs],
]);

/** POST /gh/api { op, ...args }, `Authorization: Bearer <handle>`, JSON ≤ 2 KB. */
async function ghApi(request, env) {
  const cfg = await loadConfig(env);
  if (cfg === null) return fail(503, 'config');
  const h = await readHandle(request, cfg);
  if (h === null) return fail(401, 'handle');
  const body = await readJsonObject(request, API_BODY_MAX);
  if (body === null) return fail(400, 'invalid');
  const op = typeof body.op === 'string' ? OPS.get(body.op) : undefined;
  if (op === undefined) return fail(403, 'forbidden');
  return op(h.tok, body);
}

// ---- /openid/verify (spec §5.7.3 "Steam 검증") -------------------------------------------------------------------------

/** The `s` of a return_to whose origin and path are exactly LINK_RETURN and whose only query key is `s`; otherwise null. */
function returnToState(raw) {
  if (typeof raw !== 'string') return null;
  let u;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (`${u.origin}${u.pathname}` !== LINK_RETURN || u.username !== '' || u.password !== '' || u.hash !== '') return null;
  if (raw !== `${LINK_RETURN}${u.search}`) return null; // no normalisation (port, dot segments, escapes) is accepted
  const keys = [...u.searchParams.keys()];
  const s = u.searchParams.get('s');
  return keys.length === 1 && keys[0] === 's' && s !== null && STEAM_STATE_RE.test(s) ? s : null;
}

const XML_NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/**
 * <steamID> text: one CDATA layer stripped, else the five XML entities and numeric entities decoded; then normalize.
 * A CDATA start without its end (the match stopped at a "</steamID>" inside the name) or any "<" left in the result
 * gives null: the name is then typed by the owner instead.
 */
function steamName(raw) {
  let text;
  if (raw.startsWith('<![CDATA[')) {
    if (!raw.endsWith(']]>') || raw.length < '<![CDATA[]]>'.length) return null;
    text = raw.slice('<![CDATA['.length, -']]>'.length);
  } else {
    let bad = false;
    text = raw.replace(/&(?:#(\d{1,7})|#x([0-9A-Fa-f]{1,6})|(amp|lt|gt|quot|apos));/g, (_, dec, hex, named) => {
      if (named !== undefined) return XML_NAMED[named];
      const cp = dec !== undefined ? Number(dec) : parseInt(hex, 16);
      if (cp === 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) {
        bad = true;
        return '';
      }
      return String.fromCodePoint(cp);
    });
    if (bad) return null;
  }
  if (text.includes('<')) return null;
  const value = normalize(text);
  return value ? value : null;
}

/** The public profile XML (keyless): the name and the privacy state, both null when the XML cannot be used. */
async function steamProfile(steamid) {
  const r = await upstream(`https://steamcommunity.com/profiles/${steamid}/?xml=1`, { headers: { 'User-Agent': USER_AGENT } }, STEAM_TIMEOUT_MS);
  const none = { personaname: null, profilePublic: null };
  if (r === null || r.status !== 200 || typeof r.text !== 'string') return none;
  if (/<steamID64>(\d+)<\/steamID64>/.exec(r.text)?.[1] !== steamid) return none;
  const privacy = /<privacyState>([a-z]+)<\/privacyState>/.exec(r.text)?.[1];
  const raw = /<steamID>([\s\S]*?)<\/steamID>/.exec(r.text)?.[1];
  return { personaname: raw === undefined ? null : steamName(raw), profilePublic: privacy === undefined ? null : privacy === 'public' };
}

/** POST /openid/verify: the openid.* fields and `s` (JSON ≤ 4 KB), a handle required; the ten checks in order. */
async function openidVerify(request, env) {
  const cfg = await loadConfig(env);
  if (cfg === null) return fail(503, 'config');
  if ((await readHandle(request, cfg)) === null) return fail(401, 'handle');
  if (!(await rateAllowed(env?.VERIFY_RATE_LIMITER, 'verify'))) return rateLimited(RETRY_DEFAULT);
  const body = await readJsonObject(request, VERIFY_BODY_MAX);
  if (body === null) return fail(400, 'invalid');
  for (const [k, v] of Object.entries(body)) if ((k !== 's' && !k.startsWith('openid.')) || typeof v !== 'string') return fail(400, 'invalid');
  const f = (k) => (Object.hasOwn(body, `openid.${k}`) ? body[`openid.${k}`] : undefined);
  const invalid = () => fail(400, 'invalid');

  // 2. mode and ns; 3. the fixed endpoint; 4. the claimed id.
  if (f('mode') !== 'id_res') return fail(400, 'cancel');
  if (f('ns') !== OPENID_NS) return invalid();
  if (f('op_endpoint') !== STEAM_OP) return invalid();
  const claimed = f('claimed_id');
  if (claimed === undefined || claimed !== f('identity')) return invalid();
  const steamid = STEAM_ID_URL_RE.exec(claimed)?.[1];
  if (steamid === undefined || parseSteamId64(steamid) !== steamid) return invalid();
  // 5. return_to exactly LINK_RETURN; its `s` is the state and equals the popup's `s` (constant-time).
  const state = returnToState(f('return_to'));
  if (state === null || typeof body.s !== 'string' || !ctEqual(body.s, state)) return invalid();
  // 6. the signed list; 7. the nonce time.
  const signed = (f('signed') ?? '').split(',');
  if (!SIGNED_REQUIRED.every((name) => signed.includes(name))) return invalid();
  if (!f('sig') || !f('assoc_handle')) return invalid();
  const stamp = NONCE_RE.exec(f('response_nonce') ?? '')?.[1];
  const at = stamp === undefined ? Number.NaN : Date.parse(stamp);
  if (!Number.isFinite(at) || Math.abs(Date.now() - at) > NONCE_SKEW_MS) return invalid();

  // 8. check_authentication: the received openid.* fields unchanged except the mode.
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(body)) if (k.startsWith('openid.')) params.append(k, k === 'openid.mode' ? 'check_authentication' : v);
  const r = await upstream(STEAM_OP, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT }, body: params.toString() }, STEAM_TIMEOUT_MS);
  if (r === null || r.status === 403 || r.status === 429 || r.status >= 500) return fail(502, 'steam-busy');
  if (r.status !== 200 || typeof r.text !== 'string') return invalid();
  const lines = r.text.split(/\r?\n/);
  if (!lines.includes(`ns:${OPENID_NS}`) || !lines.includes('is_valid:true')) return invalid();

  // 9. the public profile; 10. exactly four fields.
  const { personaname, profilePublic } = await steamProfile(steamid);
  return done(json(200, { steamid, state, personaname, profilePublic }));
}

// ---- routing --------------------------------------------------------------------------------------------------------

/** Path → method → handler. `cors` marks the paths the site's page calls with fetch (spec §5.7.4). */
const ROUTES = new Map([
  ['/health', { GET: health }],
  ['/gh/login', { GET: login }],
  ['/gh/callback', { GET: callback }],
  ['/gh/session', { POST: session, cors: true }],
  ['/gh/logout', { POST: logout, cors: true }],
  ['/gh/api', { POST: ghApi, cors: true }],
  ['/openid/verify', { POST: openidVerify, cors: true }],
]);

const notFound = () => json(404, { error: 'not-found' });

async function handle(request, env, url) {
  const path = url.pathname;
  const route = ROUTES.get(path);
  if (route === undefined) return secure(notFound());

  if (route.cors && request.method === 'OPTIONS') {
    const res = preflight(request, SITE_ORIGIN);
    log(path, res === null ? 'forbidden' : null);
    return secure(res ?? json(403, { error: 'forbidden' }));
  }
  const handler = Object.hasOwn(route, request.method) ? route[request.method] : undefined;
  if (typeof handler !== 'function') return secure(notFound());

  if (route.cors && !originAllowed(request, SITE_ORIGIN)) {
    log(path, 'forbidden');
    return secure(json(403, { error: 'forbidden' }));
  }
  let out;
  try {
    out = await handler(request, env, url);
  } catch {
    out = fail(502, 'upstream');
  }
  log(path, out.error);
  return secure(route.cors ? withCors(out.res, SITE_ORIGIN) : out.res);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.protocol !== 'https:' || url.port !== '' || !HOST_RE.test(url.hostname)) return secure(notFound());
    return handle(request, env, url);
  },
};
