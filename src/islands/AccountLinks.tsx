// LINKED ACCOUNTS row under the membership card (account-link spec §3.1–§3.7, §4.1).
// Server and first client render: one <details class="acct-tile"> per shown tile, its summary the tile and its body
// the whole card as static HTML (the numbers are in the page without JavaScript). No shown tile → a zero-height empty
// frame and no caption, so the dark release looks exactly as before.
// After mount the tiles become buttons that open one native <dialog> (spec §3.2): the shell comes from
// src/lib/use-hud-dialog.ts (ImageViewer's pattern); ←/→ and ‹ › switch accounts inside the one dialog, an
// off-screen role="status" announces each switch, and closing returns focus to the account shown last.
// The card region (./account/AccountCard.tsx) runs the open timeline TL (spec §3.6: a ghost frame flies from the
// tile to the dialog, the panel fades in, head/stats/items/foot follow; count-up only on an account's first open),
// the switch cross-fade (card region only, 180 ms), both reduced-motion paths (one 150 ms fade, no ghost, no count-up,
// final values), and the stale sweep (spec §3.5: on hydration and on visibilitychange → visible, never on the
// opening click, after the close while the dialog is open).
// Owner mode (spec §4.1) starts after mount and only when the address carries ?manage: only then is the management
// core (src/lib/account-admin.ts) imported, so a visitor's page loads no relay code and makes no relay request. The
// core removes ?manage at once; inside another page only the framed line shows; on an allowed host in a secure context
// every enabled tile shows with its state, a "연동 관리" button ends the row, and the panel chunk is imported here and
// nowhere else. The panel sits in the dialog body outside the card region and stays mounted for the page's life (it
// owns the session clock and the run tracking): closing the dialog only hides it. A same-tab login return (#gh= /
// #gh-error=) is read on the same mount; its ticket lives only in that closure until the relay has it.
// Every free text (nicknames, game names, Riot IDs) is a JSX text node.
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ComponentType, type CSSProperties, type JSX, type KeyboardEvent, type ReactNode } from 'react';
import type { Lang } from '../i18n/ui';
import type * as CoreModule from '../lib/account-admin';
import type { AdminDeps, FormStore } from '../lib/account-admin';
import { ACCOUNT_MAX_AGE_DAYS } from '../lib/account-config';
import type { AccountVar } from '../lib/account-ids';
import type { AccountLinksLabels, AccountTile, AccountTileKey } from '../lib/account-view';
import type { IslandImage } from '../lib/island-image';
import { isFresh } from '../lib/freshness';
import { prefersReducedNow, useReducedMotionPref } from '../lib/motion-pref';
import { useHudDialog } from '../lib/use-hud-dialog';
import AccountCard, { TL } from './account/AccountCard';
import type { AdminApi, LoginError, ManagePanelProps } from './account/ManagePanel';
import './AccountLinks.css';

export { TL };
/** Close time (spec §3.6): the 80 ms dialog fade + the 220 ms return of the ghost frame (DV-2). */
export const CLOSE_MS = TL.closeFade + TL.closeGhost;
/** Close time under reduced motion (either path): one 150 ms opacity fade (spec §3.6, DV-2). */
export const CLOSE_MS_REDUCED = 150;
/** A switch cross-fades the card region for this long (spec §3.2). */
export const SWITCH_MS = 180;
/** A <details> whose toggle arrives within this long after mount was a pre-hydration click: it opens the dialog
 *  (spec §3.1). One opened earlier (being read) is folded into its button instead. */
export const TOGGLE_WINDOW_MS = 1000;
/** The scroll-lock owner of the account dialog (spec §3.2). */
const LOCK_OWNER = 'account-dialog';
/** The management fields: arrow keys edit text there, and a switch does not scroll away from them (spec §3.2). */
const TEXT_ENTRY = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';
/** ←/→ keep their own meaning here: text entry, and the command block that scrolls sideways (spec §4.8). */
const OWN_ARROWS = `${TEXT_ENTRY}, pre`;

export interface AccountLinksProps {
  lang: Lang;
  /** Every enabled tile with its state (owner mode needs them all); visitors see only the shown ones. */
  tiles: AccountTile[];
  labels: AccountLinksLabels;
  /** Relay origin (null until the owner deploys the Worker); owner mode only. */
  relay: string | null;
  /** Whether the Steam sign-in button image ships; owner mode only. */
  steamButton: boolean;
}

type Core = typeof CoreModule;
type PanelFocus = NonNullable<ManagePanelProps['focus']>;
type PanelStore = FormStore<AccountVar> & { discard(): void };
/** Owner mode once ?manage was read: inside another page, or the management section with its core bound to the page. */
type Owner = { kind: 'framed' } | { kind: 'manage'; admin: AdminApi; store: PanelStore };

