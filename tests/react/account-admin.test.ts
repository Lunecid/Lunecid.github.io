// AL-17: src/lib/account-admin.ts — the owner management core (account-link spec §4.1, §4.2, §4.3, §4.5, §4.6, §4.8).
// Every dependency is a fake injected through AdminDeps; nothing reaches the network. Each test also proves that no
// handle, ticket, nonce or Steam state reaches storage, a cookie or the console: Storage.prototype.setItem, the
// document.cookie setter and console.* are spied on and must stay uncalled, and a source check pins that the module
// never names those sinks. Fake handles and tickets are built at run time.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import {
  ALLOWED_HOSTS,
  GH_ERROR_CODES,
  RUN_URL_RE,
  RelayError,
  TICKET_RE,
  WORKFLOW_URL,
  createFormStore,
  createHandleBox,
  createRelay,
  createSessionClock,
  ghCommands,
  listenLinkChannel,
  manageAllowed,
  nonce,
  pollRun,
  retryAfterSeconds,
  startGithubLogin,
  startGithubLoginSameTab,
  startSteamLogin,
  steamLoginUrl,
  takeManageQuery,
  takeReturnFragment,
  varsFromList,
  type AdminDeps,
  type RelayApi,
  type RelayOp,
} from '../../src/lib/account-admin';
import type { AccountVar } from '../../src/lib/account-ids';

const RELAY = 'https://account-relay.test-sub.workers.dev';
const HANDLE = 'hdl_' + 'A'.repeat(60);
const TICKET = 'tkt-' + 'B'.repeat(60);
const POPUP = 'popup,width=600,height=720';
const MIN = 60_000;
const OPTIONS = { method: 'POST', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', cache: 'no-store', mode: 'cors' } as const;

// ---- fakes ----------------------------------------------------------------------------------------------------------

type Call = { url: string; init: RequestInit };
type Responder = (url: string, init: RequestInit) => Response | Promise<Response>;

/** A JSON response whose `url` is the given one (a fetch() response always has its final URL). */
function reply(url: string, status: number, body?: unknown): Response {
  const res = new Response(body === undefined ? null : typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
  Object.defineProperty(res, 'url', { value: url });
  return res;
}

function harness(over: Partial<AdminDeps> = {}) {
  const calls: Call[] = [];
  let responder: Responder = (url) => reply(url, 200, {});
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init: init ?? {} });
    return responder(url, init ?? {});
  });
  const beacons: [string, string][] = [];
  const assigned: string[] = [];
  let seed = 0;
  const deps: AdminDeps = {
    relay: RELAY,
    fetch: fetch as unknown as typeof globalThis.fetch,
    open: vi.fn((_url: string, _target: string, _features: string): Window | null => null),
    channel: () => {
      throw new Error('no channel in this test');
    },
    now: () => Date.now(),
    // Looked up at call time, so vi.useFakeTimers() installed later is honoured.
    setTimeout: ((fn: () => void, ms?: number) => setTimeout(fn, ms)) as unknown as typeof setTimeout,
    clearTimeout: ((t?: ReturnType<typeof setTimeout>) => clearTimeout(t)) as typeof clearTimeout,
    location: { assign: (url: string) => void assigned.push(url) } as unknown as Location,
    history: window.history,
    sendBeacon: (url, data) => {
      beacons.push([url, data]);
      return true;
    },
    random: (n) => {
      seed += 1;
      return Uint8Array.from({ length: n }, (_, i) => (i * 31 + seed * 7) & 0xff);
    },
    ...over,
  };
  return { deps, calls, beacons, assigned, fetch, respond: (r: Responder) => void (responder = r) };
}

const bodyOf = (c: Call): unknown => JSON.parse(String(c.init.body));

/** The rejection of a promise, as a RelayError. */
async function failure(p: Promise<unknown>): Promise<RelayError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(RelayError);
    return e as RelayError;
  }
  throw new Error('expected a rejection');
}

function fakePopup() {
  const log: string[] = [];
  const w = {
    opener: {} as unknown,
    close: vi.fn(),
    location: { replace: vi.fn((_url: string) => void log.push(`replace opener=${w.opener === null ? 'null' : 'set'}`)) },
  };
  const open = vi.fn((_url: string, _target: string, _features: string): Window | null => {
    log.push('open');
    return w as unknown as Window;
  });
  return { w, log, open };
}

class FakeChannel extends EventTarget {
  closed = false;
  postMessage(): void {}
  close(): void {
    this.closed = true;
  }
  emit(data: unknown): void {
    this.dispatchEvent(new MessageEvent('message', { data }));
  }
}

const flush = () => new Promise<void>((r) => setTimeout(r, 0));

// ---- the sinks must stay silent in every test -----------------------------------------------------------------------

let sinks: [string, MockInstance][] = [];

beforeEach(() => {
  sinks = [
    ['Storage.setItem', vi.spyOn(Storage.prototype, 'setItem')],
    ['document.cookie', vi.spyOn(Document.prototype, 'cookie', 'set')],
    ...(['log', 'info', 'warn', 'error', 'debug', 'trace'] as const).map((m): [string, MockInstance] => [`console.${m}`, vi.spyOn(console, m).mockImplementation(() => {})]),
  ];
});

afterEach(() => {
  const used = sinks.filter(([, s]) => s.mock.calls.length > 0).map(([name]) => name);
  const stored = localStorage.length + sessionStorage.length;
  const cookie = document.cookie;
  vi.useRealTimers();
  vi.restoreAllMocks();
  history.replaceState(null, '', '/');
  localStorage.clear();
  sessionStorage.clear();
  for (const c of cookie.split(';')) if (c.trim()) document.cookie = `${c.split('=')[0]?.trim()}=; Max-Age=0`;
  expect(used, 'storage, cookie or console written').toEqual([]);
  expect(stored).toBe(0);
  expect(cookie).toBe('');
});

it('the module names no storage, cookie or console sink (the handle lives only in closures)', () => {
  const src = readFileSync(join(process.cwd(), 'src/lib/account-admin.ts'), 'utf8');
  expect(src).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie|console\./);
});

it('constants: hosts, ticket and run-link shapes, the workflow page, the login error codes', () => {
  expect(ALLOWED_HOSTS).toEqual(['lunecid.github.io', '127.0.0.1', 'localhost']);
  expect(TICKET_RE.test('A'.repeat(40))).toBe(true);
  expect(TICKET_RE.test('A'.repeat(39))).toBe(false);
  expect(TICKET_RE.test('A'.repeat(2049))).toBe(false);
  expect(TICKET_RE.test(`${'A'.repeat(40)}.x`)).toBe(false);
  expect(RUN_URL_RE.test('https://github.com/Lunecid/Lunecid.github.io/actions/runs/123')).toBe(true);
  expect(RUN_URL_RE.test('https://github.com/Lunecid/Lunecid.github.io/actions/runs/123/attempts/2')).toBe(false);
  expect(RUN_URL_RE.test('https://github.com/evil/Lunecid.github.io/actions/runs/123')).toBe(false);
  expect(WORKFLOW_URL).toBe('https://github.com/Lunecid/Lunecid.github.io/actions/workflows/deploy.yml');
  expect(GH_ERROR_CODES).toEqual(['denied', 'state', 'exchange', 'not-owner', 'no-access', 'config', 'upstream', 'rate']);
});

// ---- spec §4.1: where the management section may run ----------------------------------------------------------------

