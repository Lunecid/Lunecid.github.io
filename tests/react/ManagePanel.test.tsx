// AL-18: ManagePanel part 1 — login, fields, check buttons, Steam and save (account-link spec §4.1–§4.4, §4.7, §4.8,
// §3.7, §11.1 ManagePanel row). The AL-17 core runs for real (createRelay, the handle box, the form store); only the
// browser surface is fake: fetch answers per relay path/op, window.open returns a recorder, the BroadcastChannel is an
// EventTarget the test emits on, and setTimeout/now are a manual scheduler (the session clock and the minutes line
// move only when a test advances it). Every test also checks that nothing secret reaches storage, a cookie or the
// console. Fake handles and tickets are built at run time.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { adminCopy } from '../../src/i18n/accounts-admin';
import ManagePanel, { type AdminApi, type ManagePanelProps } from '../../src/islands/account/ManagePanel';
import { createFormStore, createHandleBox, createRelay, steamLoginUrl, type AdminDeps, type FormStore } from '../../src/lib/account-admin';
import type { AccountVar } from '../../src/lib/account-ids';
import type { AccountTile, AccountTileKey, TileState } from '../../src/lib/account-view';

const C = adminCopy.ko;
const RELAY = 'https://account-relay.test-sub.workers.dev';
const HANDLE = 'hdl_' + 'A'.repeat(60);
const TICKET = 'tkt-' + 'B'.repeat(60);
const STEAM_ID = '76561197960435530';
const MIN = 60_000;
const POPUP = 'popup,width=600,height=720';
const kst = (ms: number) => `${new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ms))} KST`;

// ---- tiles (GAME_IDS order: zzz, genshin, lol, tft, steam; slots from TILE_SLOTS) ------------------------------------

const BASE: Record<AccountTileKey, Omit<AccountTile, 'state'>> = {
  zzz: { slot: 1, key: 'zzz', source: 'enka-zzz', glyph: 'ZZZ', name: '젠레스 존 제로', head: 'INTER-KNOT PROFILE', tint: 'var(--tint-eula)' },
  genshin: { slot: 0, key: 'genshin', source: 'enka-genshin', glyph: 'GI', name: '원신', head: 'ADVENTURER PROFILE', tint: 'var(--tint-mona)' },
  lol: { slot: 3, key: 'lol', source: 'riot', glyph: 'LOL', name: '리그 오브 레전드', head: 'PROFILE LINK', tint: 'var(--acct-tint-riot)' },
  tft: { slot: 4, key: 'tft', source: 'riot', glyph: 'TFT', name: '전략적 팀 전투', head: 'PROFILE LINK', tint: 'var(--acct-tint-riot)' },
  steam: { slot: 2, key: 'steam', source: 'steam', glyph: 'STM', name: 'Steam', head: 'STEAM PROFILE', tint: 'var(--acct-tint-steam)' },
};
const ORDER: AccountTileKey[] = ['zzz', 'genshin', 'lol', 'tft', 'steam'];
const tiles = (states: Partial<Record<AccountTileKey, TileState>> = {}, keys: AccountTileKey[] = ORDER): AccountTile[] =>
  keys.map((k) => ({ ...BASE[k], state: states[k] ?? 'unlinked' }));

// ---- the fake browser surface ----------------------------------------------------------------------------------------

type Call = { url: string; key: string; body: Record<string, unknown> | null; init: RequestInit };
type Answer = (body: Record<string, unknown> | null, url: string) => Response | Promise<Response>;

function reply(url: string, status: number, body?: unknown): Response {
  const res = new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  Object.defineProperty(res, 'url', { value: url });
  return res;
}

class FakeChannel extends EventTarget {
  closed = false;
  postMessage(): void {}
  close(): void {
    this.closed = true;
  }
}

/** setTimeout/clearTimeout/now driven by advance(): nothing fires on its own. */
function manualClock(start = 1_800_000_000_000) {
  let now = start;
  let seq = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  return {
    now: () => now,
    setTimeout: ((fn: () => void, ms = 0) => {
      seq += 1;
      timers.set(seq, { at: now + ms, fn });
      return seq;
    }) as unknown as typeof setTimeout,
    clearTimeout: ((id?: number) => void timers.delete(id as number)) as unknown as typeof clearTimeout,
    advance(ms: number): void {
      const end = now + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (due === undefined) break;
        timers.delete(due[0]);
        now = due[1].at;
        due[1].fn();
      }
      now = end;
    },
  };
}

interface Setup extends Partial<Omit<ManagePanelProps, 'admin' | 'store'>> {
  /** The relay origin of the fake deps (the panel reads it from admin.deps.relay alone). */
  relay?: string | null;
  vars?: { name: string; value: unknown }[];
  answers?: Record<string, Answer>;
  blockPopups?: boolean;
  store?: FormStore<AccountVar>;
  handle?: boolean;
}

function setup(o: Setup = {}) {
  const clock = manualClock();
  const calls: Call[] = [];
  const answers: Record<string, Answer> = {
    '/gh/session': (_b, url) => reply(url, 200, { handle: HANDLE, expiresIn: 3600 }),
    '/gh/logout': (_b, url) => reply(url, 204),
    '/openid/verify': (b, url) => reply(url, 200, { steamid: STEAM_ID, state: b?.s, personaname: 'Robin', profilePublic: true }),
    'vars.list': (_b, url) => reply(url, 200, o.vars ?? []),
    'workflow.get': (_b, url) => reply(url, 200, { state: 'active' }),
    'vars.set': (_b, url) => reply(url, 200, { ok: true }),
    'vars.delete': (_b, url) => reply(url, 200, { ok: true }),
    dispatch: (_b, url) => reply(url, 200, { runId: 7, htmlUrl: null }),
    ...o.answers,
  };
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const path = new URL(url).pathname;
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : null;
    const key = path === '/gh/api' ? String(body?.op) : path;
    calls.push({ url, key, body, init: init ?? {} });
    const answer = answers[key];
    if (answer === undefined) throw new Error(`no answer for ${key}`);
    return answer(body, url);
  });
  const popups: { target: string; url: string; openerCut: boolean }[] = [];
  const open = vi.fn((_url: string, target: string, _features: string): Window | null => {
    if (o.blockPopups) return null;
    const w = { opener: {} as unknown, close: vi.fn(), location: { replace: (url: string) => void popups.push({ target, url, openerCut: w.opener === null }) } };
    return w as unknown as Window;
  });
  const channels: FakeChannel[] = [];
  const assigned: string[] = [];
  const wakes = new Set<() => void>();
  const beacons: [string, string][] = [];
  const deps: AdminDeps = {
    relay: o.relay === undefined ? RELAY : o.relay,
    fetch: fetch as unknown as typeof globalThis.fetch,
    open,
    channel: () => {
      const ch = new FakeChannel();
      channels.push(ch);
      return ch as unknown as BroadcastChannel;
    },
    now: clock.now,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    location: { assign: (url: string) => void assigned.push(url) } as unknown as Location,
    history: window.history,
    sendBeacon: (url, data) => {
      beacons.push([url, data]);
      return true;
    },
    random: (n) => crypto.getRandomValues(new Uint8Array(n)),
  };
  const box = createHandleBox(deps.now);
  if (o.handle) box.set(HANDLE, 3600);
  const admin: AdminApi = {
    deps,
    box,
    relay: createRelay(deps, box),
    listenWake: (check) => {
      wakes.add(check);
      return () => void wakes.delete(check);
    },
  };
  const store = o.store ?? createFormStore<AccountVar>();
  const onDirtyChange = vi.fn();
  const props: ManagePanelProps = {
    lang: o.lang ?? 'ko',
    tiles: o.tiles ?? tiles(),
    steamButton: o.steamButton ?? true,
    store,
    admin,
    focus: o.focus ?? null,
    onDirtyChange,
    current: o.current ?? null,
    loginError: o.loginError ?? null,
  };
  const user = userEvent.setup();
  const view = render(<ManagePanel {...props} />);
  const emit = (data: unknown) =>
    act(async () => {
      for (const ch of channels) if (!ch.closed) ch.dispatchEvent(new MessageEvent('message', { data }));
    });
  return {
    ...view,
    props,
    rerenderWith: (p: Partial<ManagePanelProps>) => view.rerender(<ManagePanel {...props} {...p} />),
    clock,
    calls,
    keys: () => calls.map((c) => c.key),
    fetch,
    open,
    popups,
    channels,
    assigned,
    beacons,
    wake: () => act(() => {
      for (const w of [...wakes]) w();
    }),
    store,
    box,
    admin,
    user,
    emit,
    onDirtyChange,
    advance: (ms: number) => act(() => clock.advance(ms)),
    /** Popups opened from now on are blocked (or not). */
    blockPopups: (on: boolean) => void (o.blockPopups = on),
  };
}

