// scripts/accounts/safe-fetch.mjs — the only way the fetch-accounts job reaches the network (account-link spec §6.1).
// Node built-ins only (the job runs without npm ci). Every URL, including every redirect hop, must match the allow list
// of the request's kind; https only; one attempt, no retry; 10 s per request; the body is read as a stream against a
// per-request cap and a per-platform budget; JSON needs a JSON content type and images need PNG/JPEG/WebP magic bytes.
// Credentials never cross origins: a hop to another origin drops every credential header, and a request that carries
// the Steam key (x-webapi-key) is sent with redirect: 'error' and never follows anything (Steam terms §2).
// Nothing here logs: no URL, header or body leaves this module except in its return value.
import { randomBytes } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

/** Enka requires a client-specific User-Agent (spec §6.1 [enka-api]). Callers cannot replace it. */
export const USER_AGENT = 'lunecid-portfolio/1.0 (+https://lunecid.github.io)';

/** @typedef {{ readonly host: string; readonly path?: string }} AllowEntry */
/** @param {AllowEntry[]} list @returns {readonly AllowEntry[]} */
const frozenList = (list) => Object.freeze(list.map((e) => Object.freeze(e)));

/**
 * Hosts (exact names, no subdomains, default port) and optional path prefixes. op.gg and lolchess.gg are listed for
 * the Riot profile existence check (Q7 "켬", spec §6.6); steamcommunity.com for the keyless ?xml=1 privacy check.
 */
export const ALLOW = Object.freeze({
  json: frozenList([
    { host: 'enka.network' },
    { host: 'raw.githubusercontent.com', path: '/EnkaNetwork/API-docs/master/store/' },
    { host: 'api.steampowered.com' },
    { host: 'steamcommunity.com' },
    { host: 'op.gg' },
    { host: 'lolchess.gg' },
  ]),
  image: frozenList([
    { host: 'enka.network' },
    { host: 'avatars.fastly.steamstatic.com' },
    { host: 'avatars.steamstatic.com' },
    { host: 'media.steampowered.com' },
    { host: 'shared.akamai.steamstatic.com' },
  ]),
});

/** Body caps in bytes: API JSON 1 MB, an Enka store file (locs.json) 40 MB, one image 3 MB, one platform 25 MB. */
export const LIMITS = Object.freeze({ json: 1_048_576, store: 41_943_040, image: 3_145_728, platform: 26_214_400 });

const TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 2;
const KEY_HEADER = 'x-webapi-key';
const CREDENTIAL_HEADERS = new Set(['authorization', 'proxy-authorization', 'cookie', KEY_HEADER]);
const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308]);
/** Store files come from raw.githubusercontent.com, which serves every file as text/plain. */
const STORE_EXTRA_TYPES = new Set(['text/plain']);
/** Non-JSON types accepted per host for kind 'json': the Steam profile ?xml=1 check (read by regex only, spec §6.5). */
const HOST_EXTRA_TYPES = new Map([['steamcommunity.com', new Set(['text/xml', 'application/xml'])]]);

/** @typedef {'json' | 'store' | 'image'} FetchKind */
/** @typedef {'host' | 'redirect' | 'timeout' | 'too-large' | 'type' | 'network' | 'http'} FetchError */
/**
 * @typedef {{ ok: true; status: number; bytes: Uint8Array; contentType: string; location?: string }
 *   | { ok: false; status: number | null; error: FetchError }} FetchResult
 * `location` is set only on a 3xx returned as is (followRedirects: false).
 */

/** @param {FetchKind} kind @returns {readonly AllowEntry[] | null} */
function listFor(kind) {
  if (kind === 'json') return ALLOW.json;
  if (kind === 'image') return ALLOW.image;
  if (kind === 'store') return ALLOW.json.filter((e) => e.path !== undefined);
  return null;
}

/** @param {URL} url @param {FetchKind} kind */
function allowed(url, kind) {
  const list = listFor(kind);
  if (!list || url.protocol !== 'https:' || url.port !== '' || url.username !== '' || url.password !== '') return false;
  // An encoded slash or backslash could climb out of a path prefix on the server side; no allowed URL needs one.
  if (/%2f|%5c/i.test(url.pathname)) return false;
  return list.some((e) => e.host === url.hostname && (e.path === undefined || url.pathname.startsWith(e.path)));
}

/** @param {FetchKind} kind @param {string} host @param {string} contentType */
function typeAllowed(kind, host, contentType) {
  const essence = contentType.split(';')[0].trim().toLowerCase();
  if (essence === 'application/json' || /^application\/[a-z0-9.-]+\+json$/.test(essence)) return true;
  if (kind === 'store') return STORE_EXTRA_TYPES.has(essence);
  return HOST_EXTRA_TYPES.get(host)?.has(essence) ?? false;
}

/** @param {unknown} err @returns {FetchError} */
function classify(err) {
  const e = /** @type {{ name?: string; cause?: { message?: string } } | null} */ (err);
  if (e?.name === 'TimeoutError' || e?.name === 'AbortError') return 'timeout';
  // undici with redirect: 'error' rejects with TypeError('fetch failed', { cause: Error('unexpected redirect') }).
  if (typeof e?.cause?.message === 'string' && /redirect/i.test(e.cause.message)) return 'redirect';
  return 'network';
}