describe('manageAllowed', () => {
  const win = (o: { framed?: boolean; secure?: boolean; href?: string }) => {
    const self = {};
    return { self, top: o.framed ? {} : self, isSecureContext: o.secure ?? true, location: new URL(o.href ?? 'https://lunecid.github.io/game/player-log/') } as unknown as Window;
  };

  it('framed → framed (checked first), not a secure context → insecure, another host → host', () => {
    expect(manageAllowed(win({ framed: true }))).toEqual({ ok: false, reason: 'framed' });
    expect(manageAllowed(win({ framed: true, secure: false, href: 'http://example.com/' }))).toEqual({ ok: false, reason: 'framed' });
    expect(manageAllowed(win({ secure: false }))).toEqual({ ok: false, reason: 'insecure' });
    expect(manageAllowed(win({ secure: false, href: 'http://example.com/' }))).toEqual({ ok: false, reason: 'insecure' });
    expect(manageAllowed(win({ href: 'https://example.com/game/player-log/' }))).toEqual({ ok: false, reason: 'host' });
    expect(manageAllowed(win({ href: 'https://lunecid.github.io.example.com/' }))).toEqual({ ok: false, reason: 'host' });
    expect(manageAllowed(win({ href: 'https://evil.lunecid.github.io/' }))).toEqual({ ok: false, reason: 'host' });
  });

  it('the three allowed hosts pass on any port', () => {
    for (const href of ['https://lunecid.github.io/game/player-log/', 'https://lunecid.github.io:8443/', 'http://127.0.0.1:4329/game/player-log/', 'http://127.0.0.1/', 'http://localhost:4321/en/game/player-log/']) {
      expect(manageAllowed(win({ href })), href).toEqual({ ok: true });
    }
  });
});

describe('takeManageQuery / takeReturnFragment', () => {
  const go = (path: string) => history.replaceState(null, '', path);
  const page = () => `${location.origin}/game/player-log/`;

  it('?manage is read and removed (other query keys and the fragment stay); without it nothing is touched', () => {
    go('/game/player-log/?manage');
    expect(takeManageQuery(location, history)).toBe(true);
    expect(location.href).toBe(page());
    go('/game/player-log/?r=7&manage=1#top');
    expect(takeManageQuery(location, history)).toBe(true);
    expect(location.search).toBe('?r=7');
    expect(location.hash).toBe('#top');
    go('/game/player-log/?r=7');
    const replace = vi.spyOn(history, 'replaceState');
    expect(takeManageQuery(location, history)).toBe(false);
    expect(replace).not.toHaveBeenCalled();
  });

  it('#gh=<valid ticket> → the ticket, and the URL loses both the query and the fragment', () => {
    go(`/game/player-log/?manage#gh=${TICKET}`);
    expect(takeManageQuery(location, history)).toBe(true);
    expect(takeReturnFragment(location, history)).toEqual({ kind: 'gh', ticket: TICKET });
    expect(location.href).toBe(page());
    go(`/game/player-log/?manage#gh=${TICKET}`);
    expect(takeReturnFragment(location, history)).toEqual({ kind: 'gh', ticket: TICKET });
    expect(location.href).toBe(page());
    expect(JSON.stringify(history.state) ?? '').not.toContain(TICKET);
  });

  it('a malformed ticket → null, and the fragment is still removed', () => {
    for (const bad of ['short', 'A'.repeat(39), `${'A'.repeat(40)}.x`, 'A'.repeat(2049), '']) {
      go(`/game/player-log/?manage#gh=${bad}`);
      expect(takeReturnFragment(location, history), bad).toBeNull();
      expect(location.href).toBe(page());
    }
  });

  it('#gh-error=<code> → the code; a code outside the fixed list → unknown; the URL is cleaned', () => {
    go('/game/player-log/?manage#gh-error=denied');
    expect(takeReturnFragment(location, history)).toEqual({ kind: 'gh-error', code: 'denied' });
    expect(location.href).toBe(page());
    for (const code of GH_ERROR_CODES) {
      go(`/game/player-log/#gh-error=${code}`);
      expect(takeReturnFragment(location, history)).toEqual({ kind: 'gh-error', code });
    }
    go('/en/game/player-log/?manage#gh-error=%3Cb%3Ex');
    expect(takeReturnFragment(location, history)).toEqual({ kind: 'gh-error', code: 'unknown' });
    expect(location.href).toBe(`${location.origin}/en/game/player-log/`);
  });

  it('a fragment that is not a login return is left alone', () => {
    go('/game/player-log/?r=1#top');
    const replace = vi.spyOn(history, 'replaceState');
    expect(takeReturnFragment(location, history)).toBeNull();
    expect(replace).not.toHaveBeenCalled();
    expect(location.hash).toBe('#top');
  });
});

// ---- spec §4.2: the relay client and the memory-only handle ---------------------------------------------------------

describe('createHandleBox', () => {
  it('holds one handle in memory; expiry = now + expiresIn seconds; clear forgets both', () => {
    let t = 1_000_000;
    const box = createHandleBox(() => t);
    expect(box.get()).toBeNull();
    expect(box.expiresAt()).toBeNull();
    box.set(HANDLE, 3600);
    expect(box.get()).toBe(HANDLE);
    expect(box.expiresAt()).toBe(1_000_000 + 3_600_000);
    t += 3_700_000; // an expired handle is kept until cleared: /gh/logout still revokes the grant with it
    expect(box.get()).toBe(HANDLE);
    box.clear();
    expect(box.get()).toBeNull();
    expect(box.expiresAt()).toBeNull();
  });
});