type T = ReturnType<typeof setup>;

const loginButton = () => screen.getByRole('button', { name: C['label:login'] });
const heading = () => screen.getByRole('heading', { name: /GitHub 로그인됨 · Lunecid/ });
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A new-tab link: its name is the label plus the sr-only "새 탭에서 열림". */
const linkNamed = (label: string) => new RegExp(`^${escapeRe(label)}\\s*${escapeRe(C['label:newTab'])}$`);
/** The input labelled exactly `label`, with or without the 변경됨 mark. */
const field = (label: string) => screen.getByLabelText(new RegExp(`^${escapeRe(label)}( ${C['label:changed']})?$`)) as HTMLInputElement;
/** The panel's first alert: the error line placed before the login button. */
const errorLine = (t: T) => t.container.querySelector<HTMLElement>('[data-mp="error"]') as HTMLElement;

async function login(t: T): Promise<string> {
  await t.user.click(loginButton());
  const n = new URL(t.popups.at(-1)?.url ?? '').searchParams.get('n') ?? '';
  await t.emit({ kind: 'gh', ticket: TICKET, n });
  await waitFor(() => expect(heading()).toBeInTheDocument());
  await screen.findByText(C['label:perms']);
  return n;
}

async function steamLogin(t: T): Promise<string> {
  await t.user.click(screen.getByRole('button', { name: 'Sign in through Steam' }));
  const steam = t.popups.filter((p) => p.target === 'acct-steam').at(-1);
  const returnTo = new URL(steam?.url ?? '').searchParams.get('openid.return_to') ?? '';
  return new URL(returnTo).searchParams.get('s') ?? '';
}

const steamFields = (s: string) => ({
  kind: 'steam',
  params: { 'openid.mode': 'id_res', 'openid.claimed_id': `https://steamcommunity.com/openid/id/${STEAM_ID}`, 'openid.identity': `https://steamcommunity.com/openid/id/${STEAM_ID}` },
  s,
});

// ---- the sinks must stay silent --------------------------------------------------------------------------------------

let sinks: [string, MockInstance][] = [];
let consoleCalls: unknown[][] = [];

beforeEach(() => {
  consoleCalls = [];
  sinks = [
    ['Storage.setItem', vi.spyOn(Storage.prototype, 'setItem')],
    ['document.cookie', vi.spyOn(Document.prototype, 'cookie', 'set')],
  ];
  for (const m of ['log', 'info', 'warn', 'error', 'debug', 'trace'] as const) {
    vi.spyOn(console, m).mockImplementation((...args: unknown[]) => void consoleCalls.push(args));
  }
});

afterEach(() => {
  const used = sinks.filter(([, s]) => s.mock.calls.length > 0).map(([name]) => name);
  const logged = consoleCalls.map((args) => args.map(String).join(' '));
  vi.restoreAllMocks();
  document.getElementById('acct-status')?.remove();
  expect(used, 'storage or cookie written').toEqual([]);
  expect(logged.filter((line) => line.includes(HANDLE) || line.includes(TICKET)), 'a secret reached the console').toEqual([]);
  expect(location.href).not.toContain(HANDLE);
});

// ---- before login ----------------------------------------------------------------------------------------------------