/**
 * The core bound to this page, built once in owner mode. The core calls these functions detached, so the ones that
 * need their object are wrapped: sendBeacon throws an illegal invocation when it is not called on navigator.
 */
function pageAdmin(core: Core, relay: string | null): AdminApi {
  const deps: AdminDeps = {
    relay,
    fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, init),
    open: (url, target, features) => window.open(url, target, features),
    channel: (name) => new BroadcastChannel(name),
    now: () => Date.now(),
    setTimeout,
    clearTimeout,
    location: window.location,
    history: window.history,
    sendBeacon: (url, data) => navigator.sendBeacon(url, data),
    random: (bytes) => crypto.getRandomValues(new Uint8Array(bytes)),
  };
  const box = core.createHandleBox(deps.now);
  return {
    deps,
    box,
    relay: core.createRelay(deps, box),
    listenWake(check) {
      const onVisible = () => {
        if (document.visibilityState === 'visible') check();
      };
      const onShow = () => check();
      document.addEventListener('visibilitychange', onVisible);
      window.addEventListener('pageshow', onShow);
      return () => {
        document.removeEventListener('visibilitychange', onVisible);
        window.removeEventListener('pageshow', onShow);
      };
    },
  };
}

/**
 * The panel's form values, kept by the island so they outlive the panel's sign-outs and account switches (spec §3.2).
 * discard() puts every field back to its stored value: the [버리고 닫기] of the unsaved-changes notice.
 */
function discardableStore(make: () => FormStore<AccountVar>): PanelStore {
  let values = make();
  let stored: Partial<Record<AccountVar, string>> = {};
  return {
    get: (k) => values.get(k),
    set: (k, v) => values.set(k, v),
    changed: (k) => values.changed(k),
    dirty: () => values.dirty(),
    load(saved) {
      values.load(saved);
      stored = { ...saved };
    },
    markSaved(k) {
      values.markSaved(k);
      stored = { ...stored, [k]: values.get(k) };
    },
    discard() {
      values = make();
      values.load(stored);
    },
  };
}

/** A failed same-tab /gh/session: the relay's code (and its wait) for the panel's error line. */
function loginErrorOf(core: Core, e: unknown): LoginError {
  if (!(e instanceof core.RelayError)) return { kind: 'relay', code: 'unknown' };
  const retryAfter = e.extra?.retryAfter;
  return retryAfter === undefined ? { kind: 'relay', code: e.code } : { kind: 'relay', code: e.code, retryAfter };
}

/** Scrolls the dialog body, never the page under it, so `el` shows: at the body's top, or by the least move. */
function scrollBodyTo(body: HTMLElement, el: Element, align: 'top' | 'nearest'): void {
  const outer = body.getBoundingClientRect();
  const inner = el.getBoundingClientRect();
  if (align === 'top' || inner.top < outer.top) body.scrollTop += inner.top - outer.top;
  else if (inner.bottom > outer.bottom) body.scrollTop += Math.min(inner.bottom - outer.bottom, inner.top - outer.top);
}

type Box = { left: number; top: number; width: number; height: number };
/** The ghost frame (spec §3.6): the line is sized to `base` and moved by translate+scale; the four corner brackets
 *  move by translate only (they never stretch). `ms`/`delay` = 0 places it without a transition. */
type Ghost = { base: Box; at: Box; ms: number; delay: number };

const boxOf = (el: Element | null | undefined): Box | null => {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
};

/** The tile's freshness at this moment (spec §3.5; the one rule of src/lib/freshness.ts). Riot tiles never go stale. */
const staleNow = (tile: AccountTile, now: number): boolean =>
  tile.fetchedAt !== undefined && !isFresh({ fetchedAt: tile.fetchedAt, maxAgeDays: tile.maxAgeDays ?? ACCOUNT_MAX_AGE_DAYS }, now);

function GhostFrame({ ghost }: { ghost: Ghost }): JSX.Element {
  const { base, at } = ghost;
  const transition = ghost.ms > 0 ? `transform ${ghost.ms}ms var(--ease-out) ${ghost.delay}ms` : 'none';
  const sx = at.width / Math.max(base.width, 1);
  const sy = at.height / Math.max(base.height, 1);
  const right = `calc(${at.left + at.width}px - var(--bracket-sm))`;
  const bottom = `calc(${at.top + at.height}px - var(--bracket-sm))`;
  const corners: [string, string, string][] = [
    ['tl', `${at.left}px`, `${at.top}px`],
    ['tr', right, `${at.top}px`],
    ['bl', `${at.left}px`, bottom],
    ['br', right, bottom],
  ];
  return (
    <div className="acct-dlg__ghost" aria-hidden="true">
      <span
        className="acct-dlg__ghost-line"
        style={{ width: `${base.width}px`, height: `${base.height}px`, transform: `translate(${at.left}px, ${at.top}px) scale(${sx}, ${sy})`, transition }}
      />
      {corners.map(([corner, x, y]) => (
        <span key={corner} className={`acct-dlg__ghost-corner acct-dlg__ghost-corner--${corner}`} style={{ transform: `translate(${x}, ${y})`, transition }} />
      ))}
    </div>
  );
}

