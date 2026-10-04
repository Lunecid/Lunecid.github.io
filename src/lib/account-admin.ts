// src/lib/account-admin.ts — the owner management core (account-link spec §4.1, §4.2, §4.3, §4.5, §4.6, §4.8; plan AL-17).
// Browser code, pure apart from the injected AdminDeps; only the lazy management chunk and AccountLinks' manage mode
// import it. The page talks to one origin, the relay Worker's (POST /gh/session, /gh/api, /gh/logout, /openid/verify);
// login popups go to the Worker's /gh/login and Steam's fixed OpenID endpoint and come back through /link-return/ on
// BroadcastChannel('acct-link'). The browser never sees a GitHub token (R-17).
// The relay handle, the login nonce, tickets and the Steam state live only in closures and locals: never in web
// storage, a cookie, a URL (after reading) or a log line. tests/react/account-admin.test.ts pins this.
import { ACCOUNT_ADMIN, SITE } from '../config';
import type { Lang } from '../i18n/ui';
import { ACCOUNT_VARS, parseSteamId64, validateVar, type AccountVar } from './account-ids';

export const ALLOWED_HOSTS = ['lunecid.github.io', '127.0.0.1', 'localhost'] as const;
export const TICKET_RE = /^[A-Za-z0-9_-]{40,2048}$/;
export const RUN_URL_RE = /^https:\/\/github\.com\/Lunecid\/Lunecid\.github\.io\/actions\/runs\/\d+$/;
const REPO = `${ACCOUNT_ADMIN.owner}/${ACCOUNT_ADMIN.repo}`;
export const WORKFLOW_URL = `https://github.com/${REPO}/actions/workflows/${ACCOUNT_ADMIN.workflow}`;
/** The relay's login redirect codes (#gh-error=<code>, spec §4.7); anything else is reported as 'unknown'. */
export const GH_ERROR_CODES = ['denied', 'state', 'exchange', 'not-owner', 'no-access', 'config', 'upstream', 'rate'] as const;
export type RelayOp = 'vars.list' | 'vars.set' | 'vars.delete' | 'workflow.get' | 'dispatch' | 'run.get' | 'run.jobs';