describe('createRelay().relay', () => {
  it('relay null → relay-unset and zero requests (every call path)', async () => {
    const h = harness({ relay: null });
    const box = createHandleBox(h.deps.now);
    box.set(HANDLE, 3600);
    const api = createRelay(h.deps, box);
    expect(await failure(api.relay('vars.list'))).toMatchObject({ code: 'relay-unset', status: null });
    expect(await failure(api.session(TICKET, 'N'.repeat(22)))).toMatchObject({ code: 'relay-unset' });
    expect(await failure(api.verifySteam({ s: 'S'.repeat(22) }))).toMatchObject({ code: 'relay-unset' });
    expect(() => startGithubLogin(h.deps, 'ko')).toThrow(RelayError);
    expect(() => startGithubLoginSameTab(h.deps, 'ko')).toThrow(RelayError);
    expect(h.deps.open).not.toHaveBeenCalled();
    expect(h.assigned).toEqual([]);
    expect(h.fetch).not.toHaveBeenCalled();
  });

  it('POST {relay}/gh/api with exactly the fetch options, the bearer handle and a JSON body', async () => {
    const h = harness();
    h.respond((url) => reply(url, 200, [{ name: 'ACCOUNT_GENSHIN_UID', value: '618285856' }]));
    const box = createHandleBox(h.deps.now);
    box.set(HANDLE, 3600);
    const api = createRelay(h.deps, box);
    await expect(api.relay('vars.list')).resolves.toEqual([{ name: 'ACCOUNT_GENSHIN_UID', value: '618285856' }]);
    h.respond((url) => reply(url, 200, { ok: true }));
    await expect(api.relay('vars.set', { name: 'ACCOUNT_GENSHIN_UID', value: '618285856' })).resolves.toEqual({ ok: true });
    await api.relay('dispatch', { op: 'vars.delete' });
    expect(h.calls.map((c) => c.url)).toEqual([`${RELAY}/gh/api`, `${RELAY}/gh/api`, `${RELAY}/gh/api`]);
    expect(h.calls[0]?.init).toEqual({
      ...OPTIONS,
      headers: { Authorization: `Bearer ${HANDLE}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ op: 'vars.list' }),
    });
    expect(bodyOf(h.calls[1]!)).toEqual({ op: 'vars.set', name: 'ACCOUNT_GENSHIN_UID', value: '618285856' });
    expect(bodyOf(h.calls[2]!)).toEqual({ op: 'dispatch' }); // args never replace the op
  });

  it('an op outside the list, a missing handle, or a relay that is not a bare origin → no request', async () => {
    const h = harness();
    const box = createHandleBox(h.deps.now);
    const api = createRelay(h.deps, box);
    expect(await failure(api.relay('vars.list'))).toMatchObject({ code: 'handle', status: null });
    box.set(HANDLE, 3600);
    expect(await failure(api.relay('repo.delete' as RelayOp))).toMatchObject({ code: 'forbidden', status: null });
    for (const relay of [`${RELAY}/`, `${RELAY}/x`, 'https://user@account-relay.test-sub.workers.dev', 'not a url']) {
      const other = harness({ relay });
      const b = createHandleBox(other.deps.now);
      b.set(HANDLE, 3600);
      expect(await failure(createRelay(other.deps, b).relay('vars.list')), relay).toMatchObject({ code: 'forbidden' });
      expect(other.fetch).not.toHaveBeenCalled();
    }
    expect(h.fetch).not.toHaveBeenCalled();
  });

  it('a response from another origin (URL mismatch) is refused', async () => {
    const h = harness();
    const box = createHandleBox(h.deps.now);
    box.set(HANDLE, 3600);
    const api = createRelay(h.deps, box);
    h.respond(() => reply('https://evil.example/gh/api', 200, [{ name: 'ACCOUNT_GENSHIN_UID', value: '618285856' }]));
    expect(await failure(api.relay('vars.list'))).toMatchObject({ code: 'forbidden' });
    h.respond(() => new Response('[]', { status: 200 })); // no final URL at all
    expect(await failure(api.relay('vars.list'))).toMatchObject({ code: 'forbidden' });
    expect(box.get()).toBe(HANDLE);
  });

  it('TypeError (CORS, redirect: error, offline) → network', async () => {
    const h = harness();
    const box = createHandleBox(h.deps.now);
    box.set(HANDLE, 3600);
    h.respond(() => {
      throw new TypeError('Failed to fetch');
    });
    const err = await failure(createRelay(h.deps, box).relay('workflow.get'));
    expect(err).toMatchObject({ code: 'network', status: null });
    expect(box.get()).toBe(HANDLE);
  });

  it('401 handle clears the box and asks the relay to revoke the grant with that handle', async () => {
    const h = harness();
    const box = createHandleBox(h.deps.now);
    box.set(HANDLE, 3600);
    h.respond((url) => (url.endsWith('/gh/api') ? reply(url, 401, { error: 'handle' }) : reply(url, 204)));
    const err = await failure(createRelay(h.deps, box).relay('vars.list'));
    expect(err).toMatchObject({ code: 'handle', status: 401 });
    expect(box.get()).toBeNull();
    expect(box.expiresAt()).toBeNull();
    await flush();
    expect(h.calls.map((c) => c.url)).toEqual([`${RELAY}/gh/api`, `${RELAY}/gh/logout`]);
    expect(h.calls[1]?.init).toEqual({ ...OPTIONS, headers: { Authorization: `Bearer ${HANDLE}`, 'Content-Type': 'application/json' } });
    expect(String(err)).not.toContain(HANDLE);
  });

  it('error bodies: the code, the status, retryAfter (429) and runId (409) only; other fields ignored', async () => {
    const h = harness();
    const box = createHandleBox(h.deps.now);
    box.set(HANDLE, 3600);
    const api = createRelay(h.deps, box);
    h.respond((url) => reply(url, 429, { error: 'rate', retryAfter: 120, note: 'x' }));
    const rate = await failure(api.relay('vars.list'));
    expect(rate).toMatchObject({ code: 'rate', status: 429 });
    expect(rate.extra).toEqual({ retryAfter: 120 });
    h.respond((url) => reply(url, 409, { error: 'busy', runId: 4242, htmlUrl: 'https://evil.example/' }));
    const busy = await failure(api.relay('dispatch'));
    expect(busy).toMatchObject({ code: 'busy', status: 409 });
    expect(busy.extra).toEqual({ runId: 4242 });
    h.respond((url) => reply(url, 400, { error: 'invalid', field: 'ACCOUNT_RIOT_ID', retryAfter: 'soon', runId: -1 }));
    const invalid = await failure(api.relay('vars.set', { name: 'ACCOUNT_RIOT_ID', value: 'x' }));
    expect(invalid).toMatchObject({ code: 'invalid', status: 400 });
    expect(invalid.extra).toBeUndefined();
    for (const [status, body] of [[502, '<html>bad gateway</html>'], [500, { error: 'Not A Code' }], [503, { error: 7 }], [403, null]] as const) {
      h.respond((url) => reply(url, status, body ?? undefined));
      expect(await failure(api.relay('vars.list')), String(status)).toMatchObject({ code: 'unknown', status });
    }
    for (const code of ['forbidden', 'gh-perm', 'gh-rejected', 'dispatch', 'upstream', 'config']) {
      h.respond((url) => reply(url, 403, { error: code }));
      expect(await failure(api.relay('vars.list'))).toMatchObject({ code, status: 403 });
    }
    expect(box.get()).toBe(HANDLE); // only 401 handle ends the login
  });
});

describe('createRelay().session / verifySteam / logout / beaconLogout', () => {
  it('session: POST /gh/session { ticket, n } without a handle; the handle lands in the box, expiry = now + expiresIn s', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(1_800_000_000_000);
    const h = harness();
    const box = createHandleBox(h.deps.now);
    h.respond((url) => reply(url, 200, { handle: HANDLE, expiresIn: 3600 }));
    const n = nonce(h.deps.random);
    await createRelay(h.deps, box).session(TICKET, n);
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0]?.url).toBe(`${RELAY}/gh/session`);
    expect(h.calls[0]?.init).toEqual({ ...OPTIONS, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticket: TICKET, n }) });
    expect(box.get()).toBe(HANDLE);
    expect(box.expiresAt()).toBe(1_800_000_000_000 + 3600 * 1000);

    h.respond((url) => reply(url, 200, { handle: HANDLE, expiresIn: 1795 }));
    await createRelay(h.deps, box).session(TICKET, n);
    expect(box.expiresAt()).toBe(1_800_000_000_000 + 1795 * 1000);
    h.respond((url) => reply(url, 200, { handle: HANDLE, expiresIn: 7200 })); // never longer than the 60-minute cap
    await createRelay(h.deps, box).session(TICKET, n);
    expect(box.expiresAt()).toBe(1_800_000_000_000 + 3600 * 1000);
  });

  it("session: the same-tab path (n '') sends n: null, the form the relay's tab tickets carry", async () => {
    const h = harness();
    const box = createHandleBox(h.deps.now);
    h.respond((url) => reply(url, 200, { handle: HANDLE, expiresIn: 3600 }));
    await createRelay(h.deps, box).session(TICKET, '');
    expect(bodyOf(h.calls[0]!)).toEqual({ ticket: TICKET, n: null });
    expect(box.get()).toBe(HANDLE);
  });

  it('session: 401 ticket, a malformed answer or a malformed ticket leave the box empty', async () => {
    const h = harness();
    const box = createHandleBox(h.deps.now);
    const api = createRelay(h.deps, box);
    h.respond((url) => reply(url, 401, { error: 'ticket' }));
    expect(await failure(api.session(TICKET, 'N'.repeat(22)))).toMatchObject({ code: 'ticket', status: 401 });
    for (const body of [{ handle: 'has space', expiresIn: 3600 }, { handle: HANDLE, expiresIn: 0 }, { handle: HANDLE }, [], 'x']) {
      h.respond((url) => reply(url, 200, body));
      expect(await failure(api.session(TICKET, 'N'.repeat(22)))).toMatchObject({ code: 'unknown' });
    }
    expect(box.get()).toBeNull();
    const before = h.calls.length;
    expect(await failure(api.session('short', 'N'.repeat(22)))).toMatchObject({ code: 'ticket', status: null });
    expect(h.calls).toHaveLength(before);
  });

  it('verifySteam: POST /openid/verify with the handle, only openid.* and s; exactly the four answer fields', async () => {
    const h = harness();
    const box = createHandleBox(h.deps.now);
    box.set(HANDLE, 3600);
    const api = createRelay(h.deps, box);
    const s = 'S'.repeat(22);
    const fields = { 'openid.mode': 'id_res', 'openid.claimed_id': 'https://steamcommunity.com/openid/id/76561197960435530', s, other: 'dropped' };
    h.respond((url) => reply(url, 200, { steamid: '76561197960435530', state: s, personaname: 'Robin', profilePublic: true, avatar: 'x' }));
    await expect(api.verifySteam(fields)).resolves.toEqual({ steamid: '76561197960435530', state: s, personaname: 'Robin', profilePublic: true });
    expect(h.calls[0]?.url).toBe(`${RELAY}/openid/verify`);
    expect(h.calls[0]?.init).toEqual({
      ...OPTIONS,
      headers: { Authorization: `Bearer ${HANDLE}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ 'openid.mode': 'id_res', 'openid.claimed_id': 'https://steamcommunity.com/openid/id/76561197960435530', s }),
    });
    h.respond((url) => reply(url, 200, { steamid: '76561197960435530', state: s, personaname: null, profilePublic: null }));
    await expect(api.verifySteam(fields)).resolves.toEqual({ steamid: '76561197960435530', state: s, personaname: null, profilePublic: null });
  });

  it('verifySteam: cancel/invalid (400), steam-busy (502), another state or a bad SteamID → errors', async () => {
    const h = harness();
    const box = createHandleBox(h.deps.now);
    box.set(HANDLE, 3600);
    const api = createRelay(h.deps, box);
    const s = 'S'.repeat(22);
    for (const [status, code] of [[400, 'cancel'], [400, 'invalid'], [502, 'steam-busy']] as const) {
      h.respond((url) => reply(url, status, { error: code }));
      expect(await failure(api.verifySteam({ s }))).toMatchObject({ code, status });
    }
    for (const body of [
      { steamid: '76561197960435530', state: 'T'.repeat(22), personaname: 'Robin', profilePublic: true },
      { steamid: '76561197960265728', state: s, personaname: 'Robin', profilePublic: true },
      { steamid: '76561197960435530', state: s, personaname: 7, profilePublic: true },
      { steamid: '76561197960435530', state: s, personaname: 'Robin', profilePublic: 'yes' },
    ]) {
      h.respond((url) => reply(url, 200, body));
      expect(await failure(api.verifySteam({ s }))).toMatchObject({ code: 'invalid' });
    }
    expect(box.get()).toBe(HANDLE);
  });

  it('logout: POST /gh/logout with the handle and no body; true only when the relay confirmed with 204', async () => {
    const h = harness();
    const box = createHandleBox(h.deps.now);
    const api = createRelay(h.deps, box);
    await expect(api.logout()).resolves.toBe(true); // no handle held: nothing to revoke from this page
    expect(h.fetch).not.toHaveBeenCalled();
    box.set(HANDLE, 3600);
    h.respond((url) => reply(url, 204));
    await expect(api.logout()).resolves.toBe(true);
    expect(box.get()).toBeNull();
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0]?.url).toBe(`${RELAY}/gh/logout`);
    expect(h.calls[0]?.init).toEqual({ ...OPTIONS, headers: { Authorization: `Bearer ${HANDLE}`, 'Content-Type': 'application/json' } });
  });

  it('logout: offline, an error answer or a non-204 success → false (the grant may still be alive); the box is empty anyway', async () => {
    const h = harness();
    const box = createHandleBox(h.deps.now);
    const api = createRelay(h.deps, box);
    const answers: Responder[] = [
      () => {
        throw new TypeError('offline');
      },
      (url) => reply(url, 503, { error: 'config' }),
      (url) => reply(url, 200, {}),
      () => reply('https://evil.example/gh/logout', 204),
    ];
    for (const answer of answers) {
      box.set(HANDLE, 3600);
      h.respond(answer);
      await expect(api.logout()).resolves.toBe(false);
      expect(box.get()).toBeNull();
    }
    expect(h.calls).toHaveLength(answers.length);
  });

  it('beaconLogout: sendBeacon(relay + /gh/logout, handle) once, then the box is empty; no fetch', () => {
    const h = harness();
    const box = createHandleBox(h.deps.now);
    const api = createRelay(h.deps, box);
    api.beaconLogout();
    expect(h.beacons).toEqual([]);
    box.set(HANDLE, 3600);
    api.beaconLogout();
    api.beaconLogout();
    expect(h.beacons).toEqual([[`${RELAY}/gh/logout`, HANDLE]]);
    expect(box.get()).toBeNull();
    expect(h.fetch).not.toHaveBeenCalled();
  });
});