describe('before login', () => {
  it('the owner line, an empty error line before the only control [GitHub로 로그인]; no input, no form, no password, no request', () => {
    const t = setup();
    expect(screen.getByText(C.owner)).toBeInTheDocument();
    expect([...t.container.querySelectorAll('button')]).toEqual([loginButton()]);
    expect(screen.queryAllByRole('textbox')).toEqual([]);
    expect(t.container.querySelector('form, input[type="password"], input')).toBeNull();
    expect(errorLine(t)).toHaveAttribute('role', 'alert');
    expect(errorLine(t)).toHaveTextContent('');
    expect(errorLine(t).compareDocumentPosition(loginButton()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(loginButton()).toHaveAccessibleDescription(C.loginHelp);
    expect(t.fetch).not.toHaveBeenCalled();
  });

  it("relay null → the relay-unset text, the open 'without signing in' section, no login button, zero requests", () => {
    const t = setup({ relay: null });
    expect(screen.getByText(C['relay-unset'])).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: C['label:login'] })).toBeNull();
    const fallback = t.container.querySelector('details[data-mp="no-login"]') as HTMLDetailsElement;
    expect(fallback.open).toBe(true);
    expect(within(fallback).getByText(C['label:noLogin'])).toBeInTheDocument();
    expect(within(fallback).getByRole('link', { name: linkNamed(C['label:webVarsLink']) })).toHaveAttribute('href', 'https://github.com/Lunecid/Lunecid.github.io/settings/variables/actions');
    expect(within(fallback).getByRole('link', { name: linkNamed(C['label:webRunLink']) })).toHaveAttribute('href', 'https://github.com/Lunecid/Lunecid.github.io/actions/workflows/deploy.yml');
    expect(t.channels).toEqual([]);
    expect(t.fetch).not.toHaveBeenCalled();
  });

  it('focus first-control → the login button; without a relay → the README link (there is no login button)', () => {
    setup({ focus: 'first-control' });
    expect(document.activeElement).toBe(loginButton());
    cleanup();
    setup({ relay: null, focus: 'first-control' });
    expect(document.activeElement).toBe(screen.getByRole('link', { name: linkNamed(C['label:readme']) }));
  });

  it('a same-tab loginError is not in the first render: it fills the error line after mount, opens the fallback and takes focus error', () => {
    const t = setup({ focus: 'error', loginError: { kind: 'gh-error', code: 'denied' } });
    const firstRender = renderToString(<ManagePanel {...t.props} />);
    expect(firstRender).not.toContain(C['gh.denied']);
    expect(errorLine(t)).toHaveTextContent(C['gh.denied']);
    expect(document.activeElement).toBe(errorLine(t));
    expect((t.container.querySelector('details[data-mp="no-login"]') as HTMLDetailsElement).open).toBe(true);
  });

  it('loginError kinds: gh-error codes, unknown codes and a failed same-tab /gh/session (ticket, network, rate with its time)', () => {
    const cases: [ManagePanelProps['loginError'], string][] = [
      [{ kind: 'gh-error', code: 'x-y' }, C.unknown],
      [{ kind: 'relay', code: 'ticket' }, C.ticket],
      [{ kind: 'relay', code: 'network' }, C.network],
      [{ kind: 'relay', code: 'rate', retryAfter: 120 }, C.rate.replace('{time}', kst(1_800_000_000_000 + 120_000))],
    ];
    for (const [loginError, text] of cases) {
      const t = setup({ loginError });
      expect(errorLine(t)).toHaveTextContent(text);
      cleanup();
    }
  });

  it("before the form shows, the current tile's state note leads the section (아직 연동하지 않았습니다, error, stale; none when shown)", async () => {
    setup({ current: 'genshin' });
    const note = screen.getByText(C.notLinked);
    expect(note.compareDocumentPosition(loginButton()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    cleanup();
    setup({ current: 'zzz', tiles: tiles({ zzz: 'error' }) });
    expect(screen.getByText(C['state.error'])).toBeInTheDocument();
    cleanup();
    setup({ current: 'steam', tiles: tiles({ steam: 'stale' }) });
    expect(screen.getByText(C['state.stale'])).toBeInTheDocument();
    cleanup();
    const t = setup({ current: 'lol', tiles: tiles({ lol: 'shown' }) });
    expect(screen.queryByText(C.notLinked)).toBeNull();
    t.rerenderWith({ current: 'genshin' });
    expect(screen.getByText(C.notLinked)).toBeInTheDocument();
    await login(t); // the groups carry the notes from here on
    expect(t.container.querySelector('.mp-tile-note')).toBeNull();
  });

  it('a relay that is not a bare origin: [GitHub로 로그인] shows the §4.7 text and opens no popup', async () => {
    const t = setup({ relay: `${RELAY}/` });
    await t.user.click(loginButton());
    expect(errorLine(t)).toHaveTextContent(C.forbidden);
    expect(t.open).not.toHaveBeenCalled();
    expect((t.container.querySelector('details[data-mp="no-login"]') as HTMLDetailsElement).open).toBe(true);
  });
});

// ---- GitHub login ----------------------------------------------------------------------------------------------------

describe('GitHub login', () => {
  it("the popup: open('about:blank', 'acct-gh', 'popup,…'), opener cut, then {relay}/gh/login?lang=ko&n=<nonce>; nothing fetched", async () => {
    const t = setup();
    await t.user.click(loginButton());
    expect(t.open).toHaveBeenCalledWith('about:blank', 'acct-gh', POPUP);
    expect(t.popups).toHaveLength(1);
    const url = new URL(t.popups[0]?.url ?? '');
    expect(t.popups[0]).toMatchObject({ target: 'acct-gh', openerCut: true });
    expect(`${url.origin}${url.pathname}`).toBe(`${RELAY}/gh/login`);
    expect(url.searchParams.get('lang')).toBe('ko');
    expect(url.searchParams.get('n')).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(t.fetch).not.toHaveBeenCalled();
    t.unmount();
    const en = setup({ lang: 'en' });
    await en.user.click(screen.getByRole('button', { name: adminCopy.en['label:login'] }));
    expect(new URL(en.popups[0]?.url ?? '').searchParams.get('lang')).toBe('en');
  });

  it('a ticket with a wrong n is ignored; the right n → one /gh/session { ticket, n }, the heading focused, then exactly vars.list and workflow.get', async () => {
    const t = setup({ vars: [{ name: 'ACCOUNT_ZZZ_NAME', value: 'Stored' }] });
    t.store.set('ACCOUNT_ZZZ_NAME', 'Typed'); // a value kept from an earlier sign-in
    await t.user.click(loginButton());
    const n = new URL(t.popups[0]?.url ?? '').searchParams.get('n') ?? '';
    await t.emit({ kind: 'gh', ticket: TICKET, n: 'M'.repeat(22) });
    expect(t.fetch).not.toHaveBeenCalled();
    await t.emit({ kind: 'gh', ticket: TICKET, n });
    await waitFor(() => expect(document.activeElement).toBe(heading()));
    await screen.findByText(C['label:perms']);
    expect(t.keys()).toEqual(['/gh/session', 'vars.list', 'workflow.get']);
    expect(t.calls[0]?.body).toEqual({ ticket: TICKET, n });
    expect(heading()).toHaveAttribute('tabindex', '-1');
    expect(heading()).toHaveTextContent('GitHub 로그인됨 · Lunecid · 60분 남음');
    expect(screen.getByRole('button', { name: C['label:logout'] })).toBeInTheDocument();
    expect(field(C['label:field.ACCOUNT_ZZZ_NAME']).value).toBe('Typed');
    expect(t.box.get()).toBe(HANDLE);
  });

  it('mounting with a handle already in the box (the same-tab return) loads the form; focus heading lands on it', async () => {
    const t = setup({ handle: true, focus: 'heading', vars: [{ name: 'ACCOUNT_RIOT_ID', value: 'Hide on bush#KR1' }] });
    await screen.findByText(C['label:perms']);
    expect(document.activeElement).toBe(heading());
    expect(t.keys()).toEqual(['vars.list', 'workflow.get']);
    expect(field(C['label:field.ACCOUNT_RIOT_ID']).value).toBe('Hide on bush#KR1');
  });

  it('vars.list names outside ACCOUNT_VARS are ignored', async () => {
    const t = setup({
      vars: [
        { name: 'GH_PROFILE_TOKEN', value: 'leak' },
        { name: 'ACCOUNT_RIOT_ID', value: 'Hide on bush#KR1' },
        { name: 'ACCOUNT_OTHER', value: 'x' },
      ],
    });
    await login(t);
    expect(field(C['label:field.ACCOUNT_RIOT_ID']).value).toBe('Hide on bush#KR1');
    expect(screen.queryByDisplayValue('leak')).toBeNull();
    expect(screen.queryByDisplayValue('x')).toBeNull();
    expect(t.store.get('GH_PROFILE_TOKEN' as AccountVar)).toBe('');
  });

  it('a gh-error message fills the pre-rendered empty alert with the §4.7 text (README link for no-access) and opens the fallback', async () => {
    const t = setup();
    const before = errorLine(t);
    expect(before).toHaveTextContent('');
    await t.user.click(loginButton());
    await t.emit({ kind: 'gh-error', code: 'no-access', n: null });
    expect(errorLine(t)).toBe(before);
    expect(errorLine(t)).toHaveTextContent(C['gh.no-access']);
    expect(within(errorLine(t)).getByRole('link', { name: linkNamed(C['label:readme']) })).toHaveAttribute('href', 'https://github.com/Lunecid/Lunecid.github.io#연동-켜기');
    expect((t.container.querySelector('details[data-mp="no-login"]') as HTMLDetailsElement).open).toBe(true);
    expect(t.fetch).not.toHaveBeenCalled();
  });

  it('a 401 ticket from /gh/session shows its text and keeps the login button', async () => {
    const t = setup({ answers: { '/gh/session': (_b, url) => reply(url, 401, { error: 'ticket' }) } });
    await t.user.click(loginButton());
    const n = new URL(t.popups[0]?.url ?? '').searchParams.get('n') ?? '';
    await t.emit({ kind: 'gh', ticket: TICKET, n });
    await waitFor(() => expect(errorLine(t)).toHaveTextContent(C.ticket));
    expect(loginButton()).toBeInTheDocument();
    expect(t.keys()).toEqual(['/gh/session']);
  });

  it('a blocked popup → the message, the open fallback and [같은 창에서 로그인] → location.assign with &mode=tab', async () => {
    const t = setup({ blockPopups: true });
    await t.user.click(loginButton());
    expect(errorLine(t)).toHaveTextContent(C['popup-blocked']);
    expect((t.container.querySelector('details[data-mp="no-login"]') as HTMLDetailsElement).open).toBe(true);
    await t.user.click(screen.getByRole('button', { name: C['label:sameTab'] }));
    expect(t.assigned).toEqual([`${RELAY}/gh/login?lang=ko&mode=tab`]);
  });

  it('with unsaved changes the same-tab login warns first (focus on [취소]); [취소] returns focus, [그래도 로그인] goes', async () => {
    const store = createFormStore<AccountVar>();
    store.set('ACCOUNT_GENSHIN_UID', '618285856');
    const t = setup({ blockPopups: true, store });
    await t.user.click(loginButton());
    screen.getByRole('button', { name: C['label:sameTab'] }).focus();
    await t.user.keyboard('{Enter}');
    expect(screen.getByText(C.sameTabWarn)).toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: C['label:cancel'] }));
    expect(t.assigned).toEqual([]);
    await t.user.keyboard('{Enter}');
    expect(screen.queryByText(C.sameTabWarn)).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: C['label:sameTab'] }));
    expect(t.assigned).toEqual([]);
    await t.user.keyboard('{Enter}');
    await t.user.click(screen.getByRole('button', { name: C['label:loginAnyway'] }));
    expect(t.assigned).toEqual([`${RELAY}/gh/login?lang=ko&mode=tab`]);
  });

  it('after [그래도 로그인] the beforeunload prompt is skipped; a page shown again (pageshow) prompts again', async () => {
    const store = createFormStore<AccountVar>();
    store.set('ACCOUNT_GENSHIN_UID', '618285856');
    const t = setup({ blockPopups: true, store });
    const unload = () => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(unload()).toBe(true);
    await t.user.click(loginButton());
    await t.user.click(screen.getByRole('button', { name: C['label:sameTab'] }));
    await t.user.click(screen.getByRole('button', { name: C['label:loginAnyway'] }));
    expect(unload()).toBe(false); // the panel already warned
    t.wake(); // back from the back-forward cache
    expect(unload()).toBe(true);
  });
});