/** @param {Response} res */
function discard(res) {
  res.body?.cancel().catch(() => {});
}

/** @param {number | null} status @param {FetchError} error @returns {FetchResult} */
const fail = (status, error) => ({ ok: false, status, error });

/**
 * Magic-byte image type (the only three formats kept).
 * @param {Uint8Array} bytes
 * @returns {'png' | 'jpg' | 'webp' | null}
 */
export function imageKind(bytes) {
  const b = bytes;
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'webp';
  return null;
}

/**
 * Reads the body against the per-request cap and the platform budget. Bytes that fit are added to `budget.used` as they
 * arrive (downloaded bytes count even when the request later fails); the budget never records more than the cap.
 * @param {Response} res @param {number} limit @param {{ used: number }} budget
 * @returns {Promise<Uint8Array | FetchError>}
 */
async function readCapped(res, limit, budget) {
  if (!res.body) return new Uint8Array(0);
  const reader = res.body.getReader();
  /** @type {Uint8Array[]} */
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (total + value.length > limit || budget.used + value.length > LIMITS.platform) {
        reader.cancel().catch(() => {});
        return 'too-large';
      }
      chunks.push(value);
      total += value.length;
      budget.used += value.length;
    }
  } catch (err) {
    reader.cancel().catch(() => {});
    return classify(err) === 'timeout' ? 'timeout' : 'network';
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/**
 * GET one allow-listed resource.
 * @param {string} url
 * @param {{ kind: FetchKind; headers?: Record<string, string>; followRedirects?: boolean; budget: { used: number };
 *   fetchImpl?: typeof fetch; timeoutMs?: number }} opts
 * @returns {Promise<FetchResult>}
 */
export async function safeFetch(url, opts) {
  const { kind, headers = {}, followRedirects = true, budget, timeoutMs = TIMEOUT_MS } = opts;
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  /** @type {URL} */
  let current;
  try {
    current = new URL(url);
  } catch {
    return fail(null, 'host');
  }
  if (!allowed(current, kind)) return fail(null, 'host');

  /** @type {Record<string, string>} lower-case names; the User-Agent is always ours */
  let sent = {};
  for (const [name, value] of Object.entries(headers)) if (typeof value === 'string') sent[name.toLowerCase()] = value;
  sent['user-agent'] = USER_AGENT;
  const keyed = KEY_HEADER in sent;

  for (let hop = 0; ; hop += 1) {
    /** @type {Response} */
    let res;
    try {
      res = await fetchImpl(current.href, { method: 'GET', headers: { ...sent }, redirect: keyed ? 'error' : 'manual', signal: AbortSignal.timeout(timeoutMs) });
    } catch (err) {
      return fail(null, classify(err));
    }
    const { status } = res;

    if (REDIRECT_STATUS.has(status)) {
      discard(res);
      if (keyed) return fail(status, 'redirect');
      const loc = res.headers.get('location');
      /** @type {URL | null} */
      let next = null;
      try {
        next = loc ? new URL(loc, current) : null;
      } catch {
        next = null;
      }
      if (!followRedirects) {
        /** @type {FetchResult} */
        const asIs = { ok: true, status, bytes: new Uint8Array(0), contentType: res.headers.get('content-type') ?? '' };
        if (next) asIs.location = next.href;
        return asIs;
      }
      if (!next || hop >= MAX_REDIRECTS || !allowed(next, kind)) return fail(status, 'redirect');
      if (next.origin !== current.origin) sent = Object.fromEntries(Object.entries(sent).filter(([name]) => !CREDENTIAL_HEADERS.has(name)));
      current = next;
      continue;
    }

    if (status < 200 || status > 299) {
      discard(res);
      return fail(status, 'http');
    }
    const contentType = res.headers.get('content-type') ?? '';
    if (kind !== 'image' && !typeAllowed(kind, current.hostname, contentType)) {
      discard(res);
      return fail(status, 'type');
    }
    const limit = LIMITS[kind];
    const declared = res.headers.get('content-length');
    if (declared !== null && /^\d+$/.test(declared.trim())) {
      const n = Number(declared);
      if (n > limit || budget.used + n > LIMITS.platform) {
        discard(res);
        return fail(status, 'too-large');
      }
    }
    const body = await readCapped(res, limit, budget);
    if (typeof body === 'string') return fail(status, body);
    if (kind === 'image' && imageKind(body) === null) return fail(status, 'type');
    return { ok: true, status, bytes: body, contentType };
  }
}

/**
 * Writes `data` to a temp file in the target's directory, then renames it over the target (atomic on one file system).
 * A failed write or rename removes the temp file and rethrows.
 * @param {string} path
 * @param {string | Uint8Array} data
 */
export async function writeAtomic(path, data) {
  const dir = dirname(path);
  await mkdir(dir, { recursive: true });
  const tmp = join(dir, `.${basename(path)}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`);
  try {
    await writeFile(tmp, data, { flag: 'wx' });
    await rename(tmp, path);
  } catch (err) {
    await rm(tmp, { force: true });
    throw err;
  }
}