// ---- spec §4.2, §4.3: popups ----------------------------------------------------------------------------------------

describe('popups', () => {
  it('nonce: 16 random bytes → base64url, 22 characters', () => {
    const bytes = Uint8Array.from({ length: 16 }, (_, i) => 250 - i * 3);
    const random = vi.fn((_n: number) => bytes);
    expect(nonce(random)).toBe(Buffer.from(bytes).toString('base64url'));
    expect(random).toHaveBeenCalledWith(16);
    const real = (n: number) => crypto.getRandomValues(new Uint8Array(n));
    const a = nonce(real);
    expect(a).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(nonce(real)).not.toBe(a);
  });

  it("GitHub: open('about:blank', 'acct-gh', 'popup,…'), then opener = null, then location.replace to the login URL", () => {
    const { w, log, open } = fakePopup();
    const h = harness({ open });
    const out = startGithubLogin(h.deps, 'ko');
    if (!('n' in out)) throw new Error('blocked');
    expect(out.n).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith('about:blank', 'acct-gh', POPUP);
    expect(w.opener).toBeNull();
    expect(w.location.replace).toHaveBeenCalledTimes(1);
    expect(w.location.replace).toHaveBeenCalledWith(`${RELAY}/gh/login?lang=ko&n=${out.n}`);
    expect(log).toEqual(['open', 'replace opener=null']);
    const en = startGithubLogin(harness({ open: fakePopup().open }).deps, 'en');
    expect('n' in en).toBe(true);
    expect(h.fetch).not.toHaveBeenCalled();
  });

  it('open → null → { blocked: true }; same tab → location.assign with &mode=tab', () => {
    const h = harness({ open: vi.fn((_u: string, _t: string, _f: string): Window | null => null) });
    expect(startGithubLogin(h.deps, 'ko')).toEqual({ blocked: true });
    expect(startSteamLogin(h.deps)).toEqual({ blocked: true });
    startGithubLoginSameTab(h.deps, 'en');
    expect(h.assigned).toEqual([`${RELAY}/gh/login?lang=en&mode=tab`]);
    startGithubLoginSameTab(h.deps, 'ko');
    expect(h.assigned[1]).toBe(`${RELAY}/gh/login?lang=ko&mode=tab`);
  });

  it('a popup that refuses navigation counts as blocked and is closed', () => {
    const { w, open } = fakePopup();
    w.location.replace.mockImplementation(() => {
      throw new Error('closed');
    });
    expect(startGithubLogin(harness({ open }).deps, 'ko')).toEqual({ blocked: true });
    expect(w.close).toHaveBeenCalled();
  });

  it("Steam: open('about:blank', 'acct-steam', …), opener = null, then the spec's OpenID URL with the pending state", () => {
    const { w, log, open } = fakePopup();
    const h = harness({ open });
    const out = startSteamLogin(h.deps);
    if (!('state' in out)) throw new Error('blocked');
    expect(out.state).toMatch(/^[A-Za-z0-9_-]{16,128}$/);
    expect(open).toHaveBeenCalledWith('about:blank', 'acct-steam', POPUP);
    expect(log).toEqual(['open', 'replace opener=null']);
    const url = steamLoginUrl(out.state);
    expect(w.location.replace).toHaveBeenCalledWith(url);
    expect(url).toBe(
      'https://steamcommunity.com/openid/login?openid.ns=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0&openid.mode=checkid_setup' +
        '&openid.claimed_id=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0%2Fidentifier_select' +
        '&openid.identity=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0%2Fidentifier_select' +
        `&openid.return_to=https%3A%2F%2Flunecid.github.io%2Flink-return%2F%3Fs%3D${out.state}` +
        '&openid.realm=https%3A%2F%2Flunecid.github.io%2F',
    );
    const u = new URL(url);
    expect(`${u.origin}${u.pathname}`).toBe('https://steamcommunity.com/openid/login');
    expect(Object.fromEntries(u.searchParams)).toEqual({
      'openid.ns': 'http://specs.openid.net/auth/2.0',
      'openid.mode': 'checkid_setup',
      'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
      'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
      'openid.return_to': `https://lunecid.github.io/link-return/?s=${out.state}`,
      'openid.realm': 'https://lunecid.github.io/',
    });
    expect(() => steamLoginUrl('short')).toThrow();
    expect(() => steamLoginUrl(`${'A'.repeat(20)}&openid.realm=x`)).toThrow();
  });
});

// ---- spec §4.2, §4.3: BroadcastChannel('acct-link') ------------------------------------------------------------------