// ---- after login: groups, fields, checks --------------------------------------------------------------------------------

describe('the form', () => {
  it('groups in tile order (ZZZ, Genshin, one Riot group, Steam) with the site state from #acct-status', async () => {
    const status = document.createElement('script');
    status.type = 'application/json';
    status.id = 'acct-status';
    status.textContent = JSON.stringify({ runId: null, platforms: [{ slot: 0, state: 'hidden' }, { slot: 1, state: 'shown' }, { slot: 3, state: 'shown' }, { slot: 4, state: 'absent' }, { slot: 2, state: 'absent' }] });
    document.body.append(status);
    const t = setup({ vars: [{ name: 'ACCOUNT_GENSHIN_UID', value: '618285856' }, { name: 'ACCOUNT_GENSHIN_NAME', value: 'Traveler' }] });
    await login(t);
    const groups = [...t.container.querySelectorAll<HTMLFieldSetElement>('fieldset[data-group]')];
    expect(groups.map((g) => g.dataset.group)).toEqual(['zzz', 'genshin', 'riot', 'steam']);
    expect(groups.map((g) => g.querySelector('legend')?.textContent)).toEqual(['젠레스 존 제로', '원신', '리그 오브 레전드 · 전략적 팀 전투', 'Steam']);
    const [zzz, genshin, riot, steam] = groups as unknown as [HTMLElement, HTMLElement, HTMLElement, HTMLElement];
    expect(within(zzz).getByText(C['label:shown'])).toBeInTheDocument();
    expect(within(genshin).getByText(C['label:notShown'])).toBeInTheDocument();
    expect(within(genshin).getByText(C['state.unlinked'])).toBeInTheDocument(); // linked, but this build showed nothing
    expect(within(riot).getByText(`리그 오브 레전드 · ${C['label:shown']}`)).toBeInTheDocument();
    expect(within(riot).getByText(`전략적 팀 전투 · ${C['label:notShown']}`)).toBeInTheDocument();
    expect(within(steam).getByText(C.notLinked)).toBeInTheDocument();
    expect(within(riot).getAllByRole('textbox')).toHaveLength(2); // the ID and its confirmation, once for both tiles
  });

  it('check buttons: invalid → aria-disabled button described by the field error, a click shows it and opens nothing', async () => {
    const t = setup();
    await login(t);
    const enka = screen.getAllByRole('button', { name: C['label:enka'] });
    expect(enka).toHaveLength(2);
    const genshinCheck = within(t.container.querySelector('fieldset[data-group="genshin"]') as HTMLElement).getByRole('button', { name: C['label:enka'] });
    expect(genshinCheck).toHaveAttribute('aria-disabled', 'true');
    const uid = field(C['label:field.ACCOUNT_GENSHIN_UID']);
    const errId = genshinCheck.getAttribute('aria-describedby') ?? '';
    expect(document.getElementById(errId)).toHaveTextContent('');
    await t.user.click(genshinCheck);
    expect(document.getElementById(errId)).toHaveTextContent(C['err.required']);
    expect(uid).toHaveAttribute('aria-invalid', 'true');
    await t.user.type(uid, 'abc');
    await t.user.click(genshinCheck);
    expect(document.getElementById(errId)).toHaveTextContent(C['err.uid']);
    expect(t.open).toHaveBeenCalledTimes(1); // the GitHub popup only
  });

  it('a check-button press on an empty, unlinked UID never blocks a later save of other fields', async () => {
    const t = setup();
    await login(t);
    const genshinCheck = within(t.container.querySelector('fieldset[data-group="genshin"]') as HTMLElement).getByRole('button', { name: C['label:enka'] });
    await t.user.click(genshinCheck);
    expect(screen.getByText(C['err.required'])).toBeInTheDocument();
    await t.user.type(field(C['label:field.ACCOUNT_ZZZ_UID']), '1300025292');
    await t.user.type(field(C['label:field.ACCOUNT_ZZZ_NAME']), 'Belle');
    await t.user.click(screen.getByRole('button', { name: C['label:save'] }));
    await screen.findByText(C.saved);
    expect(t.calls.filter((c) => c.key === 'vars.set').map((c) => c.body?.name)).toEqual(['ACCOUNT_ZZZ_UID', 'ACCOUNT_ZZZ_NAME']);
    // typing clears the press: an emptied field is not "required" again
    const uid = field(C['label:field.ACCOUNT_GENSHIN_UID']);
    await t.user.type(uid, '6');
    await t.user.clear(uid);
    expect(screen.queryByText(C['err.required'])).toBeNull();
  });

  it('UID fields bring up the numeric keyboard; the SteamID64 field does not (a profile address is accepted)', async () => {
    const t = setup();
    await login(t);
    expect(field(C['label:field.ACCOUNT_GENSHIN_UID'])).toHaveAttribute('inputmode', 'numeric');
    expect(field(C['label:field.ACCOUNT_ZZZ_UID'])).toHaveAttribute('inputmode', 'numeric');
    expect(field(C['label:field.ACCOUNT_STEAM_ID64'])).not.toHaveAttribute('inputmode');
    expect(t.fetch).toHaveBeenCalled();
  });

  it('check buttons: valid → the exact Enka, op.gg and lolchess.gg links with target, rel, referrerpolicy and the sr text', async () => {
    const t = setup();
    await login(t);
    await t.user.type(field(C['label:field.ACCOUNT_GENSHIN_UID']), '618285856');
    await t.user.type(field(C['label:field.ACCOUNT_ZZZ_UID']), '1300025292');
    await t.user.type(field(C['label:field.ACCOUNT_RIOT_ID']), 'Hide on bush#KR1');
    const links = screen.getAllByRole('link', { name: /에서 확인/ });
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      'https://enka.network/zzz/1300025292/',
      'https://enka.network/u/618285856/',
      'https://op.gg/lol/summoners/kr/Hide%20on%20bush-KR1',
      'https://lolchess.gg/profile/kr/Hide%20on%20bush-KR1',
    ]);
    for (const a of links) {
      expect(a).toHaveAttribute('target', '_blank');
      expect(a).toHaveAttribute('rel', 'noopener noreferrer');
      expect(a).toHaveAttribute('referrerpolicy', 'no-referrer');
      expect(within(a).getByText('↗')).toHaveAttribute('aria-hidden', 'true');
      expect(within(a).getByText(C['label:newTab'])).toHaveClass('sr-only');
    }
    expect(screen.getByText(C.checkHelp)).toBeInTheDocument();
  });

  it('field errors appear only on blur or save, with aria-invalid and aria-describedby, never in a live region', async () => {
    const t = setup();
    await login(t);
    const uid = field(C['label:field.ACCOUNT_GENSHIN_UID']);
    await t.user.type(uid, 'abc');
    expect(screen.queryByText(C['err.uid'])).toBeNull();
    expect(uid).not.toHaveAttribute('aria-invalid');
    await t.user.tab();
    const err = screen.getByText(C['err.uid']);
    expect(uid).toHaveAttribute('aria-invalid', 'true');
    expect(uid.getAttribute('aria-describedby')?.split(' ')).toContain(err.id);
    expect(err.closest('[role="alert"], [role="status"], [aria-live]')).toBeNull();
    // save reveals the errors of fields never visited
    await t.user.type(field(C['label:field.ACCOUNT_ZZZ_UID']), '0');
    await t.user.click(screen.getByRole('button', { name: C['label:save'] }));
    expect(field(C['label:field.ACCOUNT_ZZZ_UID'])).toHaveAttribute('aria-invalid', 'true');
    expect(t.keys().filter((k) => k === 'vars.set')).toEqual([]);
  });

  it('a secret-looking value empties the field and shows the warning', async () => {
    const t = setup();
    await login(t);
    const name = field(C['label:field.ACCOUNT_GENSHIN_NAME']);
    await t.user.click(name);
    await t.user.paste('ghp_' + 'x'.repeat(36));
    expect(name.value).toBe('');
    expect(t.store.get('ACCOUNT_GENSHIN_NAME')).toBe('');
    expect(screen.getByText(C.secret)).toBeInTheDocument();
    const uid = field(C['label:field.ACCOUNT_ZZZ_UID']);
    await t.user.click(uid);
    await t.user.paste('0123456789abcdef0123456789ABCDEF');
    expect(uid.value).toBe('');
    expect(screen.getAllByText(C.secret)).toHaveLength(2);
  });

  it('values and 변경됨 survive switching accounts; the current tile highlights its group (LoL and TFT share the Riot group)', async () => {
    const t = setup({ current: 'genshin' });
    await login(t);
    await t.user.type(field(C['label:field.ACCOUNT_GENSHIN_UID']), '618285856');
    expect(t.container.querySelector('fieldset[data-group="genshin"]')).toHaveAttribute('data-current');
    t.rerenderWith({ current: 'tft' });
    expect(t.container.querySelector('fieldset[data-group="riot"]')).toHaveAttribute('data-current');
    expect(t.container.querySelector('fieldset[data-group="genshin"]')).not.toHaveAttribute('data-current');
    t.rerenderWith({ current: 'lol' });
    expect(t.container.querySelector('fieldset[data-group="riot"]')).toHaveAttribute('data-current');
    expect(field(C['label:field.ACCOUNT_GENSHIN_UID']).value).toBe('618285856');
    expect(screen.getByLabelText(new RegExp(`^${C['label:field.ACCOUNT_GENSHIN_UID']} ${C['label:changed']}`))).toBeInTheDocument();
  });

  it('a beforeunload handler only while dirty; onDirtyChange follows', async () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const t = setup();
    await login(t);
    expect(add.mock.calls.filter(([type]) => type === 'beforeunload')).toEqual([]);
    await t.user.type(field(C['label:field.ACCOUNT_GENSHIN_UID']), '6');
    expect(add.mock.calls.filter(([type]) => type === 'beforeunload')).toHaveLength(1);
    expect(t.onDirtyChange).toHaveBeenLastCalledWith(true);
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    await t.user.clear(field(C['label:field.ACCOUNT_GENSHIN_UID']));
    expect(remove.mock.calls.filter(([type]) => type === 'beforeunload')).toHaveLength(1);
    expect(t.onDirtyChange).toHaveBeenLastCalledWith(false);
  });
});