const RELAY_OPS: readonly string[] = ['vars.list', 'vars.set', 'vars.delete', 'workflow.get', 'dispatch', 'run.get', 'run.jobs'] satisfies RelayOp[];
const FETCH_INIT = { method: 'POST', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', cache: 'no-store', mode: 'cors' } as const;
const POPUP_FEATURES = 'popup,width=600,height=720';
const CHANNEL = 'acct-link';
const STEAM_OP = 'https://steamcommunity.com/openid/login';
const OPENID_NS = 'http://specs.openid.net/auth/2.0';
const IDENTIFIER_SELECT = `${OPENID_NS}/identifier_select`;
const LINK_RETURN = `${SITE.url}/link-return/`;
// The relay's own shapes: STEAM_STATE_RE of /openid/verify, the bearer handle of /gh/api, its fixed error codes.
const STEAM_STATE_RE = /^[A-Za-z0-9_-]{16,128}$/;
const HANDLE_RE = /^[A-Za-z0-9_-]{1,4096}$/;
const CODE_RE = /^[a-z][a-z-]{0,31}$/;
const HANDLE_MAX_S = 3600;
const NONCE_BYTES = 16;
const MINUTE = 60_000;
const POLL_MS = 20_000;
const POLL_CAP_MS = 45 * MINUTE;
// The longest retryAfter honoured, in seconds: the Worker's own bound (RETRY_MAX), applied again here.
const RETRY_AFTER_MAX_S = 86_400;
// Characters no `gh` line may carry in a value (ghCommands).
const SHELL_UNSAFE = /["\\]/;
// PowerShell ends a single-quoted string at any of these; each is escaped by doubling (spec §4.8).
const PS_QUOTES = /['\u2018\u2019\u201A\u201B]/g;

/** A relay failure: the Worker's fixed code (spec §4.7) or the page's own ('relay-unset', 'network', 'unknown'). */
export class RelayError extends Error {
  readonly code: string;
  readonly status: number | null;
  readonly extra?: { retryAfter?: number; runId?: number };
  constructor(code: string, status: number | null, extra?: { retryAfter?: number; runId?: number }) {
    super(code);
    this.name = 'RelayError';
    this.code = code;
    this.status = status;
    this.extra = extra;
  }
}

/**
 * Everything the core touches in the browser, injected so tests use fakes. Functions are called unbound: pass arrow
 * functions or bound ones (navigator.sendBeacon needs its navigator).
 */
export interface AdminDeps {
  relay: string | null;
  fetch: typeof fetch;
  open: (url: string, target: string, features: string) => Window | null;
  channel: (name: string) => BroadcastChannel;
  now: () => number;
  setTimeout: typeof setTimeout;
  clearTimeout: typeof clearTimeout;
  location: Location;
  history: History;
  sendBeacon: (url: string, data: string) => boolean;
  random: (bytes: number) => Uint8Array;
}

type Timer = ReturnType<typeof setTimeout>;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isAccountVar = (name: unknown): name is AccountVar => typeof name === 'string' && (ACCOUNT_VARS as readonly string[]).includes(name);

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/** relay + path, only when the relay is set and the URL stays on its origin (spec §4.2). */
function relayUrl(relay: string | null, path: string): string {
  if (relay === null) throw new RelayError('relay-unset', null);
  const url = relay + path;
  if (originOf(url) !== relay) throw new RelayError('forbidden', null);
  return url;
}

function ghErrorCode(raw: unknown): string {
  return typeof raw === 'string' && (GH_ERROR_CODES as readonly string[]).includes(raw) ? raw : 'unknown';
}

function base64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ---- spec §4.1: where the management section may run ---------------------------------------------------------------

export function manageAllowed(win: Window): { ok: true } | { ok: false; reason: 'framed' | 'insecure' | 'host' } {
  if (win.top !== win.self) return { ok: false, reason: 'framed' };
  if (!win.isSecureContext) return { ok: false, reason: 'insecure' };
  if (!(ALLOWED_HOSTS as readonly string[]).includes(win.location.hostname)) return { ok: false, reason: 'host' };
  return { ok: true };
}

/** Reads ?manage and removes that key at once (other query keys and the fragment stay). */
export function takeManageQuery(loc: Location, hist: History): boolean {
  const q = new URLSearchParams(loc.search);
  if (!q.has('manage')) return false;
  q.delete('manage');
  const rest = q.toString();
  hist.replaceState(hist.state, '', `${loc.pathname}${rest ? `?${rest}` : ''}${loc.hash}`);
  return true;
}

/**
 * The same-tab login return (#gh=<ticket> or #gh-error=<code>): read, then the query and the fragment are removed
 * together. Only the ticket's shape is checked here; the relay judges it. Any other fragment is left alone.
 */
export function takeReturnFragment(loc: Location, hist: History): { kind: 'gh'; ticket: string } | { kind: 'gh-error'; code: string } | null {
  const h = new URLSearchParams(loc.hash.slice(1));
  if (!h.has('gh') && !h.has('gh-error')) return null;
  hist.replaceState(hist.state, '', loc.pathname);
  const ticket = h.get('gh');
  if (ticket !== null) return TICKET_RE.test(ticket) ? { kind: 'gh', ticket } : null;
  return { kind: 'gh-error', code: ghErrorCode(h.get('gh-error')) };
}

// ---- spec §4.2: the memory-only handle and the relay client ---------------------------------------------------------

export interface HandleBox {
  set(handle: string, expiresIn: number): void;
  get(): string | null;
  clear(): void;
  expiresAt(): number | null;
}

/** expiresIn in seconds. An expired handle stays until clear(): /gh/logout can still revoke the grant with it. */
export function createHandleBox(now: () => number): HandleBox {
  let handle: string | null = null;
  let expires: number | null = null;
  return {
    set(h, expiresIn) {
      handle = h;
      expires = now() + expiresIn * 1000;
    },
    get: () => handle,
    clear() {
      handle = null;
      expires = null;
    },
    expiresAt: () => expires,
  };
}

export interface RelayApi {
  relay(op: RelayOp, args?: Record<string, unknown>): Promise<unknown>;
  session(ticket: string, n: string): Promise<void>;
  verifySteam(fields: Record<string, string>): Promise<{ steamid: string; state: string; personaname: string | null; profilePublic: boolean | null }>;
  logout(): Promise<boolean>;
  beaconLogout(): void;
}

/** RelayError from an error response: the fixed code, the status, retryAfter and runId only. */
function relayFailure(status: number, data: unknown): RelayError {
  if (!isRecord(data) || typeof data.error !== 'string' || !CODE_RE.test(data.error)) return new RelayError('unknown', status);
  const extra: { retryAfter?: number; runId?: number } = {};
  if (typeof data.retryAfter === 'number' && Number.isFinite(data.retryAfter) && data.retryAfter > 0) extra.retryAfter = data.retryAfter;
  if (Number.isSafeInteger(data.runId) && (data.runId as number) > 0) extra.runId = data.runId as number;
  return new RelayError(data.error, status, Object.keys(extra).length > 0 ? extra : undefined);
}

export function createRelay(deps: AdminDeps, box: HandleBox): RelayApi {
  /** One POST to the relay; the answer must come from the relay's origin. Resolves with the status and the parsed body. */
  async function post(url: string, body: string | null, handle: string | null): Promise<{ status: number; data: unknown }> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (handle !== null) headers.Authorization = `Bearer ${handle}`;
    const fetchFn = deps.fetch;
    let res: Response;
    let text: string;
    try {
      res = await fetchFn(url, { ...FETCH_INIT, headers, ...(body === null ? {} : { body }) });
      if (originOf(res.url) !== originOf(url)) throw new RelayError('forbidden', null);
      text = await res.text();
    } catch (e) {
      throw e instanceof RelayError ? e : new RelayError('network', null);
    }
    let data: unknown;
    try {
      data = text === '' ? undefined : JSON.parse(text);
    } catch {
      data = undefined;
    }
    if (!res.ok) throw relayFailure(res.status, data);
    return { status: res.status, data };
  }

  /** POST /gh/logout: the relay deletes the GitHub grant behind the handle, expired or not. */
  const forget = async (handle: string) => post(relayUrl(deps.relay, '/gh/logout'), null, handle);

  /** A handle the relay refused (401 handle) ends the login, and the grant is revoked too (spec §4.2). */
  function revoke(handle: string): void {
    if (box.get() === handle) box.clear();
    forget(handle).catch(() => undefined);
  }

  async function withHandle(path: string, payload: Record<string, unknown>): Promise<unknown> {
    const url = relayUrl(deps.relay, path);
    const handle = box.get();
    if (handle === null) throw new RelayError('handle', null);
    try {
      return (await post(url, JSON.stringify(payload), handle)).data;
    } catch (e) {
      if (e instanceof RelayError && e.code === 'handle' && e.status === 401) revoke(handle);
      throw e;
    }
  }

  return {
    async relay(op, args) {
      relayUrl(deps.relay, '/gh/api'); // relay-unset comes first
      if (!RELAY_OPS.includes(op)) throw new RelayError('forbidden', null);
      return withHandle('/gh/api', { ...args, op });
    },

    async session(ticket, n) {
      const url = relayUrl(deps.relay, '/gh/session');
      if (!TICKET_RE.test(ticket)) throw new RelayError('ticket', null);
      // The same-tab path has no nonce: its ticket carries n: null, so '' is sent as null.
      const { data } = await post(url, JSON.stringify({ ticket, n: n === '' ? null : n }), null);
      if (!isRecord(data) || typeof data.handle !== 'string' || !HANDLE_RE.test(data.handle)) throw new RelayError('unknown', null);
      const expiresIn = data.expiresIn;
      if (typeof expiresIn !== 'number' || !Number.isFinite(expiresIn) || expiresIn <= 0) throw new RelayError('unknown', null);
      box.set(data.handle, Math.min(expiresIn, HANDLE_MAX_S));
    },

    async verifySteam(fields) {
      const body: Record<string, string> = {};
      for (const [k, v] of Object.entries(fields)) if ((k === 's' || k.startsWith('openid.')) && typeof v === 'string') body[k] = v;
      const data = await withHandle('/openid/verify', body);
      if (!isRecord(data)) throw new RelayError('invalid', null);
      const { steamid, state, personaname, profilePublic } = data;
      if (typeof steamid !== 'string' || parseSteamId64(steamid) !== steamid) throw new RelayError('invalid', null);
      if (typeof state !== 'string' || state !== body.s) throw new RelayError('invalid', null);
      if (personaname !== null && typeof personaname !== 'string') throw new RelayError('invalid', null);
      if (profilePublic !== null && typeof profilePublic !== 'boolean') throw new RelayError('invalid', null);
      return { steamid, state, personaname, profilePublic };
    },

    /**
     * The box is empty afterwards whatever the relay answers. true when the relay confirmed (204) or no handle was
     * held; false when the GitHub grant may still be alive (network failure or any other answer).
     */
    async logout() {
      const handle = box.get();
      box.clear();
      if (handle === null) return true;
      try {
        return (await forget(handle)).status === 204;
      } catch {
        return false;
      }
    },

    /** pagehide: the handle as a text/plain beacon body (spec §4.2), then the box is empty. */
    beaconLogout() {
      const handle = box.get();
      box.clear();
      if (handle === null) return;
      try {
        const send = deps.sendBeacon;
        send(relayUrl(deps.relay, '/gh/logout'), handle);
      } catch {
        /* relay unset or the beacon refused: nothing more can be done while the page goes away */
      }
    },
  };
}

// ---- spec §4.2, §4.3: popups ----------------------------------------------------------------------------------------

/** 16 random bytes as base64url (22 characters): the login nonce and the Steam state. */
export function nonce(random: AdminDeps['random']): string {
  const bytes = random(NONCE_BYTES);
  if (bytes.length !== NONCE_BYTES) throw new RangeError('random');
  return base64url(bytes);
}

/** open('about:blank') without noopener, so null means blocked; then opener = null and the real address. */
function openPopup(deps: AdminDeps, target: string, url: string): boolean {
  const open = deps.open;
  const w = open('about:blank', target, POPUP_FEATURES);
  if (w === null) return false;
  try {
    w.opener = null;
    w.location.replace(url);
    return true;
  } catch {
    try {
      w.close();
    } catch {
      /* already gone */
    }
    return false;
  }
}

export function startGithubLogin(deps: AdminDeps, lang: Lang): { n: string } | { blocked: true } {
  relayUrl(deps.relay, '/gh/login'); // relay-unset before a nonce or a popup
  const n = nonce(deps.random);
  return openPopup(deps, 'acct-gh', relayUrl(deps.relay, `/gh/login?lang=${lang}&n=${n}`)) ? { n } : { blocked: true };
}

/** The fallback when popups are blocked: the relay returns to the management page with #gh=<ticket> (no nonce). */
export function startGithubLoginSameTab(deps: AdminDeps, lang: Lang): void {
  deps.location.assign(relayUrl(deps.relay, `/gh/login?lang=${lang}&mode=tab`));
}

/** Steam's fixed OpenID 2.0 endpoint (no discovery), return_to /link-return/?s=<state>, realm the exact site origin. */
export function steamLoginUrl(state: string): string {
  if (!STEAM_STATE_RE.test(state)) throw new RangeError('state');
  const q = new URLSearchParams({
    'openid.ns': OPENID_NS,
    'openid.mode': 'checkid_setup',
    'openid.claimed_id': IDENTIFIER_SELECT,
    'openid.identity': IDENTIFIER_SELECT,
    'openid.return_to': `${LINK_RETURN}?s=${state}`,
    'openid.realm': `${SITE.url}/`,
  });
  return `${STEAM_OP}?${q.toString()}`;
}

export function startSteamLogin(deps: AdminDeps): { state: string } | { blocked: true } {
  const state = nonce(deps.random);
  return openPopup(deps, 'acct-steam', steamLoginUrl(state)) ? { state } : { blocked: true };
}

/**
 * The popup results from /link-return/. A gh message counts only when its n equals the pending popup nonce (the
 * same-tab path never comes through here), a gh-error with n: null only while a login is pending, a steam message
 * only when s equals the pending state. Each accepted nonce or state is used once. Returns the unsubscribe.
 */
export function listenLinkChannel(
  deps: AdminDeps,
  h: {
    pendingN(): string | null;
    pendingSteamState(): string | null;
    onTicket(ticket: string, n: string): void;
    onGhError(code: string): void;
    onSteam(fields: Record<string, string>, s: string): void;
  },
): () => void {
  const make = deps.channel;
  const ch = make(CHANNEL);
  const used = new Set<string>();
  const onMessage = (event: Event) => {
    const m: unknown = (event as MessageEvent).data;
    if (!isRecord(m)) return;
    if (m.kind === 'gh') {
      const n = h.pendingN();
      if (n === null || m.n !== n || used.has(n)) return;
      if (typeof m.ticket !== 'string' || !TICKET_RE.test(m.ticket)) return;
      used.add(n);
      h.onTicket(m.ticket, n);
    } else if (m.kind === 'gh-error') {
      const n = h.pendingN();
      if (n === null || (m.n !== null && m.n !== n)) return;
      h.onGhError(ghErrorCode(m.code));
    } else if (m.kind === 'steam') {
      const s = h.pendingSteamState();
      if (s === null || m.s !== s || used.has(s) || !isRecord(m.params)) return;
      const fields: Record<string, string> = {};
      for (const [k, v] of Object.entries(m.params)) if (k.startsWith('openid.') && typeof v === 'string') fields[k] = v;
      used.add(s);
      h.onSteam(fields, s);
    }
  };
  ch.addEventListener('message', onMessage);
  return () => {
    ch.removeEventListener('message', onMessage);
    ch.close();
  };
}

// ---- spec §3.7, §4.2: idle logout and the 60-minute cap -------------------------------------------------------------

/**
 * Starts at once. Both deadlines are absolute (now()-based) and timers only wake the clock up to compare, so a sleeping
 * device or a frozen tab cannot stretch them. Idle: a warning idleWarnMinutes before idleMinutes after the last
 * touch(), then the end; touch() restarts only this deadline (no request), pause() stops it while a run is tracked,
 * resume() starts it afresh. Cap: a warning capWarnMinutes before expiresAt() (with the minutes actually left), then
 * the end. touch(), pause(), resume() and every wake that listenWake reports (visibilitychange, pageshow) first end
 * the session when a deadline has passed. onEnd fires once; stop() silences everything.
 */
export function createSessionClock(o: {
  now: () => number;
  setTimeout: typeof setTimeout;
  clearTimeout: typeof clearTimeout;
  /** Subscribes the check to the page's wake events; returns the unsubscribe. */
  listenWake: (check: () => void) => () => void;
  idleMinutes: 15;
  idleWarnMinutes: number;
  capWarnMinutes: number;
  expiresAt: () => number | null;
  onIdleWarn(minutes: number): void;
  onCapWarn(minutes: number): void;
  onEnd(reason: 'idle' | 'cap'): void;
}): { touch(): void; pause(): void; resume(): void; stop(): void } {
  const { now, setTimeout: set, clearTimeout: clear } = o;
  const expires = o.expiresAt();
  let idleAt: number | null = null;
  let idleWarned = false;
  let capWarned = false;
  let paused = false;
  let over = false;
  let timers: Timer[] = [];
  let unlisten: () => void = () => {};
  const at = (deadline: number, fn: () => void) => void timers.push(set(fn, Math.max(0, deadline - now())));
  const clearTimers = () => {
    for (const t of timers) clear(t);
    timers = [];
  };
  const halt = () => {
    if (over) return;
    over = true;
    clearTimers();
    unlisten();
  };
  const end = (reason: 'idle' | 'cap') => {
    if (over) return;
    halt();
    o.onEnd(reason);
  };
  /** Ends the session when a deadline has passed (the earlier one is the reason); true when it is over. */
  const due = (): boolean => {
    if (over) return true;
    const t = now();
    const idleDue = idleAt !== null && t >= idleAt;
    const capDue = expires !== null && t >= expires;
    if (idleDue && !(capDue && (expires as number) < (idleAt as number))) end('idle');
    else if (capDue) end('cap');
    return over;
  };
  const schedule = () => {
    clearTimers();
    if (over) return;
    if (idleAt !== null) {
      if (!idleWarned) {
        at(idleAt - o.idleWarnMinutes * MINUTE, () => {
          idleWarned = true;
          o.onIdleWarn(o.idleWarnMinutes);
        });
      }
      at(idleAt, check);
    }
    if (expires !== null) {
      if (!capWarned) {
        at(expires - o.capWarnMinutes * MINUTE, () => {
          capWarned = true;
          const left = Math.ceil((expires - now()) / MINUTE);
          if (left > 0) o.onCapWarn(left);
        });
      }
      at(expires, check);
    }
  };
  /** Compares with now(): ends a session past a deadline, else re-arms what is left of the deadlines. */
  function check(): void {
    if (!due()) schedule();
  }
  const restartIdle = () => {
    idleAt = now() + o.idleMinutes * MINUTE;
    idleWarned = false;
    schedule();
  };
  unlisten = o.listenWake(check);
  restartIdle();
  return {
    touch() {
      if (due() || paused) return;
      restartIdle();
    },
    pause() {
      if (due()) return;
      paused = true;
      idleAt = null;
      schedule();
    },
    resume() {
      if (due()) return;
      paused = false;
      restartIdle();
    },
    stop: halt,
  };
}

// ---- spec §4.3, §4.4: the form values ---------------------------------------------------------------------------------

export interface FormStore<K extends string> {
  get(k: K): string;
  set(k: K, v: string): void;
  changed(k: K): boolean;
  dirty(): boolean;
  load(saved: Partial<Record<K, string>>): void;
  markSaved(k: K): void;
}

/**
 * Typed values against the stored ones. load() replaces the stored set (a missing key is stored as ''); a field the
 * owner changed keeps its typed value, so logging in again never loses input (spec §3.7).
 */
export function createFormStore<K extends string>(): FormStore<K> {
  const typed = new Map<K, string>();
  const stored = new Map<K, string>();
  const base = (k: K) => stored.get(k) ?? '';
  const get = (k: K) => typed.get(k) ?? base(k);
  const changed = (k: K) => get(k) !== base(k);
  return {
    get,
    set(k, v) {
      typed.set(k, v);
    },
    changed,
    dirty: () => [...new Set([...typed.keys(), ...stored.keys()])].some(changed),
    load(saved) {
      const keys = new Set<K>([...typed.keys(), ...stored.keys(), ...(Object.keys(saved) as K[])]);
      for (const k of keys) {
        const v = Object.hasOwn(saved, k) ? saved[k] : undefined;
        if (!changed(k)) typed.delete(k);
        stored.set(k, typeof v === 'string' ? v : '');
      }
    },
    markSaved(k) {
      stored.set(k, get(k));
      typed.delete(k);
    },
  };
}

/** The vars.list answer as stored values: ACCOUNT_VARS names with string values only (spec §4.2: the page filters again). */
export function varsFromList(list: unknown): Partial<Record<AccountVar, string>> {
  const out: Partial<Record<AccountVar, string>> = {};
  if (!Array.isArray(list)) return out;
  for (const item of list) {
    if (!isRecord(item) || !isAccountVar(item.name) || typeof item.value !== 'string') continue;
    if (!Object.hasOwn(out, item.name)) out[item.name] = item.value;
  }
  return out;
}

// ---- spec §4.6: run tracking -------------------------------------------------------------------------------------------

/**
 * A retryAfter as the seconds to wait (the polling delay here, the §4.7 time in the panel): at most a day, so a time
 * can always be written and a delay always ends; anything but a finite number ≥ 0 gives the fallback.
 */
export function retryAfterSeconds(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.min(value, RETRY_AFTER_MAX_S) : fallback;
}

/**
 * run.get + run.jobs at once, then every 20 s while the tab is visible; a 'rate' error waits its retryAfter instead.
 * Stops with 'done' once the run is completed, 'timeout' after 45 minutes, 'handle' when the login ended. Other errors
 * go to onError and polling goes on. Returns the cancel function (no onStop then; a callback may call it too).
 */
export function pollRun(
  deps: AdminDeps,
  api: RelayApi,
  runId: number,
  o: { visible(): boolean; onUpdate(run: unknown, jobs: unknown): void; onError?(e: unknown): void; onStop(reason: 'done' | 'timeout' | 'handle'): void },
): () => void {
  const { now, setTimeout: set, clearTimeout: clear } = deps;
  const deadline = now() + POLL_CAP_MS;
  let timer: Timer | null = null;
  let stopped = false;
  const finish = (reason: 'done' | 'timeout' | 'handle') => {
    if (stopped) return;
    stopped = true;
    o.onStop(reason);
  };
  const schedule = (ms: number) => {
    timer = set(() => void tick(), Math.max(0, Math.min(ms, deadline - now())));
  };
  async function tick(): Promise<void> {
    timer = null;
    if (stopped) return;
    if (now() >= deadline) return finish('timeout');
    if (!o.visible()) return schedule(POLL_MS);
    let wait = POLL_MS;
    try {
      const run = await api.relay('run.get', { runId });
      const jobs = await api.relay('run.jobs', { runId });
      if (stopped) return;
      o.onUpdate(run, jobs);
      if (isRecord(run) && run.status === 'completed') return finish('done');
    } catch (e) {
      if (stopped) return;
      if (e instanceof RelayError && e.code === 'handle') return finish('handle');
      if (e instanceof RelayError) wait = Math.max(POLL_MS, retryAfterSeconds(e.extra?.retryAfter, 0) * 1000);
      try {
        o.onError?.(e);
      } catch {
        // a failing callback must not end the loop: the next poll and the 45-minute stop still come
      }
    }
    if (!stopped) schedule(wait); // onUpdate or onError may have cancelled
  }
  void tick();
  return () => {
    stopped = true;
    if (timer !== null) clear(timer);
    timer = null;
  };
}

// ---- spec §4.8: the no-login fallback ----------------------------------------------------------------------------------

/**
 * One `gh` line per change (Windows PowerShell 5.1 has no '&&'), values in single quotes with PowerShell's quote
 * doubling ($, backticks and ; stay literal there), then the workflow run, always (the plan's form: skipped values set
 * on the web form still need a run). Only ACCOUNT_VARS names; the stored form of each value is used. Skipped, for the
 * web form (spec §4.8 step 1): a value validateVar refuses ('invalid'), and one with " or \ ('unsafe-shell': Windows
 * PowerShell 5.1 passes native arguments without escaping embedded double quotes, so they could split into extra gh
 * arguments).
 */
export function ghCommands(changes: { name: AccountVar; value: string | null }[]): {
  lines: string[];
  skipped: { name: AccountVar; reason: 'invalid' | 'unsafe-shell' }[];
} {
  const repo = `-R ${REPO}`;
  const lines: string[] = [];
  const skipped: { name: AccountVar; reason: 'invalid' | 'unsafe-shell' }[] = [];
  for (const { name, value } of changes) {
    if (!isAccountVar(name)) continue;
    if (value === null) {
      lines.push(`gh variable delete ${name} ${repo}`);
      continue;
    }
    const check = validateVar(name, value);
    if (!check.ok) skipped.push({ name, reason: 'invalid' });
    else if (SHELL_UNSAFE.test(check.value)) skipped.push({ name, reason: 'unsafe-shell' });
    else lines.push(`gh variable set ${name} --body '${check.value.replace(PS_QUOTES, (q) => q + q)}' ${repo}`);
  }
  lines.push(`gh workflow run ${ACCOUNT_ADMIN.workflow} --ref ${ACCOUNT_ADMIN.ref} ${repo}`);
  return { lines, skipped };
}