/** 'lolchess.gg' → 'lolchess<wbr>.gg': a narrow phone column breaks a site name at its dot, never mid-word. */
function teaserParts(teaser: string): ReactNode[] {
  return teaser.split(/(?=\.)/).flatMap((part, i) => (i === 0 ? [part] : [<wbr key={i} />, part]));
}

/** The card art: decorative (alt=""), lazy, width/height reserving its box (no layout shift when it loads). */
function TileArt({ image }: { image: IslandImage }): JSX.Element {
  const img = (
    <img className="acct-tile__art" src={image.src} srcSet={image.srcSet} sizes={image.sizes} width={image.width} height={image.height} alt="" loading="lazy" decoding="async" />
  );
  return (
    <span className="acct-tile__window">
      {image.avifSrcSet ? (
        <picture className="acct-tile__pic">
          <source type="image/avif" srcSet={image.avifSrcSet} sizes={image.sizes} />
          {img}
        </picture>
      ) : (
        img
      )}
    </span>
  );
}

/**
 * The tile's face, the same inside the SSR <summary> and the mounted <button>: a small character card. The frame (the
 * art window, aria-hidden) holds the art under the corner brackets with the glyph as a corner label, or without art the
 * glyph alone, as before; the skin layer (data-skin, per game, AccountLinks.css) is decoration only. The visible name
 * and the teaser name the tile. An owner-mode status tile (not on the visitors' row) shows its state word, a visible
 * part of the button's name, where a shown tile has its teaser.
 */
function TileFace({ tile, state }: { tile: AccountTile; state?: string | null }): JSX.Element {
  return (
    <span className="acct-tile__face" data-skin={tile.key}>
      <span className="acct-tile__skin" aria-hidden="true" />
      <span className="acct-tile__frame" aria-hidden="true">
        {tile.art !== undefined && <TileArt image={tile.art} />}
        <span className={tile.art !== undefined ? 'acct-tile__glyph acct-tile__glyph--corner' : 'acct-tile__glyph'} lang="en">
          {tile.glyph}
        </span>
        <span className="acct-tile__corners" />
      </span>
      <span className="acct-tile__text">
        <span className="acct-tile__name">{tile.name}</span>
        {state != null && <span className="acct-tile__state">{state}</span>}
        {state == null && tile.teaser !== undefined && (
          <span className="acct-tile__teaser" aria-hidden="true" lang="en">
            {teaserParts(tile.teaser)}
          </span>
        )}
        {state == null && tile.teaserSr !== undefined && <span className="sr-only">{tile.teaserSr}</span>}
      </span>
    </span>
  );
}

const tintStyle = (tile: AccountTile): CSSProperties => ({ '--acct-tint': tile.tint }) as CSSProperties;

function Tile({ tile, labels, lang }: { tile: AccountTile; labels: AccountLinksLabels; lang: Lang }): JSX.Element {
  return (
    <details className="acct-tile" style={tintStyle(tile)}>
      <summary className="acct-tile__sum">
        <TileFace tile={tile} />
      </summary>
      {tile.card && <AccountCard tile={tile} card={tile.card} labels={labels} lang={lang} mode="static" />}
    </details>
  );
}

const fill = (template: string, values: Record<string, string | number>): string =>
  template.replace(/\{(\w+)\}/g, (whole, name: string) => (Object.hasOwn(values, name) ? String(values[name]) : whole));