// ---- save ------------------------------------------------------------------------------------------------------------

describe('save', () => {
  it('sends vars.set per changed field in ACCOUNT_VARS order, never dispatch; then the saved summary and no 변경됨', async () => {
    const t = setup();
    await login(t);
    await t.user.type(field(C['label:field.ACCOUNT_ZZZ_UID']), '1300025292');
    await t.user.type(field(C['label:field.ACCOUNT_ZZZ_NAME']), 'Belle');
    await t.user.type(field(C['label:field.ACCOUNT_GENSHIN_UID']), ' 618285856 ');
    await t.user.type(field(C['label:field.ACCOUNT_GENSHIN_NAME']), 'Traveler');
    await t.user.click(screen.getByRole('button', { name: C['label:save'] }));
    await screen.findByText(C.saved);
    const sets = t.calls.filter((c) => c.key === 'vars.set' || c.key === 'vars.delete');
    expect(sets.map((c) => c.body)).toEqual([
      { op: 'vars.set', name: 'ACCOUNT_GENSHIN_UID', value: '618285856' },
      { op: 'vars.set', name: 'ACCOUNT_GENSHIN_NAME', value: 'Traveler' },
      { op: 'vars.set', name: 'ACCOUNT_ZZZ_UID', value: '1300025292' },
      { op: 'vars.set', name: 'ACCOUNT_ZZZ_NAME', value: 'Belle' },
    ]);
    expect(t.keys()).not.toContain('dispatch');
    expect(screen.getByText(C.saved).closest('[role="alert"]')).not.toBeNull();
    expect(screen.queryByText(C['label:changed'])).toBeNull();
    expect(field(C['label:field.ACCOUNT_GENSHIN_UID']).value).toBe('618285856');
  });

  it('a UID without its nickname, or a Riot ID whose confirmation differs, saves nothing and focuses the field', async () => {
    const t = setup();
    await login(t);
    await t.user.type(field(C['label:field.ACCOUNT_GENSHIN_UID']), '618285856');
    await t.user.click(screen.getByRole('button', { name: C['label:save'] }));
    expect(document.activeElement).toBe(field(C['label:field.ACCOUNT_GENSHIN_NAME']));
    expect(screen.getByText(C['err.required'])).toBeInTheDocument();
    await t.user.type(field(C['label:field.ACCOUNT_GENSHIN_NAME']), 'Traveler');
    await t.user.type(field(C['label:field.ACCOUNT_RIOT_ID']), 'Hide on bush#KR1');
    await t.user.type(field(C['label:field.riotConfirm']), 'Hide on bush#KR2');
    await t.user.click(screen.getByRole('button', { name: C['label:save'] }));
    const confirm = field(C['label:field.riotConfirm']);
    expect(document.activeElement).toBe(confirm);
    expect(confirm).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText(C['err.riotConfirm'])).toBeInTheDocument();
    expect(t.keys().filter((k) => k.startsWith('vars.s') || k === 'vars.delete')).toEqual([]);
    // NFC + trim: a decomposed or padded confirmation of the same ID passes
    await t.user.clear(confirm);
    await t.user.type(confirm, ' Hide on bush#KR1 ');
    await t.user.click(screen.getByRole('button', { name: C['label:save'] }));
    await screen.findByText(C.saved);
    expect(t.calls.filter((c) => c.key === 'vars.set').map((c) => c.body?.name)).toEqual(['ACCOUNT_GENSHIN_UID', 'ACCOUNT_GENSHIN_NAME', 'ACCOUNT_RIOT_ID']);
  });

  it('emptying a linked ID asks for the unlink box; with it the ID and its name are deleted', async () => {
    const t = setup({ vars: [{ name: 'ACCOUNT_ZZZ_UID', value: '1300025292' }, { name: 'ACCOUNT_ZZZ_NAME', value: 'Belle' }] });
    await login(t);
    await t.user.clear(field(C['label:field.ACCOUNT_ZZZ_UID']));
    const box = screen.getByRole('checkbox', { name: C['label:unlinkConfirm'] });
    expect(box).not.toBeChecked();
    await t.user.click(screen.getByRole('button', { name: C['label:save'] }));
    expect(screen.getByText(C['err.unlink'])).toBeInTheDocument();
    expect(t.keys().filter((k) => k === 'vars.delete')).toEqual([]);
    await t.user.click(box);
    await t.user.click(screen.getByRole('button', { name: C['label:save'] }));
    await screen.findByText(C.saved);
    expect(t.calls.filter((c) => c.key === 'vars.delete').map((c) => c.body)).toEqual([
      { op: 'vars.delete', name: 'ACCOUNT_ZZZ_UID' },
      { op: 'vars.delete', name: 'ACCOUNT_ZZZ_NAME' },
    ]);
    expect(field(C['label:field.ACCOUNT_ZZZ_NAME']).value).toBe('');
    expect(screen.queryByRole('checkbox', { name: C['label:unlinkConfirm'] })).toBeNull();
  });

  it('a relay invalid stops the save: the message names the field and how many were saved; focus and aria-invalid there', async () => {
    const t = setup({
      answers: { 'vars.set': (b, url) => (b?.name === 'ACCOUNT_GENSHIN_NAME' ? reply(url, 400, { error: 'invalid' }) : reply(url, 200, { ok: true })) },
    });
    await login(t);
    await t.user.type(field(C['label:field.ACCOUNT_GENSHIN_UID']), '618285856');
    await t.user.type(field(C['label:field.ACCOUNT_GENSHIN_NAME']), 'Traveler');
    await t.user.type(field(C['label:field.ACCOUNT_ZZZ_UID']), '1300025292');
    await t.user.type(field(C['label:field.ACCOUNT_ZZZ_NAME']), 'Belle');
    await t.user.click(screen.getByRole('button', { name: C['label:save'] }));
    const text = C.invalid.replace('{field}', C['label:field.ACCOUNT_GENSHIN_NAME']).replace('{n}', '1');
    await screen.findByText(text);
    expect(screen.getByText(text).closest('[role="alert"]')).not.toBeNull();
    const name = field(C['label:field.ACCOUNT_GENSHIN_NAME']);
    expect(document.activeElement).toBe(name);
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(t.calls.filter((c) => c.key === 'vars.set').map((c) => c.body?.name)).toEqual(['ACCOUNT_GENSHIN_UID', 'ACCOUNT_GENSHIN_NAME']);
    expect(screen.getByLabelText(new RegExp(`^${C['label:field.ACCOUNT_GENSHIN_UID']}$`))).toBeInTheDocument(); // saved: no 변경됨
    expect(t.keys()).not.toContain('dispatch');
  });

  it('a 401 handle while saving ends the login, moves focus to the error line, says the revoke is unconfirmed, keeps the values', async () => {
    const t = setup({ answers: { 'vars.set': (_b, url) => reply(url, 401, { error: 'handle' }) } });
    await login(t);
    await t.user.type(field(C['label:field.ACCOUNT_GENSHIN_UID']), '618285856');
    await t.user.type(field(C['label:field.ACCOUNT_GENSHIN_NAME']), 'Traveler');
    screen.getByRole('button', { name: C['label:save'] }).focus();
    await t.user.keyboard('{Enter}');
    await waitFor(() => expect(loginButton()).toBeInTheDocument());
    expect(errorLine(t)).toHaveTextContent(C.handle);
    expect(errorLine(t)).toHaveTextContent(C.revokeUnconfirmed);
    expect(within(errorLine(t)).getByRole('link', { name: linkNamed(C['label:authorizedApps']) })).toHaveAttribute('href', 'https://github.com/settings/apps/authorizations');
    expect(document.activeElement).toBe(errorLine(t));
    expect(t.box.get()).toBeNull();
    expect(field(C['label:field.ACCOUNT_GENSHIN_UID']).value).toBe('618285856');
    expect(screen.queryByRole('button', { name: C['label:save'] })).toBeNull();
    await waitFor(() => expect(t.keys()).toContain('/gh/logout'));
  });

  it('a value the relay would refuse is never sent: a secret-looking stored value is emptied with the warning and nothing is saved', async () => {
    const store = createFormStore<AccountVar>();
    store.set('ACCOUNT_GENSHIN_UID', '618285856');
    store.set('ACCOUNT_GENSHIN_NAME', '0123456789abcdef' + '0123456789abcdef'); // a Steam key shape that never came through a field
    const t = setup({ store });
    await login(t);
    await t.user.click(screen.getByRole('button', { name: C['label:save'] }));
    const name = field(C['label:field.ACCOUNT_GENSHIN_NAME']);
    await waitFor(() => expect(document.activeElement).toBe(name));
    expect(name.value).toBe('');
    expect(screen.getByText(C.secret)).toBeInTheDocument();
    expect(t.keys().filter((k) => k === 'vars.set' || k === 'vars.delete')).toEqual([]);
  });

  it('other save failures keep the count of saved items and mark no field; gh-rejected marks the field at fault', async () => {
    let answer: Answer = (b, url) => (b?.name === 'ACCOUNT_GENSHIN_NAME' ? reply(url, 429, { error: 'rate', retryAfter: 120 }) : reply(url, 200, { ok: true }));
    const t = setup({ answers: { 'vars.set': (b, url) => answer(b, url) } });
    await login(t);
    await t.user.type(field(C['label:field.ACCOUNT_GENSHIN_UID']), '618285856');
    await t.user.type(field(C['label:field.ACCOUNT_GENSHIN_NAME']), 'Traveler');
    const save = screen.getByRole('button', { name: C['label:save'] });
    save.focus();
    await t.user.keyboard('{Enter}');
    const rate = C.rate.replace('{time}', kst(1_800_000_000_000 + 120_000));
    await screen.findByText(rate);
    const alertLine = screen.getByText(rate).closest('[role="alert"]') as HTMLElement;
    expect(alertLine).toHaveTextContent(C.savedBefore.replace('{n}', '1'));
    expect(field(C['label:field.ACCOUNT_GENSHIN_NAME'])).not.toHaveAttribute('aria-invalid');
    expect(document.activeElement).toBe(save);
    answer = (_b, url) => reply(url, 422, { error: 'gh-rejected' });
    await t.user.click(save);
    await screen.findByText(C['gh-rejected']);
    expect(screen.queryByText(C.savedBefore.replace('{n}', '1'))).toBeNull(); // nothing saved this time
    const name = field(C['label:field.ACCOUNT_GENSHIN_NAME']);
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(document.activeElement).toBe(name);
  });

  it('the commands list no delete before the unlink box is ticked (also when a secret paste emptied a linked ID)', async () => {
    const t = setup({ vars: [{ name: 'ACCOUNT_ZZZ_UID', value: '1300025292' }, { name: 'ACCOUNT_ZZZ_NAME', value: 'Belle' }] });
    await login(t);
    const uid = field(C['label:field.ACCOUNT_ZZZ_UID']);
    await t.user.clear(uid);
    await t.user.paste('ghp_' + 'y'.repeat(36));
    expect(uid.value).toBe('');
    const pre = t.container.querySelector('details[data-mp="no-login"] pre') as HTMLElement;
    expect(pre.textContent).not.toContain('gh variable delete');
    await t.user.click(screen.getByRole('checkbox', { name: C['label:unlinkConfirm'] }));
    expect(pre.textContent?.split('\n')).toEqual([
      'gh variable delete ACCOUNT_ZZZ_UID -R Lunecid/Lunecid.github.io',
      'gh variable delete ACCOUNT_ZZZ_NAME -R Lunecid/Lunecid.github.io',
      'gh workflow run deploy.yml --ref main -R Lunecid/Lunecid.github.io',
    ]);
  });
});