describe('listenLinkChannel', () => {
  function setup(pending: { n: string | null; s: string | null }) {
    let ch: FakeChannel | null = null;
    const names: string[] = [];
    const h = harness({
      channel: (name) => {
        names.push(name);
        ch = new FakeChannel();
        return ch as unknown as BroadcastChannel;
      },
    });
    const on = { ticket: vi.fn(), error: vi.fn(), steam: vi.fn() };
    const stop = listenLinkChannel(h.deps, {
      pendingN: () => pending.n,
      pendingSteamState: () => pending.s,
      onTicket: on.ticket,
      onGhError: on.error,
      onSteam: on.steam,
    });
    if (ch === null) throw new Error('no channel');
    return { ch: ch as FakeChannel, names, on, stop };
  }

  it('gh: a wrong n is ignored; the right n → onTicket once (a replay is ignored); a bad ticket is ignored', () => {
    const n = 'N'.repeat(22);
    const { ch, names, on } = setup({ n, s: null });
    expect(names).toEqual(['acct-link']);
    ch.emit({ kind: 'gh', ticket: TICKET, n: 'M'.repeat(22) });
    ch.emit({ kind: 'gh', ticket: TICKET, n: '' });
    ch.emit({ kind: 'gh', ticket: TICKET });
    ch.emit({ kind: 'gh', ticket: 'short', n });
    expect(on.ticket).not.toHaveBeenCalled();
    ch.emit({ kind: 'gh', ticket: TICKET, n });
    ch.emit({ kind: 'gh', ticket: TICKET, n });
    expect(on.ticket).toHaveBeenCalledTimes(1);
    expect(on.ticket).toHaveBeenCalledWith(TICKET, n);
  });

  it("gh with no pending popup login (n '' included) is ignored", () => {
    const { ch, on } = setup({ n: null, s: null });
    ch.emit({ kind: 'gh', ticket: TICKET, n: '' });
    ch.emit({ kind: 'gh', ticket: TICKET, n: 'N'.repeat(22) });
    expect(on.ticket).not.toHaveBeenCalled();
  });

  it('gh-error with n: null only while a login is pending; a wrong n is ignored; unknown codes → unknown', () => {
    const idle = setup({ n: null, s: null });
    idle.ch.emit({ kind: 'gh-error', code: 'denied', n: null });
    expect(idle.on.error).not.toHaveBeenCalled();
    const n = 'N'.repeat(22);
    const busy = setup({ n, s: null });
    busy.ch.emit({ kind: 'gh-error', code: 'denied', n: 'M'.repeat(22) });
    expect(busy.on.error).not.toHaveBeenCalled();
    busy.ch.emit({ kind: 'gh-error', code: 'denied', n: null });
    busy.ch.emit({ kind: 'gh-error', code: 'not-owner', n });
    busy.ch.emit({ kind: 'gh-error', code: 'x<y', n });
    expect(busy.on.error.mock.calls).toEqual([['denied'], ['not-owner'], ['unknown']]);
    expect(busy.on.ticket).not.toHaveBeenCalled();
  });

  it('steam: a wrong or missing s is ignored; the pending s → onSteam(openid.* fields, s) once', () => {
    const s = 'S'.repeat(22);
    const none = setup({ n: null, s: null });
    none.ch.emit({ kind: 'steam', params: { 'openid.mode': 'id_res' }, s });
    expect(none.on.steam).not.toHaveBeenCalled();
    const { ch, on } = setup({ n: null, s });
    ch.emit({ kind: 'steam', params: { 'openid.mode': 'id_res' }, s: 'T'.repeat(22) });
    ch.emit({ kind: 'steam', params: { 'openid.mode': 'id_res' }, s: '' });
    ch.emit({ kind: 'steam', params: null, s });
    expect(on.steam).not.toHaveBeenCalled();
    ch.emit({ kind: 'steam', params: { 'openid.mode': 'id_res', 'openid.sig': 'abc', other: 'x', 'openid.n': 3 }, s });
    ch.emit({ kind: 'steam', params: { 'openid.mode': 'id_res' }, s });
    expect(on.steam).toHaveBeenCalledTimes(1);
    expect(on.steam).toHaveBeenCalledWith({ 'openid.mode': 'id_res', 'openid.sig': 'abc' }, s);
  });

  it('other messages are ignored; the returned function stops listening and closes the channel', () => {
    const n = 'N'.repeat(22);
    const { ch, on, stop } = setup({ n, s: 'S'.repeat(22) });
    for (const data of [null, 'gh', 42, { kind: 'other', n }, { kind: 'gh', ticket: 7, n }]) ch.emit(data);
    stop();
    expect(ch.closed).toBe(true);
    ch.emit({ kind: 'gh', ticket: TICKET, n });
    expect(on.ticket).not.toHaveBeenCalled();
    expect(on.error).not.toHaveBeenCalled();
    expect(on.steam).not.toHaveBeenCalled();
  });
});

// ---- spec §3.7, §4.2: the session clock ------------------------------------------------------------------------------