export default function AccountLinks({ lang, tiles, labels, relay, steamButton }: AccountLinksProps): JSX.Element {
  const shown = tiles.filter((tile) => tile.state === 'shown' && tile.card !== undefined);
  // owner mode: set once after mount, never in render (the server and the first client render are the visitor's)
  const [owner, setOwner] = useState<Owner | null>(null);
  const ownerRef = useRef(owner);
  ownerRef.current = owner;
  const manageOn = owner?.kind === 'manage';
  // stale sweep (spec §3.5): tiles removed after mount; the SSR copy stays for readers without JavaScript
  const [removed, setRemoved] = useState<ReadonlySet<AccountTileKey>>(() => new Set());
  const removedRef = useRef<Set<AccountTileKey>>(new Set());
  // owner mode lists every enabled tile with its build state; the sweep is for visitors only
  const visible = manageOn ? tiles : shown.filter((tile) => !removed.has(tile.key));
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const total = visible.length;
  const rowRef = useRef<HTMLUListElement>(null);
  const capRef = useRef<HTMLParagraphElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const regionRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  const manageButtonRef = useRef<HTMLButtonElement>(null);
  const buttonRefs = useRef(new Map<AccountTileKey, HTMLButtonElement>());
  // the management chunk's component, and what the panel is told (spec §3.2 focus rules, §4.6 chip)
  const [Panel, setPanel] = useState<ComponentType<ManagePanelProps> | null>(null);
  const [panelFocus, setPanelFocus] = useState<PanelFocus | null>(null);
  const pendingPanelFocus = useRef<PanelFocus | null>(null);
  const [ownerOpen, setOwnerOpen] = useState<PanelFocus | null>(null);
  const [loginError, setLoginError] = useState<LoginError | null>(null);
  const [chip, setChip] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const guardReturn = useRef<HTMLElement | null>(null);
  const openerRef = useRef<'tile' | 'manage'>('tile');
  const groupScroll = useRef(false);
  const guardId = useId();
  const [live, setLive] = useState(false);
  const focusOnSwap = useRef<AccountTileKey | null>(null);
  const focusAfterSweep = useRef<AccountTileKey | 'caption' | null>(null);
  const sweepPending = useRef(false);
  const [openRequest, setOpenRequest] = useState<AccountTileKey | null>(null);
  const [current, setCurrent] = useState(0);
  const currentRef = useRef(0);
  const [announce, setAnnounce] = useState('');
  // the card region: remounted by every open (the timeline runs) and every switch (the cross-fade runs)
  const [openSeq, setOpenSeq] = useState(0);
  const [anim, setAnim] = useState<'intro' | 'switch'>('intro');
  const [countFor, setCountFor] = useState<AccountTileKey | null>(null);
  const seen = useRef(new Set<AccountTileKey>());
  const [outgoing, setOutgoing] = useState<{ tile: AccountTile; seq: number } | null>(null);
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const reduce = useReducedMotionPref();
  const descId = useId();

  const buttonOf = (key: AccountTileKey | undefined): HTMLButtonElement | undefined => (key === undefined ? undefined : buttonRefs.current.get(key));

  /** Removes the tiles that are stale now; focus in a removed tile moves to the next tile, else the row caption. */
  const sweepNow = useCallback(() => {
    const list = visibleRef.current;
    const now = Date.now();
    const gone = new Set(list.filter((tile) => staleNow(tile, now)).map((tile) => tile.key));
    if (gone.size === 0) return;
    const active = document.activeElement;
    const focused = list.findIndex((tile) => {
      const button = buttonRefs.current.get(tile.key);
      return active !== null && button !== undefined && button.contains(active);
    });
    const focusedTile = list[focused];
    if (focusedTile !== undefined && gone.has(focusedTile.key)) {
      const next = list.slice(focused + 1).find((tile) => !gone.has(tile.key));
      focusAfterSweep.current = next ? next.key : 'caption';
    }
    for (const key of gone) removedRef.current.add(key);
    currentRef.current = 0;
    setCurrent(0);
    setRemoved(new Set(removedRef.current));
  }, []);

  // The ghost run's frames and timer live in a ref: the opening → open state change must not cancel the removal at 380 ms.
  const ghostRun = useRef<{ frames: number[]; timer: number }>({ frames: [], timer: 0 });
  const stopGhost = useCallback(() => {
    for (const id of ghostRun.current.frames) cancelAnimationFrame(id);
    window.clearTimeout(ghostRun.current.timer);
    ghostRun.current = { frames: [], timer: 0 };
  }, []);

  const dlg = useHudDialog({
    owner: LOCK_OWNER,
    closeMs: CLOSE_MS,
    closeMsReduced: CLOSE_MS_REDUCED,
    // spec §3.2: back to the tile of the account shown last (after any number of switches), or to the "연동 관리"
    // button that opened it; a sweep that waited for the close runs now (spec §3.5). The panel's focus request is
    // cleared, so the same request on the next open reaches it again.
    onClosed: (returnTo) => {
      setAnnounce('');
      stopGhost();
      setGhost(null);
      setOutgoing(null);
      setPanelFocus(null);
      setConfirmClose(false);
      const back = openerRef.current === 'manage' ? manageButtonRef.current : buttonOf(visibleRef.current[currentRef.current]?.key);
      (back ?? returnTo)?.focus();
      if (sweepPending.current) {
        sweepPending.current = false;
        sweepNow();
      }
    },
  });
  const { open: openDialog, requestClose, state: dialogState } = dlg;
  const dialogStateRef = useRef(dialogState);
  dialogStateRef.current = dialogState;

  /**
   * The sweep of hydration and visibilitychange: never while the dialog is open (it runs after the close), and never in
   * owner mode, whose status tiles stay and show the state the build gave them.
   */
  const requestSweep = useCallback(() => {
    if (ownerRef.current?.kind === 'manage') return;
    if (dialogStateRef.current !== 'closed') {
      sweepPending.current = true;
      return;
    }
    sweepNow();
  }, [sweepNow]);

  // The opening click never checks freshness (spec §3.5: a card does not open and vanish). `from` is the "연동 관리"
  // button when it opens the dialog; a tile opens it from its own button.
  const openAt = useCallback(
    (index: number, from?: HTMLElement) => {
      const tile = visibleRef.current[index];
      const origin = from ?? buttonOf(tile?.key);
      if (!tile || !origin || removedRef.current.has(tile.key)) return;
      openerRef.current = from === undefined ? 'tile' : 'manage';
      currentRef.current = index;
      setCurrent(index);
      setAnnounce('');
      setAnim('intro');
      setOpenSeq((n) => n + 1);
      setOutgoing(null);
      // count-up only on this account's first open in this visit, never under reduced motion (spec §3.6, G-007)
      setCountFor(!prefersReducedNow() && !seen.current.has(tile.key) ? tile.key : null);
      seen.current.add(tile.key);
      openDialog(origin);
    },
    [openDialog],
  );

  // The mount swap (spec §3.1): the first client render equals the SSR <details>; this effect turns them into buttons.
  useEffect(() => {
    const row = rowRef.current;
    if (!row) {
      setLive(true); // no tile from the server: owner mode may still draw the status tiles
      return;
    }
    const details = [...row.querySelectorAll<HTMLDetailsElement>('details.acct-tile')];
    const keys = shown.map((tile) => tile.key);
    const active = document.activeElement;
    const focused = details.findIndex((d) => active !== null && d.contains(active));
    if (focused >= 0) focusOnSwap.current = keys[focused] ?? null;
    // A toggle still queued at mount belongs to a click just before hydration: open that account's dialog. A card
    // opened earlier (its toggle already fired) is simply folded into its button.
    const mountedAt = performance.now();
    const offs = details.map((d, index) => {
      const onToggle = () => {
        const key = keys[index];
        if (d.open && key !== undefined && performance.now() - mountedAt <= TOGGLE_WINDOW_MS) setOpenRequest(key);
      };
      d.addEventListener('toggle', onToggle, { once: true });
      return () => d.removeEventListener('toggle', onToggle);
    });
    const stop = () => {
      for (const off of offs) off();
    };
    const timer = window.setTimeout(stop, TOGGLE_WINDOW_MS);
    setLive(true);
    return () => {
      window.clearTimeout(timer);
      stop();
    };
    // mount only: `shown` is the SSR list
  }, []);

  // Owner mode (spec §4.1), read once after mount. A visitor's address has no ?manage: nothing is imported. With it,
  // the core removes the query at once and runs every check before the panel chunk is requested.
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('manage')) return;
    void import('../lib/account-admin')
      .then((core) => {
        if (!core.takeManageQuery(window.location, window.history)) return;
        // The same-tab login return (spec §4.2) is read and removed before any check, so a page that may not manage
        // (framed, insecure, another host) drops a ticket too.
        const back = core.takeReturnFragment(window.location, window.history);
        const allowed = core.manageAllowed(window);
        if (!allowed.ok) {
          if (allowed.reason === 'framed') setOwner({ kind: 'framed' });
          return;
        }
        const admin = pageAdmin(core, relay);
        // The hydration sweep may already have removed tiles that went stale after the build; owner mode shows and
        // opens every enabled tile, so those removals are undone.
        removedRef.current.clear();
        setRemoved(new Set());
        setOwner({ kind: 'manage', admin, store: discardableStore(() => core.createFormStore<AccountVar>()) });
        // A ticket goes to the relay at once and before the panel mounts (the panel starts its session from a filled
        // box); without a relay it cannot be used.
        let opened: Promise<{ focus: PanelFocus; error: LoginError | null }> | null = null;
        if (back?.kind === 'gh') {
          opened =
            relay === null
              ? Promise.resolve({ focus: 'first-control', error: null })
              : admin.relay.session(back.ticket, '').then(
                  () => ({ focus: 'heading', error: null }),
                  (e: unknown) => ({ focus: 'error', error: loginErrorOf(core, e) }),
                );
        } else if (back?.kind === 'gh-error') {
          opened = Promise.resolve({ focus: 'error', error: { kind: 'gh-error', code: back.code } });
        }
        // the only import of the management chunk
        return Promise.all([import('./account/ManagePanel'), opened]).then(([chunk, open]) => {
          setPanel(() => chunk.default);
          if (open === null) return;
          setLoginError(open.error);
          setOwnerOpen(open.focus);
        });
      })
      .catch(() => {
        // A module that did not load: the row stays as it is. The address still loses ?manage and a login return, so
        // no ticket stays in it or in the session history.
        const { location: loc, history: hist } = window;
        const h = new URLSearchParams(loc.hash.slice(1));
        if (new URLSearchParams(loc.search).has('manage') || h.has('gh') || h.has('gh-error')) hist.replaceState(hist.state, '', loc.pathname);
      });
    // mount only: the island's props never change
  }, []);

  useLayoutEffect(() => {
    if (!live || focusOnSwap.current === null) return;
    buttonOf(focusOnSwap.current)?.focus();
    focusOnSwap.current = null;
  }, [live]);

  // the stale sweep: once on hydration, then whenever the page becomes visible again
  useEffect(() => {
    if (!live) return;
    requestSweep();
    const onVisible = () => {
      if (document.visibilityState === 'visible') requestSweep();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [live, requestSweep]);

  useLayoutEffect(() => {
    const target = focusAfterSweep.current;
    if (target === null) return;
    focusAfterSweep.current = null;
    if (target === 'caption') capRef.current?.focus();
    else buttonOf(target)?.focus();
  }, [removed]);

  useEffect(() => {
    if (!live || openRequest === null) return;
    setOpenRequest(null);
    openAt(visibleRef.current.findIndex((tile) => tile.key === openRequest));
  }, [live, openRequest, openAt]);

  /** "연동 관리" and the same-tab return: the first enabled platform, then the panel's control takes focus (spec §3.2). */
  const openManage = useCallback(
    (focus: PanelFocus) => {
      const button = manageButtonRef.current;
      if (button === null || dialogStateRef.current !== 'closed') return;
      pendingPanelFocus.current = focus;
      openAt(0, button);
    },
    [openAt],
  );

  useEffect(() => {
    if (ownerOpen === null) return;
    setOwnerOpen(null);
    openManage(ownerOpen);
  }, [ownerOpen, openManage]);

  // Declared after useHudDialog, so it runs after the shell's showModal() and first focus (the close button): the panel
  // now shows, scrolled into view, and its control can take focus.
  useEffect(() => {
    if (dialogState !== 'opening') return;
    const focus = pendingPanelFocus.current;
    pendingPanelFocus.current = null;
    if (focus === null) return;
    if (bodyRef.current && regionRef.current) scrollBodyTo(bodyRef.current, regionRef.current, 'top');
    setPanelFocus(focus);
  }, [dialogState]);

  // Unsaved management input holds every close path (Esc, backdrop, the close button) on a notice in the dialog.
  const { setGuard } = dlg;
  useEffect(() => {
    if (owner?.kind !== 'manage') return;
    const { store } = owner;
    setGuard(() => {
      if (!store.dirty()) return false;
      guardReturn.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setConfirmClose(true);
      return true;
    });
    return () => setGuard(null);
  }, [owner, setGuard]);

  useLayoutEffect(() => {
    if (confirmClose) keepRef.current?.focus();
  }, [confirmClose]);

  const keepEditing = () => {
    setConfirmClose(false);
    const back = guardReturn.current;
    guardReturn.current = null;
    (back !== null && back.isConnected && back.closest('dialog') !== null ? back : closeRef.current)?.focus();
  };

  const discardAndClose = () => {
    if (owner?.kind === 'manage') owner.store.discard();
    guardReturn.current = null;
    setConfirmClose(false);
    requestClose('button');
  };

  // The panel reports "not dirty" after a save: the notice has nothing left to ask.
  const onDirtyChange = useCallback((dirty: boolean) => {
    if (!dirty) setConfirmClose(false);
  }, []);

  // Leaving the page ends the login: the handle goes to the relay as a beacon (spec §4.2).
  useEffect(() => {
    if (owner?.kind !== 'manage') return;
    const { relay: api } = owner.admin;
    const onHide = () => api.beaconLogout();
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, [owner]);

  // A switch in owner mode moves the panel's highlight to that game's fields and, unless a field has focus, scrolls
  // them into view (spec §3.2); the panel itself stays mounted.
  useLayoutEffect(() => {
    if (!groupScroll.current) return;
    groupScroll.current = false;
    const active = document.activeElement;
    if (active instanceof Element && active.closest(TEXT_ENTRY)) return;
    const group = regionRef.current?.querySelector('[data-group][data-current]');
    if (bodyRef.current && group) scrollBodyTo(bodyRef.current, group, 'nearest');
  }, [current]);

  // The ghost frame (spec §3.6; full motion only): opening flies from the tile (or the "연동 관리" button) to the panel
  // (0–320 ms) and is removed when the panel has faded in (380 ms); closing flies back to the current tile (or that
  // button) after the 80 ms fade (220 ms).
  useEffect(() => {
    if (dialogState !== 'opening' && dialogState !== 'closing') return;
    stopGhost();
    if (prefersReducedNow()) return;
    const panel = boxOf(panelRef.current);
    const tileBox = boxOf(
      openerRef.current === 'manage' ? manageButtonRef.current : buttonOf(visibleRef.current[currentRef.current]?.key)?.querySelector('.acct-tile__frame'),
    );
    if (!panel || !tileBox) return;
    const opening = dialogState === 'opening';
    const from = opening ? tileBox : panel;
    const to = opening ? panel : tileBox;
    setGhost({ base: panel, at: from, ms: 0, delay: 0 });
    const run = ghostRun.current;
    run.frames.push(
      requestAnimationFrame(() => {
        run.frames.push(
          requestAnimationFrame(() =>
            setGhost({ base: panel, at: to, ms: opening ? TL.ghost[1] - TL.ghost[0] : TL.closeGhost, delay: opening ? TL.ghost[0] : TL.closeFade }),
          ),
        );
      }),
    );
    if (opening) run.timer = window.setTimeout(() => setGhost(null), TL.dialog[1]);
  }, [dialogState, stopGhost]);
  useEffect(() => stopGhost, [stopGhost]);

  // the outgoing copy of a switch fades out with the incoming card and is then removed
  useEffect(() => {
    if (outgoing === null) return;
    const timer = window.setTimeout(() => setOutgoing(null), SWITCH_MS);
    return () => window.clearTimeout(timer);
  }, [outgoing]);

  const switchBy = useCallback(
    (step: number) => {
      const list = visibleRef.current;
      const count = list.length;
      if (count < 2) return;
      const from = list[currentRef.current];
      const next = (((currentRef.current + step) % count) + count) % count;
      const tile = list[next];
      if (!tile) return;
      currentRef.current = next;
      setCurrent(next);
      setAnim('switch');
      setCountFor(null); // switching shows final values (spec §3.6)
      seen.current.add(tile.key);
      groupScroll.current = ownerRef.current?.kind === 'manage';
      setOutgoing(from && !prefersReducedNow() ? { tile: from, seq: Date.now() } : null);
      const title = tile.state === 'shown' ? (tile.card?.title ?? '') : labels.manage.state[tile.state];
      setAnnounce(`${fill(labels.position, { n: next + 1, total: count })} · ${tile.name} · ${title}`);
    },
    [labels.position, labels.manage.state],
  );

  const onDialogKeyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    if (dialogState !== 'open' && dialogState !== 'opening') return;
    if (event.target instanceof Element && event.target.closest(OWN_ARROWS)) return;
    event.preventDefault();
    switchBy(event.key === 'ArrowRight' ? 1 : -1);
  };

  // ?manage inside another page: this line and nothing else (spec §4.1; the panel chunk is never requested)
  if (owner?.kind === 'framed') {
    return (
      <div className="acct-links">
        <p className="acct-links__framed">{labels.manage.framed}</p>
      </div>
    );
  }
  if (total === 0) return <div className="acct-row acct-row--empty" />;

  const index = Math.min(current, total - 1);
  const tile = visible[index] as AccountTile;
  // owner mode opens tiles that have no card on the visitors' row: their state word stands where the card would be
  const card = tile.state === 'shown' ? tile.card : undefined;
  // owner mode only (client-side, so the clock cannot break hydration): a tile stale by now says so
  const stateOf = (t: AccountTile): string | null =>
    !manageOn ? null : t.state !== 'shown' ? labels.manage.state[t.state] : staleNow(t, Date.now()) ? labels.manage.state.stale : null;
  const at = (step: number): AccountTile => visible[(((index + step) % total) + total) % total] as AccountTile;
  const describedBy = card !== undefined && (card.riot !== undefined || card.fetchedAtText !== undefined) ? descId : undefined;

  return (
    <div className="acct-links">
      <p className="acct-links__cap hud-label" tabIndex={-1} ref={capRef}>
        {lang === 'ko' && <span className="hud-label__ko">{labels.caption}</span>}
        <span className="hud-label__en" lang="en">
          {labels.captionEn}
        </span>
      </p>
      <ul className="acct-row" role="list" ref={rowRef}>
        {(live ? visible : shown).map((t, i) => (
          <li key={t.key} className="acct-row__item">
            {live ? (
              <button
                ref={(el) => {
                  if (el) buttonRefs.current.set(t.key, el);
                  else buttonRefs.current.delete(t.key);
                }}
                type="button"
                className="acct-tile acct-tile__sum"
                style={tintStyle(t)}
                aria-haspopup="dialog"
                aria-controls="acct-dlg"
                data-current={dialogState !== 'closed' && i === index ? '' : undefined}
                data-off={stateOf(t) !== null ? '' : undefined}
                onClick={() => openAt(i)}
              >
                <TileFace tile={t} state={stateOf(t)} />
              </button>
            ) : (
              <Tile tile={t} labels={labels} lang={lang} />
            )}
          </li>
        ))}
        {manageOn && (
          <li className="acct-row__item acct-row__item--manage">
            <button ref={manageButtonRef} type="button" className="acct-manage" aria-haspopup="dialog" aria-controls="acct-dlg" onClick={() => openManage('first-control')}>
              <span>{labels.manage.button}</span>
              {/* a tracked run while the dialog is closed (spec §4.6): static text, part of the button's name */}
              {chip !== null && dialogState === 'closed' && <span className="acct-manage__chip">{chip}</span>}
            </button>
          </li>
        )}
      </ul>
      {live && (
        <dialog
          ref={dlg.dialogRef}
          id="acct-dlg"
          className="acct-dlg"
          data-state={dialogState}
          aria-labelledby="acct-game acct-title"
          aria-describedby={describedBy}
          style={tintStyle(tile)}
          onKeyDown={onDialogKeyDown}
        >
          <div className="acct-dlg__panel" ref={panelRef}>
            <div className="acct-dlg__head">
              <div className="acct-dlg__heading">
                <h2 id="acct-game" className="acct-dlg__game">
                  {tile.name}
                </h2>
                <p className="acct-dlg__profile" lang="en">
                  {tile.head}
                </p>
              </div>
              <div className="acct-dlg__controls">
                {total > 1 && (
                  <>
                    <p className="acct-dlg__pos">{fill(labels.position, { n: index + 1, total })}</p>
                    <button type="button" className="acct-dlg__nav acct-dlg__prev" aria-label={fill(labels.prev, { game: at(-1).name })} onClick={() => switchBy(-1)}>
                      <span aria-hidden="true">‹</span>
                    </button>
                    <button type="button" className="acct-dlg__nav acct-dlg__next" aria-label={fill(labels.next, { game: at(1).name })} onClick={() => switchBy(1)}>
                      <span aria-hidden="true">›</span>
                    </button>
                  </>
                )}
                <button type="button" className="acct-dlg__close" data-initial-focus="" ref={closeRef} onClick={() => requestClose('button')}>
                  <span className="acct-dlg__close-x" aria-hidden="true">
                    ×
                  </span>
                  <span className="acct-dlg__close-label">{labels.close}</span>
                </button>
              </div>
              {/* the unsaved-changes notice (spec §3.2): in the sticky head, next to the close it holds */}
              {confirmClose && (
                <div className="acct-dlg__guard" role="group" aria-labelledby={guardId}>
                  <p id={guardId}>{labels.manage.unsaved}</p>
                  <button type="button" className="acct-dlg__guard-btn" onClick={discardAndClose}>
                    {labels.manage.discard}
                  </button>
                  <button type="button" className="acct-dlg__guard-btn" ref={keepRef} onClick={keepEditing}>
                    {labels.manage.keepEditing}
                  </button>
                </div>
              )}
              {/* the head's bracket line (spec §3.6 "머리 괄호 선": scaleX 0→1 from the left) */}
              <span className="acct-dlg__rule" aria-hidden="true" style={{ animationDelay: `${TL.rule[0]}ms`, animationDuration: `${TL.rule[1] - TL.rule[0]}ms` }} />
            </div>
            {/* a keyboard-focusable scroller (WCAG 2.1.1): a card without a link can still be scrolled from the keyboard */}
            <div className="acct-dlg__body" tabIndex={0} ref={bodyRef}>
              {/* The card region: the only part that changes on a switch (a 180 ms cross-fade). */}
              <div className="acct-dlg__cards">
                {outgoing !== null && outgoing.tile.card !== undefined && outgoing.tile.state === 'shown' && (
                  <div key={`out:${outgoing.tile.key}:${outgoing.seq}`} className="acct-dlg__card acct-dlg__card--out" aria-hidden="true" inert>
                    <AccountCard tile={outgoing.tile} card={outgoing.tile.card} labels={labels} lang={lang} mode="out" />
                  </div>
                )}
                <div key={`${tile.key}:${openSeq}`} className="acct-dlg__card" data-anim={anim}>
                  {card !== undefined ? (
                    <AccountCard
                      tile={tile}
                      card={card}
                      labels={labels}
                      lang={lang}
                      mode="dialog"
                      descId={descId}
                      countUp={countFor === tile.key}
                      intro={anim === 'intro'}
                      reduce={reduce}
                    />
                  ) : (
                    <p id="acct-title" className="acct-dlg__state">
                      {stateOf(tile)}
                    </p>
                  )}
                </div>
              </div>
              {/* The management region (spec §3.2 body 2): outside the card region, so a switch never remounts it, and
                  rendered while the dialog is closed, so the panel's session clock and run tracking keep going. */}
              {owner?.kind === 'manage' && (
                <div className="acct-dlg__manage" ref={regionRef}>
                  {Panel !== null && (
                    <Panel
                      lang={lang}
                      tiles={tiles}
                      steamButton={steamButton}
                      store={owner.store}
                      admin={owner.admin}
                      focus={panelFocus}
                      onDirtyChange={onDirtyChange}
                      current={tile.key}
                      loginError={loginError}
                      onBuildChip={setChip}
                    />
                  )}
                </div>
              )}
            </div>
            <p className="sr-only" role="status">
              {announce}
            </p>
          </div>
          {ghost !== null && <GhostFrame ghost={ghost} />}
        </dialog>
      )}
    </div>
  );
}