// ---- Steam -----------------------------------------------------------------------------------------------------------

describe('Steam', () => {
  it('the image button: Valve image lang="en" 180×35, described by the help paragraph', async () => {
    const t = setup();
    await login(t);
    const button = screen.getByRole('button', { name: 'Sign in through Steam' });
    const img = within(button).getByRole('img');
    expect(img).toHaveAttribute('src', '/img/sits_01.png');
    expect(img).toHaveAttribute('width', '180');
    expect(img).toHaveAttribute('height', '35');
    expect(img).toHaveAttribute('lang', 'en');
    expect(button).toHaveAccessibleDescription(C.steamHelp);
    expect(t.container.querySelector('details[data-mp="steam-manual"]')).not.toHaveAttribute('open');
  });

  it('no image button when steamButton is false (manual entry open), and none without a handle (the needs-login text)', async () => {
    const t = setup({ steamButton: false });
    await login(t);
    expect(screen.queryByRole('button', { name: 'Sign in through Steam' })).toBeNull();
    expect(t.container.querySelector('details[data-mp="steam-manual"]')).toHaveAttribute('open');
    t.unmount();
    const u = setup();
    await login(u);
    await u.user.click(screen.getByRole('button', { name: C['label:logout'] }));
    await waitFor(() => expect(loginButton()).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Sign in through Steam' })).toBeNull();
    expect(screen.getByText(C.steamNeedsLogin)).toBeInTheDocument();
  });

  it("the popup: open('about:blank', 'acct-steam', …), opener cut, the spec's OpenID URL with the pending state", async () => {
    const t = setup();
    await login(t);
    const s = await steamLogin(t);
    expect(t.open).toHaveBeenLastCalledWith('about:blank', 'acct-steam', POPUP);
    const popup = t.popups.at(-1);
    expect(popup).toMatchObject({ target: 'acct-steam', openerCut: true });
    expect(popup?.url).toBe(steamLoginUrl(s));
  });

  it('a channel message with another s is ignored; a relay state that differs leaves the fields untouched and opens manual entry', async () => {
    const t = setup({ answers: { '/openid/verify': (_b, url) => reply(url, 200, { steamid: STEAM_ID, state: 'Z'.repeat(22), personaname: 'Robin', profilePublic: true }) } });
    await login(t);
    const s = await steamLogin(t);
    await t.emit(steamFields('Q'.repeat(22)));
    expect(t.keys()).not.toContain('/openid/verify');
    await t.emit(steamFields(s));
    await waitFor(() => expect(t.keys()).toContain('/openid/verify'));
    const summary = screen.getByText(C['label:steamManual']);
    await waitFor(() => expect(document.activeElement).toBe(summary));
    expect(t.container.querySelector('details[data-mp="steam-manual"]')).toHaveAttribute('open');
    expect(t.store.get('ACCOUNT_STEAM_ID64')).toBe('');
    expect(t.store.get('ACCOUNT_STEAM_NAME')).toBe('');
    expect(screen.queryByText(C['label:changed'])).toBeNull();
    expect(screen.getByText(C['steam.invalid'])).toBeInTheDocument();
  });

  it('success fills both fields with 변경됨, the result line in words (role status), focus stays on the button', async () => {
    const t = setup();
    await login(t);
    const s = await steamLogin(t);
    const button = screen.getByRole('button', { name: 'Sign in through Steam' });
    await t.emit(steamFields(s));
    const line = `Steam: Robin · ${STEAM_ID} · 프로필: 공개`;
    await screen.findByText(line);
    expect(screen.getByText(line)).toHaveAttribute('role', 'status');
    expect(screen.getByText(line).textContent).not.toMatch(/[✓✗✔✘]/);
    expect(field(C['label:field.ACCOUNT_STEAM_ID64']).value).toBe(STEAM_ID);
    expect(field(C['label:field.ACCOUNT_STEAM_NAME']).value).toBe('Robin');
    expect(screen.getAllByText(C['label:changed'])).toHaveLength(2);
    expect(document.activeElement).toBe(button);
    expect(t.calls.find((c) => c.key === '/openid/verify')?.body).toMatchObject({ s, 'openid.mode': 'id_res' });
  });

  it('a private profile and an unknown one are said in words; a Steam error opens manual entry with the §4.7 text', async () => {
    let answer: Answer = (b, url) => reply(url, 200, { steamid: STEAM_ID, state: b?.s, personaname: 'Robin', profilePublic: false });
    const t = setup({ answers: { '/openid/verify': (b, url) => answer(b, url) } });
    await login(t);
    await t.emit(steamFields(await steamLogin(t)));
    await screen.findByText(`Steam: Robin · ${STEAM_ID} · 프로필: 비공개 — Steam 프로필을 공개로 두어야 합니다`);
    answer = (b, url) => reply(url, 200, { steamid: STEAM_ID, state: b?.s, personaname: null, profilePublic: null });
    await t.emit(steamFields(await steamLogin(t)));
    // the name could not be read: the line says so; the same account keeps the name already in the field
    await screen.findByText(`Steam: ${C['label:nameUnknown']} · ${STEAM_ID} · 프로필: 확인하지 못함`);
    expect(field(C['label:field.ACCOUNT_STEAM_NAME']).value).toBe('Robin');
    answer = (_b, url) => reply(url, 502, { error: 'steam-busy' });
    await t.emit(steamFields(await steamLogin(t)));
    await screen.findByText(C['steam.steam-busy']);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByText(C['label:steamManual'])));
  });

  it('a new SteamID without a readable name empties the old name (marked 변경됨) instead of keeping it', async () => {
    const OTHER = '76561197960265729';
    const t = setup({
      vars: [{ name: 'ACCOUNT_STEAM_ID64', value: OTHER }, { name: 'ACCOUNT_STEAM_NAME', value: 'Old name' }],
      answers: { '/openid/verify': (b, url) => reply(url, 200, { steamid: STEAM_ID, state: b?.s, personaname: null, profilePublic: true }) },
    });
    await login(t);
    await t.emit(steamFields(await steamLogin(t)));
    await screen.findByText(`Steam: ${C['label:nameUnknown']} · ${STEAM_ID} · 프로필: 공개`);
    expect(field(C['label:field.ACCOUNT_STEAM_ID64']).value).toBe(STEAM_ID);
    const name = field(C['label:field.ACCOUNT_STEAM_NAME']);
    expect(name.value).toBe('');
    expect(screen.getByLabelText(new RegExp(`^${C['label:field.ACCOUNT_STEAM_NAME']} ${C['label:changed']}$`))).toBe(name);
  });

  it('a secret-looking Steam persona name is treated as unknown: never stored, shown or sent', async () => {
    const SECRET = '0123456789abcdef' + '0123456789abcdef';
    const t = setup({ answers: { '/openid/verify': (b, url) => reply(url, 200, { steamid: STEAM_ID, state: b?.s, personaname: SECRET, profilePublic: true }) } });
    await login(t);
    await t.emit(steamFields(await steamLogin(t)));
    await screen.findByText(`Steam: ${C['label:nameUnknown']} · ${STEAM_ID} · 프로필: 공개`);
    expect(t.store.get('ACCOUNT_STEAM_NAME')).toBe('');
    expect(document.body.textContent).not.toContain(SECRET);
    await t.user.click(screen.getByRole('button', { name: C['label:save'] }));
    expect(JSON.stringify(t.calls.map((c) => c.body))).not.toContain(SECRET);
  });

  it('a blocked Steam popup shows the §4.7 text and opens the fallback', async () => {
    const t = setup();
    await login(t);
    t.blockPopups(true);
    await t.user.click(screen.getByRole('button', { name: 'Sign in through Steam' }));
    const steam = t.container.querySelector('fieldset[data-group="steam"]') as HTMLElement;
    expect(within(steam).getByText(C['popup-blocked']).closest('[role="alert"]')).not.toBeNull();
    expect((t.container.querySelector('details[data-mp="no-login"]') as HTMLDetailsElement).open).toBe(true);
    expect(t.keys()).not.toContain('/openid/verify');
  });

  it('[Steam 연동 해제] empties both Steam fields and moves focus to the unlink box', async () => {
    const t = setup({ vars: [{ name: 'ACCOUNT_STEAM_ID64', value: STEAM_ID }, { name: 'ACCOUNT_STEAM_NAME', value: 'Robin' }] });
    await login(t);
    screen.getByRole('button', { name: C['label:steamUnlink'] }).focus();
    await t.user.keyboard('{Enter}');
    expect(t.store.get('ACCOUNT_STEAM_ID64')).toBe('');
    expect(t.store.get('ACCOUNT_STEAM_NAME')).toBe('');
    const box = screen.getByRole('checkbox', { name: C['label:unlinkConfirm'] });
    expect(document.activeElement).toBe(box);
    expect(screen.queryByRole('button', { name: C['label:steamUnlink'] })).toBeNull();
  });

  it("Valve's image gets no opacity, filter or blend in the stylesheet (spec §3.7, R-19)", () => {
    const css = readFileSync(join(process.cwd(), 'src/islands/account/ManagePanel.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: (m[1] ?? '').trim(), body: m[2] ?? '' }));
    const steam = rules.filter((r) => /mp-steam/.test(r.selector));
    expect(steam.length).toBeGreaterThan(0);
    for (const r of steam) expect(r.body, r.selector).not.toMatch(/\b(opacity|filter|mix-blend-mode|backdrop-filter)\s*:/);
    // and no rule elsewhere reaches an <img> inside the section
    for (const r of rules.filter((x) => /\bimg\b/.test(x.selector))) expect(r.body, r.selector).not.toMatch(/\b(opacity|filter|mix-blend-mode)\s*:/);
  });
});

// ---- session end -----------------------------------------------------------------------------------------------------

describe('session end', () => {
  it('[로그아웃] ends the session before /gh/logout answers, empties the box and keeps the values; focus on the login button', async () => {
    const answered = Promise.withResolvers<void>();
    const t = setup({
      answers: {
        '/gh/logout': async (_b, url) => {
          await answered.promise;
          return reply(url, 204);
        },
      },
    });
    await login(t);
    await t.user.type(field(C['label:field.ACCOUNT_GENSHIN_UID']), '618285856');
    await t.user.click(screen.getByRole('button', { name: C['label:logout'] }));
    await waitFor(() => expect(loginButton()).toBeInTheDocument()); // still waiting for the relay
    expect(document.activeElement).toBe(loginButton());
    expect(t.keys()).toContain('/gh/logout');
    expect(t.calls.find((c) => c.key === '/gh/logout')?.init.headers).toMatchObject({ Authorization: `Bearer ${HANDLE}` });
    expect(t.box.get()).toBeNull();
    expect(screen.getByText(C.loginEnded).closest('[data-mp="error"]')).not.toBeNull();
    await act(async () => answered.resolve());
    expect(screen.queryByText(C.revokeUnconfirmed)).toBeNull();
    expect(field(C['label:field.ACCOUNT_GENSHIN_UID']).value).toBe('618285856');
  });

  it("an unconfirmed revoke says the grant may still be active and links to GitHub's authorised-apps settings", async () => {
    const t = setup({ answers: { '/gh/logout': () => Promise.reject(new TypeError('offline')) } });
    await login(t);
    await t.user.click(screen.getByRole('button', { name: C['label:logout'] }));
    await screen.findByText(C.revokeUnconfirmed);
    expect(screen.getByRole('link', { name: linkNamed(C['label:authorizedApps']) })).toHaveAttribute('href', 'https://github.com/settings/apps/authorizations');
    expect(t.box.get()).toBeNull();
  });

  it('the clock starts after session(): the idle warning at 13 min with [계속 로그인] (no request), the end at 15 min logs out', async () => {
    const t = setup();
    t.advance(30 * MIN); // no clock before the session
    await login(t);
    const before = t.calls.length;
    t.advance(13 * MIN);
    const warning = await screen.findByText(C.idleWarn.replace('{n}', '2'));
    expect(warning.closest('[role="alert"]')).not.toBeNull();
    screen.getByRole('button', { name: C['label:stayIn'] }).focus();
    await t.user.keyboard('{Enter}');
    expect(screen.queryByText(C.idleWarn.replace('{n}', '2'))).toBeNull();
    expect(document.activeElement).toBe(heading()); // the button removed itself
    expect(t.calls).toHaveLength(before);
    t.advance(14 * MIN);
    expect(t.box.get()).toBe(HANDLE);
    t.advance(MIN);
    await waitFor(() => expect(loginButton()).toBeInTheDocument());
    expect(t.keys().at(-1)).toBe('/gh/logout');
    expect(t.box.get()).toBeNull();
    // the ending is announced: its line is in the error-line alert
    expect(screen.getByText(C.loginEnded).closest('[role="alert"]')).toBe(errorLine(t));
  });

  it('the cap warns 5 minutes before the handle expires; the minutes line counts down', async () => {
    const t = setup();
    await login(t);
    for (let i = 0; i < 5; i += 1) {
      t.advance(10 * MIN);
      await t.user.click(heading()); // activity keeps the idle clock fresh
    }
    t.advance(4 * MIN);
    expect(heading()).toHaveTextContent('6분 남음');
    expect(screen.queryByText(C.capWarn.replace('{n}', '5'))).toBeNull();
    t.advance(MIN);
    await screen.findByText(C.capWarn.replace('{n}', '5'));
    expect(screen.getByText(C.capWarn.replace('{n}', '5')).closest('[role="alert"]')).not.toBeNull();
  });

  it('a wake after the handle was dropped (pageshow after the beacon) shows the signed-out state and the unconfirmed revoke', async () => {
    const t = setup();
    await login(t);
    act(() => t.admin.relay.beaconLogout());
    expect(t.beacons).toEqual([[`${RELAY}/gh/logout`, HANDLE]]);
    t.wake();
    await waitFor(() => expect(loginButton()).toBeInTheDocument());
    expect(errorLine(t)).toHaveTextContent(C.loginEnded);
    expect(errorLine(t)).toHaveTextContent(C.revokeUnconfirmed);
  });

  it('the handle, ticket, login nonce and Steam state never reach the DOM', async () => {
    const t = setup();
    const n = await login(t);
    const s = await steamLogin(t);
    const html = document.documentElement.outerHTML;
    for (const secret of [HANDLE, TICKET, n, s]) expect(html).not.toContain(secret);
  });
});

// ---- without signing in (§4.8) ----------------------------------------------------------------------------------------

describe('without signing in', () => {
  it('the commands follow the changed fields; values with " or \\ go to the web form, invalid ones are named apart', async () => {
    const t = setup();
    await login(t);
    await t.user.type(field(C['label:field.ACCOUNT_GENSHIN_UID']), '618285856');
    await t.user.type(field(C['label:field.ACCOUNT_GENSHIN_NAME']), "It's");
    await t.user.type(field(C['label:field.ACCOUNT_ZZZ_NAME']), 'x" --env "prod');
    await t.user.type(field(C['label:field.ACCOUNT_ZZZ_UID']), 'abc');
    const fallback = t.container.querySelector('details[data-mp="no-login"]') as HTMLElement;
    const pre = fallback.querySelector('pre') as HTMLElement;
    expect(pre.textContent?.split('\n')).toEqual([
      "gh variable set ACCOUNT_GENSHIN_UID --body '618285856' -R Lunecid/Lunecid.github.io",
      "gh variable set ACCOUNT_GENSHIN_NAME --body 'It''s' -R Lunecid/Lunecid.github.io",
      'gh workflow run deploy.yml --ref main -R Lunecid/Lunecid.github.io',
    ]);
    expect(pre.textContent).not.toContain('&&');
    expect(within(fallback).getByText(C.skippedShell).nextElementSibling).toHaveTextContent('ACCOUNT_ZZZ_NAME');
    expect(within(fallback).getByText(C.skippedInvalid).nextElementSibling).toHaveTextContent('ACCOUNT_ZZZ_UID');
    expect(within(fallback).getByText(C['label:psNote'])).toBeInTheDocument();
  });
});