describe('createSessionClock', () => {
  function clock(expiresIn: number | null = 60 * MIN) {
    vi.useFakeTimers();
    vi.setSystemTime(1_800_000_000_000);
    const t0 = Date.now();
    const on = { idleWarn: vi.fn(), capWarn: vi.fn(), end: vi.fn() };
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const wake = { check: null as (() => void) | null, unsubscribed: 0 };
    const c = createSessionClock({
      now: () => Date.now(),
      setTimeout: ((fn: () => void, ms?: number) => setTimeout(fn, ms)) as unknown as typeof setTimeout,
      clearTimeout: ((t?: ReturnType<typeof setTimeout>) => clearTimeout(t)) as typeof clearTimeout,
      listenWake: (check) => {
        wake.check = check;
        return () => void (wake.unsubscribed += 1);
      },
      idleMinutes: 15,
      idleWarnMinutes: 2,
      capWarnMinutes: 5,
      expiresAt: () => (expiresIn === null ? null : t0 + expiresIn),
      onIdleWarn: on.idleWarn,
      onCapWarn: on.capWarn,
      onEnd: on.end,
    });
    /** The device slept or the tab was frozen: the wall clock moves, no timer runs. */
    const sleep = (ms: number) => vi.setSystemTime(Date.now() + ms);
    return { c, on, fetchSpy, wake, sleep };
  }

  it('idle: the warning at 13 min (idleWarnMinutes 2), the end at 15 min; nothing after the end', () => {
    const { on } = clock();
    vi.advanceTimersByTime(13 * MIN - 1);
    expect(on.idleWarn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(on.idleWarn).toHaveBeenCalledWith(2);
    vi.advanceTimersByTime(2 * MIN - 1);
    expect(on.end).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(on.end.mock.calls).toEqual([['idle']]);
    vi.advanceTimersByTime(60 * MIN);
    expect(on.capWarn).not.toHaveBeenCalled();
    expect(on.end).toHaveBeenCalledTimes(1);
  });

  it('touch() restarts only the idle timer and makes no request; the cap warns at expiresAt − 5 min and ends at expiresAt', () => {
    const { c, on, fetchSpy } = clock();
    for (let i = 0; i < 5; i += 1) {
      vi.advanceTimersByTime(10 * MIN);
      c.touch();
    }
    expect(on.idleWarn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(5 * MIN - 1);
    expect(on.capWarn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(on.capWarn.mock.calls).toEqual([[5]]);
    vi.advanceTimersByTime(5 * MIN - 1);
    expect(on.end).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(on.end.mock.calls).toEqual([['cap']]);
    expect(on.idleWarn).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('a touch late in the idle period moves the warning to 13 min after the touch', () => {
    const { c, on } = clock();
    vi.advanceTimersByTime(12 * MIN);
    c.touch();
    vi.advanceTimersByTime(13 * MIN - 1);
    expect(on.idleWarn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(on.idleWarn).toHaveBeenCalledTimes(1);
  });

  it('pause() (run tracking) stops the idle timer, touch() does not restart it, resume() does', () => {
    const { c, on } = clock();
    vi.advanceTimersByTime(5 * MIN);
    c.pause();
    c.touch();
    vi.advanceTimersByTime(30 * MIN);
    expect(on.idleWarn).not.toHaveBeenCalled();
    expect(on.end).not.toHaveBeenCalled();
    c.resume();
    vi.advanceTimersByTime(13 * MIN);
    expect(on.idleWarn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2 * MIN);
    expect(on.end.mock.calls).toEqual([['idle']]);
  });

  it('while paused the cap still warns and ends the login', () => {
    const { c, on } = clock();
    c.pause();
    vi.advanceTimersByTime(55 * MIN);
    expect(on.capWarn.mock.calls).toEqual([[5]]);
    vi.advanceTimersByTime(5 * MIN);
    expect(on.end.mock.calls).toEqual([['cap']]);
    expect(on.idleWarn).not.toHaveBeenCalled();
  });

  it('a short handle warns at once with the minutes left; no expiry → no cap; stop() silences everything', () => {
    const short = clock(3 * MIN);
    vi.advanceTimersByTime(0);
    expect(short.on.capWarn).toHaveBeenCalledWith(3);
    vi.advanceTimersByTime(3 * MIN);
    expect(short.on.end.mock.calls).toEqual([['cap']]);
    vi.useRealTimers();

    const open = clock(null);
    open.c.pause();
    vi.advanceTimersByTime(24 * 60 * MIN);
    expect(open.on.capWarn).not.toHaveBeenCalled();
    expect(open.on.end).not.toHaveBeenCalled();
    vi.useRealTimers();

    const stopped = clock();
    stopped.c.stop();
    stopped.c.touch();
    stopped.c.resume();
    vi.advanceTimersByTime(120 * MIN);
    expect(stopped.on.idleWarn).not.toHaveBeenCalled();
    expect(stopped.on.capWarn).not.toHaveBeenCalled();
    expect(stopped.on.end).not.toHaveBeenCalled();
    expect(stopped.wake.unsubscribed).toBe(1);
  });

  it('a wake (visibilitychange, pageshow) after sleeping past the idle deadline ends at once and unsubscribes', () => {
    const { on, wake, sleep } = clock();
    expect(wake.check).toBeTypeOf('function');
    sleep(16 * MIN);
    expect(on.end).not.toHaveBeenCalled(); // no timer ran while asleep
    wake.check?.();
    expect(on.end.mock.calls).toEqual([['idle']]);
    expect(wake.unsubscribed).toBe(1);
    vi.advanceTimersByTime(120 * MIN);
    expect(on.end).toHaveBeenCalledTimes(1);
    expect(on.idleWarn).not.toHaveBeenCalled();
  });

  it('touch() after sleeping past the idle deadline ends instead of restarting; past both deadlines the earlier names it', () => {
    const idle = clock();
    idle.sleep(15 * MIN);
    idle.c.touch();
    expect(idle.on.end.mock.calls).toEqual([['idle']]);
    vi.useRealTimers();

    const both = clock();
    both.sleep(90 * MIN);
    both.c.touch();
    expect(both.on.end.mock.calls).toEqual([['idle']]);
    vi.useRealTimers();

    const paused = clock();
    paused.c.pause();
    paused.sleep(90 * MIN);
    paused.c.touch();
    paused.wake.check?.();
    expect(paused.on.end.mock.calls).toEqual([['cap']]);
  });

  it('resume() after the cap passed during run tracking ends with cap; pause() past a deadline ends too', () => {
    const tracked = clock();
    tracked.c.pause();
    tracked.sleep(61 * MIN);
    tracked.c.resume();
    expect(tracked.on.end.mock.calls).toEqual([['cap']]);
    vi.useRealTimers();

    const late = clock();
    late.sleep(20 * MIN);
    late.c.pause();
    expect(late.on.end.mock.calls).toEqual([['idle']]);
  });

  it('a wake before the deadlines re-arms from the absolute times: the warning comes at once when due, the end on time', () => {
    const { on, wake, sleep } = clock();
    sleep(14 * MIN);
    wake.check?.();
    expect(on.end).not.toHaveBeenCalled();
    vi.advanceTimersByTime(0);
    expect(on.idleWarn.mock.calls).toEqual([[2]]);
    vi.advanceTimersByTime(MIN - 1);
    expect(on.end).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(on.end.mock.calls).toEqual([['idle']]);
    expect(on.idleWarn).toHaveBeenCalledTimes(1);
  });
});

// ---- spec §4.3, §4.4: the form store ---------------------------------------------------------------------------------

describe('createFormStore / varsFromList', () => {
  it('varsFromList keeps ACCOUNT_VARS names with string values only (first wins)', () => {
    expect(
      varsFromList([
        { name: 'ACCOUNT_GENSHIN_UID', value: '618285856' },
        { name: 'GH_PROFILE_TOKEN', value: 'x' },
        { name: 'ACCOUNT_GENSHIN_UID', value: '1300025292' },
        { name: 'ACCOUNT_ZZZ_UID', value: 1300025292 },
        { name: '__proto__', value: 'x' },
        { name: 'ACCOUNT_RIOT_ID', value: 'Hide on bush#KR1' },
        null,
        'ACCOUNT_STEAM_ID64',
      ]),
    ).toEqual({ ACCOUNT_GENSHIN_UID: '618285856', ACCOUNT_RIOT_ID: 'Hide on bush#KR1' });
    expect(varsFromList({ variables: [] })).toEqual({});
    expect(varsFromList(null)).toEqual({});
  });

  it('changed/dirty per field; load fills from vars.list; markSaved', () => {
    const s = createFormStore<AccountVar>();
    expect(s.get('ACCOUNT_GENSHIN_UID')).toBe('');
    expect(s.dirty()).toBe(false);
    s.load(varsFromList([{ name: 'ACCOUNT_GENSHIN_UID', value: '618285856' }, { name: 'ACCOUNT_RIOT_ID', value: 'Hide on bush#KR1' }]));
    expect(s.get('ACCOUNT_GENSHIN_UID')).toBe('618285856');
    expect(s.get('ACCOUNT_RIOT_ID')).toBe('Hide on bush#KR1');
    expect(s.changed('ACCOUNT_GENSHIN_UID')).toBe(false);
    expect(s.dirty()).toBe(false);

    s.set('ACCOUNT_GENSHIN_NAME', 'Robin');
    expect(s.changed('ACCOUNT_GENSHIN_NAME')).toBe(true);
    expect(s.changed('ACCOUNT_GENSHIN_UID')).toBe(false);
    expect(s.dirty()).toBe(true);
    s.set('ACCOUNT_GENSHIN_NAME', '');
    expect(s.changed('ACCOUNT_GENSHIN_NAME')).toBe(false);
    expect(s.dirty()).toBe(false);

    s.set('ACCOUNT_GENSHIN_UID', '1300025292');
    expect(s.changed('ACCOUNT_GENSHIN_UID')).toBe(true);
    // A reload after logging in again keeps what was typed; untouched fields follow the stored values.
    s.load({ ACCOUNT_GENSHIN_UID: '618285856', ACCOUNT_ZZZ_UID: '1300025292' });
    expect(s.get('ACCOUNT_GENSHIN_UID')).toBe('1300025292');
    expect(s.changed('ACCOUNT_GENSHIN_UID')).toBe(true);
    expect(s.get('ACCOUNT_ZZZ_UID')).toBe('1300025292');
    expect(s.changed('ACCOUNT_ZZZ_UID')).toBe(false);
    expect(s.get('ACCOUNT_RIOT_ID')).toBe('');
    expect(s.changed('ACCOUNT_RIOT_ID')).toBe(false);

    s.markSaved('ACCOUNT_GENSHIN_UID');
    expect(s.get('ACCOUNT_GENSHIN_UID')).toBe('1300025292');
    expect(s.changed('ACCOUNT_GENSHIN_UID')).toBe(false);
    expect(s.dirty()).toBe(false);
    s.set('ACCOUNT_ZZZ_UID', '');
    expect(s.changed('ACCOUNT_ZZZ_UID')).toBe(true);
    s.markSaved('ACCOUNT_ZZZ_UID');
    expect(s.changed('ACCOUNT_ZZZ_UID')).toBe(false);
    expect(s.dirty()).toBe(false);
  });
});

// ---- spec §4.6: run tracking -----------------------------------------------------------------------------------------

describe('retryAfterSeconds', () => {
  it('a retryAfter as seconds to wait: at most a day; anything but a finite number ≥ 0 gives the fallback', () => {
    expect(retryAfterSeconds(120, 60)).toBe(120);
    expect(retryAfterSeconds(0, 60)).toBe(0);
    expect(retryAfterSeconds(86_400, 60)).toBe(86_400);
    expect(retryAfterSeconds(86_401, 60)).toBe(86_400);
    expect(retryAfterSeconds(1e13, 60)).toBe(86_400);
    for (const value of [undefined, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -1]) expect(retryAfterSeconds(value, 60), String(value)).toBe(60);
  });
});

describe('pollRun', () => {
  function setup(answer: (op: string, poll: number) => Response | ((url: string) => Response)) {
    vi.useFakeTimers();
    vi.setSystemTime(1_800_000_000_000);
    const h = harness();
    let polls = 0;
    h.respond((url, init) => {
      if (url.endsWith('/gh/logout')) return reply(url, 204);
      const op = (JSON.parse(String(init.body)) as { op: string }).op;
      if (op === 'run.get') polls += 1;
      const a = answer(op, polls);
      return a instanceof Response ? a : a(url);
    });
    const box = createHandleBox(h.deps.now);
    box.set(HANDLE, 3600);
    const api = createRelay(h.deps, box);
    let visible = true;
    const on = { update: vi.fn(), error: vi.fn(), stop: vi.fn() };
    const cancel = pollRun(h.deps, api, 4242, { visible: () => visible, onUpdate: on.update, onError: on.error, onStop: on.stop });
    const ops = () => h.calls.filter((c) => c.url === `${RELAY}/gh/api`).map((c) => bodyOf(c));
    return { h, box, on, cancel, ops, setVisible: (v: boolean) => void (visible = v) };
  }
  const running = (op: string) => (url: string) => reply(url, 200, op === 'run.get' ? { status: 'in_progress', conclusion: null, htmlUrl: null } : [{ name: 'build', status: 'in_progress', conclusion: null, stepsDone: 2, stepsTotal: 9 }]);

  it('run.get + run.jobs at once and every 20 s; onUpdate gets both answers', async () => {
    const { on, ops, cancel } = setup((op) => running(op));
    await vi.advanceTimersByTimeAsync(0);
    expect(ops()).toEqual([{ op: 'run.get', runId: 4242 }, { op: 'run.jobs', runId: 4242 }]);
    expect(on.update).toHaveBeenCalledWith({ status: 'in_progress', conclusion: null, htmlUrl: null }, [{ name: 'build', status: 'in_progress', conclusion: null, stepsDone: 2, stepsTotal: 9 }]);
    await vi.advanceTimersByTimeAsync(20_000 - 1);
    expect(ops()).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(ops()).toHaveLength(4);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(ops()).toHaveLength(6);
    cancel();
    await vi.advanceTimersByTimeAsync(10 * MIN);
    expect(ops()).toHaveLength(6);
    expect(on.stop).not.toHaveBeenCalled();
  });

  it('no calls while the tab is hidden; calls resume once it is visible', async () => {
    const { ops, setVisible, cancel } = setup((op) => running(op));
    await vi.advanceTimersByTimeAsync(0);
    expect(ops()).toHaveLength(2);
    setVisible(false);
    await vi.advanceTimersByTimeAsync(5 * MIN);
    expect(ops()).toHaveLength(2);
    setVisible(true);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(ops()).toHaveLength(4);
    cancel();
  });

  it('stops at 45 min with timeout (at most 270 calls)', async () => {
    const { on, ops } = setup((op) => running(op));
    await vi.advanceTimersByTimeAsync(45 * MIN - 1);
    expect(on.stop).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(on.stop.mock.calls).toEqual([['timeout']]);
    expect(ops()).toHaveLength(270);
    await vi.advanceTimersByTimeAsync(60 * MIN);
    expect(ops()).toHaveLength(270);
  });

  it('a completed run → the last update, then done', async () => {
    const { on, ops } = setup((op, poll) =>
      poll < 2 ? running(op) : (url: string) => reply(url, 200, op === 'run.get' ? { status: 'completed', conclusion: 'success', htmlUrl: null } : []),
    );
    await vi.advanceTimersByTimeAsync(20_000);
    expect(on.update).toHaveBeenLastCalledWith({ status: 'completed', conclusion: 'success', htmlUrl: null }, []);
    expect(on.stop.mock.calls).toEqual([['done']]);
    await vi.advanceTimersByTimeAsync(5 * MIN);
    expect(ops()).toHaveLength(4);
  });

  it('waits retryAfter before the next call (the failure goes to onError with its retryAfter)', async () => {
    const { on, ops, cancel } = setup((op, poll) => (poll === 1 && op === 'run.get' ? (url: string) => reply(url, 429, { error: 'rate', retryAfter: 120 }) : running(op)));
    await vi.advanceTimersByTimeAsync(0);
    expect(ops()).toEqual([{ op: 'run.get', runId: 4242 }]);
    expect(on.error).toHaveBeenCalledTimes(1);
    expect(on.error.mock.calls[0]?.[0]).toMatchObject({ code: 'rate', status: 429, extra: { retryAfter: 120 } });
    await vi.advanceTimersByTimeAsync(120_000 - 1);
    expect(ops()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(ops()).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(ops()).toHaveLength(5);
    cancel();
  });

  it('a 401 handle stops polling with handle (and ends the login)', async () => {
    const { on, ops, box } = setup((op) => (op === 'run.get' ? (url: string) => reply(url, 401, { error: 'handle' }) : running(op)));
    await vi.advanceTimersByTimeAsync(0);
    expect(on.stop.mock.calls).toEqual([['handle']]);
    expect(box.get()).toBeNull();
    await vi.advanceTimersByTimeAsync(5 * MIN);
    expect(ops()).toHaveLength(1);
    expect(on.update).not.toHaveBeenCalled();
    expect(on.error).not.toHaveBeenCalled();
  });

  it('other failures go to onError and polling goes on at 20 s', async () => {
    const { on, ops, cancel } = setup((op, poll) => (poll === 1 ? (url: string) => reply(url, 502, { error: 'upstream' }) : running(op)));
    await vi.advanceTimersByTimeAsync(0);
    expect(ops()).toHaveLength(1);
    expect(on.error.mock.calls.map(([e]) => (e as RelayError).code)).toEqual(['upstream']);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(ops()).toHaveLength(3);
    expect(on.update).toHaveBeenCalledTimes(1);
    expect(on.error).toHaveBeenCalledTimes(1);
    expect(on.stop).not.toHaveBeenCalled();
    cancel();
  });

  it('cancelling from onError stops at once: no timer is left behind', async () => {
    const { on, ops, cancel } = setup(() => (url: string) => reply(url, 403, { error: 'gh-perm' }));
    on.error.mockImplementation(() => cancel()); // the first failure arrives after setup returned
    await vi.advanceTimersByTimeAsync(0);
    expect(ops()).toHaveLength(1);
    expect(on.error).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(5 * MIN);
    expect(ops()).toHaveLength(1);
  });

  it('a throwing onError cannot end the loop: the next poll still comes, and the 45-minute stop ends it', async () => {
    const { on, ops } = setup(() => (url: string) => reply(url, 502, { error: 'upstream' }));
    on.error.mockImplementation(() => {
      throw new RangeError('Invalid time value');
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(ops()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(ops()).toHaveLength(2);
    expect(on.error).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(45 * MIN);
    expect(on.stop.mock.calls).toEqual([['timeout']]);
    expect(ops()).toHaveLength(135); // run.get alone, every 20 s
  });

  it('a retryAfter that is not a finite number ≥ 0 waits the usual 20 s', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_800_000_000_000);
    const h = harness();
    // relayFailure never lets these through, so a stand-in relay throws them
    for (const retryAfter of [Number.POSITIVE_INFINITY, Number.NaN, -120]) {
      const ops: string[] = [];
      const api = {
        relay: async (op: RelayOp) => {
          ops.push(op);
          throw new RelayError('rate', 429, { retryAfter });
        },
      } as unknown as RelayApi;
      const on = { update: vi.fn(), error: vi.fn(), stop: vi.fn() };
      const cancel = pollRun(h.deps, api, 4242, { visible: () => true, onUpdate: on.update, onError: on.error, onStop: on.stop });
      await vi.advanceTimersByTimeAsync(20_000 - 1);
      expect(ops, String(retryAfter)).toEqual(['run.get']);
      await vi.advanceTimersByTimeAsync(1);
      expect(ops, String(retryAfter)).toEqual(['run.get', 'run.get']);
      expect(on.error).toHaveBeenCalledTimes(2);
      cancel();
    }
  });
});

// ---- spec §4.8: the no-login fallback commands -----------------------------------------------------------------------

describe('ghCommands', () => {
  const RUN = 'gh workflow run deploy.yml --ref main -R Lunecid/Lunecid.github.io';
  const set = (name: string, quoted: string) => `gh variable set ${name} --body '${quoted}' -R Lunecid/Lunecid.github.io`;

  it("one line per change, single quotes with ' → '', then the workflow line (always); never &&", () => {
    expect(ghCommands([{ name: 'ACCOUNT_GENSHIN_NAME', value: "It's" }])).toEqual({
      lines: ["gh variable set ACCOUNT_GENSHIN_NAME --body 'It''s' -R Lunecid/Lunecid.github.io", 'gh workflow run deploy.yml --ref main -R Lunecid/Lunecid.github.io'],
      skipped: [],
    });
    const { lines, skipped } = ghCommands([
      { name: 'ACCOUNT_GENSHIN_UID', value: ' 618285856 ' },
      { name: 'ACCOUNT_RIOT_ID', value: 'Hide on bush#KR1' },
      { name: 'ACCOUNT_ZZZ_UID', value: null },
      { name: 'ACCOUNT_ZZZ_NAME', value: null },
    ]);
    expect(lines).toEqual([
      set('ACCOUNT_GENSHIN_UID', '618285856'),
      set('ACCOUNT_RIOT_ID', 'Hide on bush#KR1'),
      'gh variable delete ACCOUNT_ZZZ_UID -R Lunecid/Lunecid.github.io',
      'gh variable delete ACCOUNT_ZZZ_NAME -R Lunecid/Lunecid.github.io',
      RUN,
    ]);
    expect(skipped).toEqual([]);
    for (const line of lines) {
      expect(line).not.toContain('&&');
      expect(line).not.toMatch(/[\r\n]/);
    }
    expect(ghCommands([])).toEqual({ lines: [RUN], skipped: [] });
  });

  it('$, $(…), backticks, ; and curly quotes stay literal inside single quotes (curly single quotes doubled)', () => {
    const { lines, skipped } = ghCommands([
      { name: 'ACCOUNT_GENSHIN_NAME', value: 'a$(whoami)b $env:PATH' },
      { name: 'ACCOUNT_ZZZ_NAME', value: 'x`y; z' },
      { name: 'ACCOUNT_STEAM_NAME', value: 'Robin’s ‘x’ “y” ‚z‛' },
    ]);
    expect(lines).toEqual([
      set('ACCOUNT_GENSHIN_NAME', 'a$(whoami)b $env:PATH'),
      set('ACCOUNT_ZZZ_NAME', 'x`y; z'),
      set('ACCOUNT_STEAM_NAME', 'Robin’’s ‘‘x’’ “y” ‚‚z‛‛'),
      RUN,
    ]);
    expect(skipped).toEqual([]);
  });

  it('a value with " or \\ never becomes a gh line (unsafe-shell); validateVar failures are skipped as invalid', () => {
    const { lines, skipped } = ghCommands([
      { name: 'ACCOUNT_GENSHIN_NAME', value: 'x" --env "prod' },
      { name: 'ACCOUNT_ZZZ_NAME', value: 'ab c\\' },
      { name: 'ACCOUNT_STEAM_NAME', value: 'a\\"b' },
      { name: 'ACCOUNT_GENSHIN_UID', value: 'abc' },
      { name: 'ACCOUNT_RIOT_ID', value: 'Hide "on" bush#KR1' },
      { name: 'ACCOUNT_STEAM_ID64', value: 'ghp_' + 'x'.repeat(36) },
      { name: 'ACCOUNT_ZZZ_UID', value: 'a\nb' },
      { name: 'ACCOUNT_STEAM_NAME', value: 'Robin' },
      { name: 'GITHUB_TOKEN' as AccountVar, value: 'x' },
      { name: 'GITHUB_TOKEN' as AccountVar, value: null },
    ]);
    expect(lines).toEqual([set('ACCOUNT_STEAM_NAME', 'Robin'), RUN]);
    expect(skipped).toEqual([
      { name: 'ACCOUNT_GENSHIN_NAME', reason: 'unsafe-shell' },
      { name: 'ACCOUNT_ZZZ_NAME', reason: 'unsafe-shell' },
      { name: 'ACCOUNT_STEAM_NAME', reason: 'unsafe-shell' },
      { name: 'ACCOUNT_GENSHIN_UID', reason: 'invalid' },
      { name: 'ACCOUNT_RIOT_ID', reason: 'invalid' },
      { name: 'ACCOUNT_STEAM_ID64', reason: 'invalid' },
      { name: 'ACCOUNT_ZZZ_UID', reason: 'invalid' },
    ]);
    for (const line of lines) expect(line).not.toMatch(/["\\]/);
  });
});

// ---- the whole popup path: nothing secret outside closures ----------------------------------------------------------

it('login → session → vars.list → Steam → logout keeps every secret out of the URL, history state and request URLs', async () => {
  history.replaceState(null, '', '/game/player-log/?manage');
  expect(takeManageQuery(location, history)).toBe(true);
  let ch: FakeChannel | null = null;
  const gh = fakePopup();
  const steam = fakePopup();
  const h = harness({
    open: vi.fn((url: string, target: string, features: string) => (target === 'acct-gh' ? gh.open : steam.open)(url, target, features)),
    channel: () => {
      ch = new FakeChannel();
      return ch as unknown as BroadcastChannel;
    },
  });
  const box = createHandleBox(h.deps.now);
  const api = createRelay(h.deps, box);
  let pendingN: string | null = null;
  let pendingS: string | null = null;
  const done = { ticket: Promise.withResolvers<void>(), steam: Promise.withResolvers<{ state: string }>() };
  const stop = listenLinkChannel(h.deps, {
    pendingN: () => pendingN,
    pendingSteamState: () => pendingS,
    onTicket: (ticket, n) => {
      pendingN = null;
      void api.session(ticket, n).then(done.ticket.resolve, done.ticket.reject);
    },
    onGhError: () => {},
    onSteam: (fields, s) => {
      pendingS = null;
      void api.verifySteam({ ...fields, s }).then(done.steam.resolve, done.steam.reject);
    },
  });
  h.respond((url, init) => {
    if (url.endsWith('/gh/session')) return reply(url, 200, { handle: HANDLE, expiresIn: 3600 });
    if (url.endsWith('/openid/verify')) return reply(url, 200, { steamid: '76561197960435530', state: (JSON.parse(String(init.body)) as { s: string }).s, personaname: 'Robin', profilePublic: true });
    if (url.endsWith('/gh/logout')) return reply(url, 204);
    return reply(url, 200, [{ name: 'ACCOUNT_STEAM_ID64', value: '76561197960435530' }]);
  });

  const login = startGithubLogin(h.deps, 'ko');
  if (!('n' in login)) throw new Error('blocked');
  pendingN = login.n;
  (ch as FakeChannel | null)?.emit({ kind: 'gh', ticket: TICKET, n: login.n });
  await done.ticket.promise;
  expect(box.get()).toBe(HANDLE);
  await api.relay('vars.list');
  const st = startSteamLogin(h.deps);
  if (!('state' in st)) throw new Error('blocked');
  pendingS = st.state;
  (ch as FakeChannel | null)?.emit({ kind: 'steam', params: { 'openid.mode': 'id_res' }, s: st.state });
  expect((await done.steam.promise).state).toBe(st.state);
  await api.logout();
  stop();

  const secrets = [HANDLE, TICKET, login.n, st.state];
  const urls = [location.href, JSON.stringify(history.state) ?? '', ...h.calls.map((c) => c.url)];
  for (const secret of secrets) for (const u of urls) expect(u).not.toContain(secret);
  expect(h.calls.map((c) => c.url)).toEqual([`${RELAY}/gh/session`, `${RELAY}/gh/api`, `${RELAY}/openid/verify`, `${RELAY}/gh/logout`]);
  expect(box.get()).toBeNull();
});
