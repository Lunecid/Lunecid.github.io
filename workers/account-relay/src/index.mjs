// The account relay Worker (account-link spec §5.7): finishes the owner's GitHub login, hands the site a sealed
// short-lived handle, and (AL-15) forwards only allow-listed GitHub calls and verifies Steam logins. Stateless: no KV,
// Durable Object or D1. Web-standard APIs only (Request, Response, fetch, URL, crypto.subtle, AbortController), no
// cloudflare:* import, so tests/ops/account-relay.test.mjs calls this default export directly under Node.
// Every destination and every Location is a code constant or derived from the one allowed host; nothing in a request
// picks where the Worker sends anything. Logs are only "relay: <path> ok|error:<code>" (spec §5.7.5).

// The ID rules are shared with the site and the fetch job (import-free TypeScript; wrangler's esbuild bundles it, Node
// strips the types). They are used by /gh/api and /openid/verify (AL-15) and are never copied here.
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
 * read: the caller treats any 3xx as upstream. Returns { status, text } (text null for a 3xx), or null on a network
 * failure, the timeout, or a body over the cap.
 */
async function upstream(url, init) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  let reader = null;
  try {
    const res = await fetch(url, { ...init, redirect: 'manual', signal: ctrl.signal });
    if (isRedirect(res) || res.body === null) {
      res.body?.cancel().catch(() => {});
      return { status: res.status, text: isRedirect(res) ? null : '' };
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
    return { status: res.status, text: new TextDecoder().decode(all) };
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

// ---- routing --------------------------------------------------------------------------------------------------------

/** Path → method → handler. `cors` marks the paths the site's page calls with fetch (spec §5.7.4). */
const ROUTES = new Map([
  ['/health', { GET: health }],
  ['/gh/login', { GET: login }],
  ['/gh/callback', { GET: callback }],
  ['/gh/session', { POST: session, cors: true }],
  ['/gh/logout', { POST: logout, cors: true }],
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
